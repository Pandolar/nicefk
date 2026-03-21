import { CheckCircleOutlined, ReloadOutlined } from '@ant-design/icons';
import { App, Button, Card, Col, Descriptions, Form, Input, Result, Row, Space, Typography } from 'antd';
import { useEffect, useMemo, useState } from 'react';
import { useParams, useSearchParams } from 'react-router-dom';
import { api, getErrorMessage, unwrap } from '../api/client';
import { DeliveredCardList } from '../components/DeliveredCardList';
import { PublicPage } from '../components/PublicPage';
import { StatusTag } from '../components/StatusTag';
import type { OrderInfo } from '../types';
import { formatCurrency, formatDateTime, normalizePayMethodLabel, orderStatusMeta } from '../utils/format';
import { saveRecentOrderRef } from '../utils/recentOrders';

export function OrderStatusPage() {
  const { orderNo: routeOrderNo = '' } = useParams();
  const [searchParams] = useSearchParams();
  const { modal, message } = App.useApp();
  const orderNo = routeOrderNo || searchParams.get('order_no') || searchParams.get('out_trade_no') || '';
  const [contact, setContact] = useState(localStorage.getItem(`nicefk-order-contact:${orderNo}`) ?? '');
  const [order, setOrder] = useState<OrderInfo | null>(null);
  const [checking, setChecking] = useState(false);

  async function fetchOrder() {
    if (!orderNo || !contact.trim()) {
      return;
    }
    try {
      const data = await unwrap<OrderInfo>(api.get(`/api/public/orders/${orderNo}`, { params: { buyer_contact: contact.trim() } }));
      setOrder(data);
      saveRecentOrderRef(data);
    } catch (error) {
      message.error(getErrorMessage(error, '订单查询失败'));
    }
  }

  useEffect(() => {
    if (!orderNo || !contact.trim()) {
      return;
    }
    fetchOrder();
    const timer = window.setInterval(fetchOrder, 5000);
    return () => window.clearInterval(timer);
  }, [contact, orderNo]);

  async function handleCheckPaid() {
    if (!orderNo) {
      message.warning('当前页面没有识别到订单号');
      return;
    }
    if (!contact.trim()) {
      message.warning('请先填写下单时使用的手机号或邮箱');
      return;
    }

    modal.confirm({
      title: '是否已经完成支付？',
      content: '确认后会立即向支付平台查单，并在查到成功后自动补发卡密。',
      okText: '立即检查',
      cancelText: '取消',
      onOk: async () => {
        setChecking(true);
        try {
          const data = await unwrap<OrderInfo>(api.post(`/api/public/orders/${orderNo}/check`, { buyer_contact: contact.trim() }));
          setOrder(data);
          saveRecentOrderRef(data);
          if (data.status === 'delivered') {
            message.success('支付已确认，卡密已更新到页面');
          } else {
            message.info('暂时还没有查到支付成功结果，请稍后再试');
          }
        } catch (error) {
          message.error(getErrorMessage(error, '支付检查失败，请稍后再试'));
        } finally {
          setChecking(false);
        }
      }
    });
  }

  const statusMeta = useMemo(() => orderStatusMeta(order?.status ?? 'pending'), [order?.status]);

  return (
    <PublicPage
      title="订单状态"
      pageTitle={orderNo ? `订单状态 ${orderNo}` : '订单状态'}
      subtitle="支付成功后页面会自动轮询状态，你也可以主动检查支付结果并补发卡密。"
    >
      <Row gutter={[20, 20]}>
        <Col xs={24} lg={9}>
          <Card title="订单信息" bordered={false}>
            <Form layout="vertical">
              <Form.Item label="订单号">
                <Input value={orderNo || '等待支付结果'} readOnly />
              </Form.Item>
              <Form.Item label="联系方式">
                <Input value={contact} onChange={(event) => setContact(event.target.value)} placeholder="请输入下单时填写的手机或邮箱" />
              </Form.Item>
            </Form>
            <Space direction="vertical" size={12} style={{ width: '100%' }}>
              <div>
                <Typography.Text type="secondary">当前状态</Typography.Text>
                <div style={{ marginTop: 8 }}>
                  <StatusTag status={order?.status ?? 'pending'} />
                </div>
              </div>
              <Button type="primary" icon={<CheckCircleOutlined />} onClick={handleCheckPaid} loading={checking} block>
                我已支付，立即检查
              </Button>
              <Button icon={<ReloadOutlined />} onClick={fetchOrder} block>
                刷新状态
              </Button>
              <Typography.Paragraph type="secondary" style={{ marginBottom: 0 }}>
                如果支付完成后页面还显示待支付，点击上面的按钮会主动向 ePay 查单并补发卡密。
              </Typography.Paragraph>
            </Space>
          </Card>
        </Col>

        <Col xs={24} lg={15}>
          <Space direction="vertical" size={20} style={{ width: '100%' }}>
            <Card bordered={false}>
              <Result
                status={statusMeta.color === 'success' ? 'success' : statusMeta.color === 'error' ? 'error' : 'info'}
                title={statusMeta.text}
                subTitle={order ? `订单金额 ￥${formatCurrency(order.amount)}，支付方式 ${normalizePayMethodLabel(order.pay_method)}` : '输入联系方式后即可查看最新状态'}
              />
            </Card>

            <Card title="订单明细" bordered={false}>
              <Descriptions column={{ xs: 1, md: 2 }} size="middle">
                <Descriptions.Item label="订单号">{order?.order_no ?? orderNo ?? '-'}</Descriptions.Item>
                <Descriptions.Item label="支付单号">{order?.trade_no ?? '-'}</Descriptions.Item>
                <Descriptions.Item label="购买数量">{order?.quantity ?? 1}</Descriptions.Item>
                <Descriptions.Item label="金额">￥{formatCurrency(order?.amount)}</Descriptions.Item>
                <Descriptions.Item label="支付方式">{order ? normalizePayMethodLabel(order.pay_method) : '-'}</Descriptions.Item>
                <Descriptions.Item label="创建时间">{formatDateTime(order?.created_at)}</Descriptions.Item>
                <Descriptions.Item label="发卡时间">{formatDateTime(order?.deliver_time)}</Descriptions.Item>
                <Descriptions.Item label="失败原因" span={2}>{order?.fail_reason ?? '-'}</Descriptions.Item>
              </Descriptions>
            </Card>

            <Card title="卡密结果" bordered={false}>
              {order?.status === 'delivered' ? (
                <DeliveredCardList snapshot={order.card_snapshot} />
              ) : (
                <Typography.Text type="secondary">支付成功后，卡密会自动展示在这里。</Typography.Text>
              )}
            </Card>
          </Space>
        </Col>
      </Row>
    </PublicPage>
  );
}
