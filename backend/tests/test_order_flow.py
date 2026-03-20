from decimal import Decimal

from backend.app.models.goods import Goods
from backend.app.models.order import Order
from backend.app.schemas.cdk import CdkImportRequest
from backend.app.services.cdk_service import CdkService
from backend.app.services.config_service import ConfigService
from backend.app.services.payments.epay import EpayService


def seed_goods_and_cards(db_session):
    goods = Goods(
        title='测试商品',
        slug='test-goods',
        cover='https://example.com/cover.jpg',
        description='用于自动化测试的商品',
        price=Decimal('9.90'),
        original_price=Decimal('19.90'),
        status='on',
        contact_type='both',
        pay_methods=['alipay', 'wxpay'],
        sort_order=10,
    )
    db_session.add(goods)
    db_session.commit()
    db_session.refresh(goods)
    CdkService(db_session).import_cards(
        CdkImportRequest(goods_id=goods.id, cards_text='CARD-001----PWD001\nCARD-002----PWD002')
    )
    return goods


def enable_epay(db_session):
    config = ConfigService(db_session)
    config.set('PAY_EPAY_PID', '1001')
    config.set('PAY_EPAY_KEY', 'secret-key')
    config.set('PAY_EPAY_API_URL', 'https://pay.example.com/')
    config.set('PAY_EPAY_SUBMIT_URL', 'https://pay.example.com/submit.php')
    config.set('PAY_EPAY_QUERY_URL', 'https://pay.example.com/api.php')
    return config


def sign_payload(db_session, payload):
    service = EpayService(db_session)
    signed = dict(payload)
    signed['sign'] = service._sign(signed, 'secret-key')
    signed['sign_type'] = 'MD5'
    return signed


import pytest


@pytest.mark.anyio
async def test_public_create_order_and_callback_deliver_card(client, db_session):
    goods = seed_goods_and_cards(db_session)
    enable_epay(db_session)

    visit_response = await client.post(
        f'/api/public/goods/{goods.id}/visit',
        json={
            'agent_code': 'agent_demo',
            'channel_code': 'blogger_demo',
            'visitor_id': 'visitor-001',
        },
    )
    assert visit_response.status_code == 200, visit_response.text

    response = await client.post(
        '/api/public/orders',
        json={
            'goods_id': goods.id,
            'buyer_contact': '13800138000',
            'payment_method': 'alipay',
            'agent_code': 'agent_demo',
            'channel_code': 'blogger_demo',
            'source_raw': {'channel': 'unit-test'},
        },
    )
    assert response.status_code == 200, response.text
    payload = response.json()['data']
    assert payload['status'] == 'pending'
    assert payload['payment']['submit_url'] == 'https://pay.example.com/submit.php'

    callback_payload = sign_payload(
        db_session,
        {
            'pid': '1001',
            'trade_no': 'TRADE10001',
            'out_trade_no': payload['order_no'],
            'type': 'alipay',
            'name': goods.title,
            'money': '9.90',
            'trade_status': 'TRADE_SUCCESS',
            'param': 'agent_demo|blogger_demo',
        },
    )
    notify_response = await client.post('/api/payments/epay/notify', data=callback_payload)
    assert notify_response.status_code == 200
    assert notify_response.text == 'success'

    detail_response = await client.get(
        f"/api/public/orders/{payload['order_no']}",
        params={'buyer_contact': '13800138000'},
    )
    assert detail_response.status_code == 200
    detail = detail_response.json()['data']
    assert detail['status'] == 'delivered'
    assert detail['card_snapshot']['card_code'] == 'CARD-001'
    assert detail['source_channel_code'] == 'blogger_demo'
    assert detail['source_channel_name'] == '演示博主'

    login_response = await client.post('/api/agent/auth/login', json={'username': 'agent_demo', 'password': 'Agent@123456'})
    assert login_response.status_code == 200
    token = login_response.json()['data']['token']
    channels_response = await client.get('/api/agent/channels', headers={'Authorization': f'Bearer {token}'})
    assert channels_response.status_code == 200
    channel = channels_response.json()['data'][0]
    assert channel['channel_code'] == 'blogger_demo'
    assert channel['visit_pv'] == 1
    assert channel['visit_uv'] == 1
    assert channel['order_count'] == 1
    assert channel['paid_count'] == 1
    assert channel['paid_amount'] == '9.90'


@pytest.mark.anyio
async def test_agent_only_sees_own_orders(client, db_session):
    goods = seed_goods_and_cards(db_session)
    enable_epay(db_session)

    agent_order = await client.post(
        '/api/public/orders',
        json={
            'goods_id': goods.id,
            'buyer_contact': '13800138000',
            'payment_method': 'alipay',
            'agent_code': 'agent_demo',
        },
    )
    order_no = agent_order.json()['data']['order_no']
    await client.post(
        '/api/public/orders',
        json={
            'goods_id': goods.id,
            'buyer_contact': 'buyer@example.com',
            'payment_method': 'alipay',
        },
    )

    from backend.app.services.order_service import OrderService

    OrderService(db_session).process_paid_order(order_no, 'TRADE-AGENT-001', {'status': 1})

    login_response = await client.post('/api/agent/auth/login', json={'username': 'agent_demo', 'password': 'Agent@123456'})
    assert login_response.status_code == 200
    token = login_response.json()['data']['token']

    orders_response = await client.get('/api/agent/orders', headers={'Authorization': f'Bearer {token}'})
    assert orders_response.status_code == 200
    rows = orders_response.json()['data']
    assert len(rows) == 1
    assert rows[0]['agent_code'] == 'agent_demo'


@pytest.mark.anyio
async def test_reconcile_expires_old_pending_order(client, db_session, monkeypatch):
    goods = seed_goods_and_cards(db_session)
    enable_epay(db_session)

    response = await client.post(
        '/api/public/orders',
        json={
            'goods_id': goods.id,
            'buyer_contact': 'expire@example.com',
            'payment_method': 'alipay',
        },
    )
    order_no = response.json()['data']['order_no']
    order = db_session.query(Order).filter(Order.order_no == order_no).first()
    assert order is not None
    order.created_at = order.created_at.replace(year=order.created_at.year - 1)
    db_session.commit()

    monkeypatch.setattr('backend.app.services.payments.epay.EpayService.query_order', lambda self, order_no: {'code': 0, 'status': 0})
    from backend.app.services.order_service import OrderService

    summary = OrderService(db_session).reconcile_pending_orders()
    assert summary['expired'] == 1
    db_session.refresh(order)
    assert order.status == 'expired'


@pytest.mark.anyio
async def test_admin_can_manage_agents_and_filter_cards(client, db_session):
    goods = seed_goods_and_cards(db_session)

    login_response = await client.post('/api/admin/auth/login', json={'username': 'admin', 'password': 'Admin@123456'})
    assert login_response.status_code == 200
    token = login_response.json()['data']['token']
    headers = {'Authorization': f'Bearer {token}'}

    cards_response = await client.get('/api/admin/cdks', headers=headers, params={'goods_id': goods.id, 'status': 'unused'})
    assert cards_response.status_code == 200
    assert len(cards_response.json()['data']) == 2

    create_response = await client.post(
        '/api/admin/agents',
        headers=headers,
        json={
            'agent_code': 'agent_new',
            'agent_name': '新代理',
            'username': 'agent_new',
            'password': 'Agent@123456',
            'status': 1,
            'allowed_goods_ids': [goods.id],
        },
    )
    assert create_response.status_code == 200, create_response.text
    assert create_response.json()['data']['agent_code'] == 'agent_new'


@pytest.mark.anyio
async def test_agent_can_create_own_channel(client, db_session):
    goods = seed_goods_and_cards(db_session)

    login_response = await client.post('/api/agent/auth/login', json={'username': 'agent_demo', 'password': 'Agent@123456'})
    assert login_response.status_code == 200
    token = login_response.json()['data']['token']
    agent_code = login_response.json()['data']['agent_code']
    headers = {'Authorization': f'Bearer {token}'}

    create_response = await client.post(
        '/api/agent/channels',
        headers=headers,
        json={
            'agent_code': agent_code,
            'channel_code': 'agent_self_new',
            'channel_name': '代理自建渠道',
            'promoter_name': '博主A',
            'goods_id': goods.id,
            'status': 1,
            'note': 'agent created',
        },
    )
    assert create_response.status_code == 200, create_response.text
    assert create_response.json()['data']['channel_code'] == 'agent_self_new'

    rows_response = await client.get('/api/agent/channels', headers=headers)
    assert rows_response.status_code == 200
    channel_codes = [item['channel_code'] for item in rows_response.json()['data']]
    assert 'agent_self_new' in channel_codes


@pytest.mark.anyio
async def test_epay_api_url_fallback_and_trade_finished_callback(client, db_session):
    goods = seed_goods_and_cards(db_session)
    config = enable_epay(db_session)
    config.set('PAY_EPAY_SUBMIT_URL', '')
    config.set('PAY_EPAY_QUERY_URL', '')

    response = await client.post(
        '/api/public/orders',
        json={
            'goods_id': goods.id,
            'buyer_contact': 'buyer@example.com',
            'payment_method': 'wechat',
            'device': 'mobile',
        },
    )
    assert response.status_code == 200, response.text
    payload = response.json()['data']
    assert payload['payment']['submit_url'] == 'https://pay.example.com/submit.php'
    assert payload['payment']['fields']['type'] == 'wxpay'
    assert payload['payment']['fields']['device'] == 'mobile'

    callback_payload = sign_payload(
        db_session,
        {
            'pid': '1001',
            'trade_no': 'TRADE10002',
            'out_trade_no': payload['order_no'],
            'type': 'wxpay',
            'name': goods.title,
            'money': '9.90',
            'trade_status': 'TRADE_FINISHED',
        },
    )
    notify_response = await client.post('/api/payments/epay/notify', data=callback_payload)
    assert notify_response.status_code == 200
    assert notify_response.text == 'success'

    detail_response = await client.get(
        f"/api/public/orders/{payload['order_no']}",
        params={'buyer_contact': 'buyer@example.com'},
    )
    assert detail_response.status_code == 200
    assert detail_response.json()['data']['status'] == 'delivered'


@pytest.mark.anyio
async def test_public_manual_check_can_finish_paid_order_without_callback(client, db_session, monkeypatch):
    goods = seed_goods_and_cards(db_session)
    enable_epay(db_session)

    response = await client.post(
        '/api/public/orders',
        json={
            'goods_id': goods.id,
            'buyer_contact': 'manual-check@example.com',
            'payment_method': 'alipay',
        },
    )
    order_no = response.json()['data']['order_no']

    monkeypatch.setattr(
        'backend.app.services.payments.epay.EpayService.query_order',
        lambda self, _: {'code': 1, 'status': 1, 'trade_no': 'TRADE-MANUAL-001'},
    )

    check_response = await client.post(
        f'/api/public/orders/{order_no}/check',
        json={'buyer_contact': 'manual-check@example.com'},
    )
    assert check_response.status_code == 200, check_response.text
    data = check_response.json()['data']
    assert data['status'] == 'delivered'
    assert data['trade_no'] == 'TRADE-MANUAL-001'


@pytest.mark.anyio
async def test_public_search_orders_by_contact_or_order_no(client, db_session):
    goods = seed_goods_and_cards(db_session)
    enable_epay(db_session)

    response = await client.post(
        '/api/public/orders',
        json={
            'goods_id': goods.id,
            'buyer_contact': 'lookup@example.com',
            'payment_method': 'alipay',
        },
    )
    order_no = response.json()['data']['order_no']

    by_contact = await client.post('/api/public/orders/search', json={'buyer_contact': 'lookup@example.com'})
    assert by_contact.status_code == 200
    assert len(by_contact.json()['data']) == 1
    assert by_contact.json()['data'][0]['order_no'] == order_no

    by_order = await client.post('/api/public/orders/search', json={'order_no': order_no})
    assert by_order.status_code == 200
    assert by_order.json()['data'][0]['buyer_contact'] == 'lookup@example.com'


@pytest.mark.anyio
async def test_public_create_multi_quantity_order_and_deliver_multiple_cards(client, db_session):
    goods = seed_goods_and_cards(db_session)
    enable_epay(db_session)

    response = await client.post(
        '/api/public/orders',
        json={
            'goods_id': goods.id,
            'buyer_contact': 'multi@example.com',
            'quantity': 2,
            'payment_method': 'alipay',
        },
    )
    assert response.status_code == 200, response.text
    payload = response.json()['data']
    assert payload['amount'] == '19.80'

    callback_payload = sign_payload(
        db_session,
        {
            'pid': '1001',
            'trade_no': 'TRADE-MULTI-001',
            'out_trade_no': payload['order_no'],
            'type': 'alipay',
            'name': goods.title,
            'money': '19.80',
            'trade_status': 'TRADE_SUCCESS',
        },
    )
    notify_response = await client.post('/api/payments/epay/notify', data=callback_payload)
    assert notify_response.status_code == 200
    assert notify_response.text == 'success'

    detail_response = await client.get(
        f"/api/public/orders/{payload['order_no']}",
        params={'buyer_contact': 'multi@example.com'},
    )
    assert detail_response.status_code == 200
    detail = detail_response.json()['data']
    assert detail['status'] == 'delivered'
    assert detail['quantity'] == 2
    assert len(detail['card_snapshot']['items']) == 2
    assert detail['card_snapshot']['items'][0]['card_code'] == 'CARD-001'
    assert detail['card_snapshot']['items'][1]['card_code'] == 'CARD-002'
