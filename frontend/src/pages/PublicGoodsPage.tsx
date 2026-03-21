import {
  AlipayCircleOutlined,
  NotificationOutlined,
  SearchOutlined,
  ShoppingCartOutlined,
  TagsOutlined
} from '@ant-design/icons';
import { WechatOutlined } from '@ant-design/icons';
import { App, Button, Card, Col, Form, Image, Input, InputNumber, Row, Space, Typography } from 'antd';
import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { api, getErrorMessage, unwrap } from '../api/client';
import { MarkdownBlock } from '../components/MarkdownBlock';
import { PublicPage } from '../components/PublicPage';
import type { GoodsItem, SiteInfo } from '../types';
import { AGENT_CODE_KEY, CHANNEL_CODE_KEY } from '../utils/auth';
import { emailPattern, normalizePayMethodLabel, normalizePayMethods, phonePattern } from '../utils/format';

interface OrderCreateForm {
  buyer_contact: string;
  payment_method: string;
}

export function PublicGoodsPage() {
  const { goodsId = '1' } = useParams();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { message } = App.useApp();
  const [form] = Form.useForm<OrderCreateForm>();
  const [site, setSite] = useState<SiteInfo | null>(null);
  const [goods, setGoods] = useState<GoodsItem | null>(null);
  const [loading, setLoading] = useState(false);
  const [submittingMethod, setSubmittingMethod] = useState<string>();
  const [agentCode, setAgentCode] = useState<string | undefined>();
  const [channelCode, setChannelCode] = useState<string | undefined>();
  const [quantity, setQuantity] = useState(1);
  const goodsPath = useMemo(() => {
    const query = searchParams.toString();
    return `/goods/${goodsId}${query ? `?${query}` : ''}`;
  }, [goodsId, searchParams]);

  useEffect(() => {
    localStorage.setItem('nicefk-last-public-goods-path', goodsPath);
  }, [goodsPath]);

  useEffect(() => {
    const nextAgentCode = searchParams.get('agent_code') || localStorage.getItem(AGENT_CODE_KEY) || undefined;
    const nextChannelCode = searchParams.get('channel_code') || localStorage.getItem(CHANNEL_CODE_KEY) || undefined;
    if (nextAgentCode) {
      localStorage.setItem(AGENT_CODE_KEY, nextAgentCode);
      setAgentCode(nextAgentCode);
    }
    if (nextChannelCode) {
      localStorage.setItem(CHANNEL_CODE_KEY, nextChannelCode);
      setChannelCode(nextChannelCode);
    }
  }, [searchParams]);

  useEffect(() => {
    let cancelled = false;

    async function loadPage() {
      try {
        const [siteData, goodsData] = await Promise.all([
          unwrap<SiteInfo>(api.get('/api/public/site')),
          unwrap<GoodsItem>(api.get(`/api/public/goods/${goodsId}`))
        ]);
        if (cancelled) {
          return;
        }
        const methods = normalizePayMethods(goodsData.pay_methods);
        setSite(siteData);
        setGoods({
          ...goodsData,
          pay_methods: methods
        });
        form.setFieldValue('payment_method', methods[0] ?? undefined);
        setQuantity(1);
      } catch (error) {
        if (!cancelled) {
          message.error(getErrorMessage(error, '商品页加载失败'));
        }
      }
    }

    loadPage();
    return () => {
      cancelled = true;
    };
  }, [goodsId]);

  useEffect(() => {
    if (!goodsId || !agentCode || !channelCode) {
      return;
    }
    const visitorKey = 'nicefk-visitor-id';
    let visitorId = localStorage.getItem(visitorKey);
    if (!visitorId) {
      visitorId = `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
      localStorage.setItem(visitorKey, visitorId);
    }
    api
      .post(`/api/public/goods/${goodsId}/visit`, {
        agent_code: agentCode,
        channel_code: channelCode,
        visitor_id: visitorId
      })
      .catch(() => undefined);
  }, [agentCode, channelCode, goodsId]);

  const paymentOptions = useMemo(() => {
    const methods = normalizePayMethods(goods?.pay_methods);
    return methods.filter((method) => ['alipay', 'wxpay'].includes(method.toLowerCase()));
  }, [goods?.pay_methods]);

  const stockDisplay = useMemo(() => {
    if (!goods) {
      return { text: '库存加载中', tone: 'neutral' };
    }
    if (goods.stock_display_mode === 'custom') {
      return {
        text: goods.stock_display_text || '即将售罄',
        tone: 'warn'
      };
    }
    if ((goods.available_stock ?? 0) <= 0) {
      return { text: '剩余库存 0', tone: 'empty' };
    }
    if ((goods.available_stock ?? 0) <= 10) {
      return { text: `剩余库存 ${goods.available_stock}`, tone: 'warn' };
    }
    return { text: `剩余库存 ${goods.available_stock}`, tone: 'ready' };
  }, [goods]);

  const unitPriceText = useMemo(() => `¥${Number(goods?.price ?? 0).toFixed(2)}`, [goods?.price]);
  const amountText = useMemo(() => `¥${(Number(goods?.price ?? 0) * Number(quantity || 1)).toFixed(2)}`, [goods?.price, quantity]);
  const contactPlaceholder = useMemo(() => {
    if (goods?.contact_type === 'email') {
      return '请正确输入邮箱';
    }
    if (goods?.contact_type === 'phone') {
      return '请正确输入手机号';
    }
    return '请输入正确的手机号或邮箱';
  }, [goods?.contact_type]);
  const contactInputMode = goods?.contact_type === 'phone' ? 'numeric' : goods?.contact_type === 'email' ? 'email' : 'text';

  function validateContact(value?: string) {
    const normalized = value?.trim() ?? '';
    const emptyMessage = goods?.contact_type === 'email' ? '请输入邮箱' : goods?.contact_type === 'phone' ? '请输入手机号' : '请输入手机号或邮箱';
    const invalidMessage =
      goods?.contact_type === 'email'
        ? '请正确输入邮箱'
        : goods?.contact_type === 'phone'
          ? '请正确输入手机号'
          : '请输入正确的手机号或邮箱';
    if (!normalized) {
      return Promise.reject(new Error(emptyMessage));
    }
    if (!phonePattern.test(normalized) && !emailPattern.test(normalized)) {
      return Promise.reject(new Error(invalidMessage));
    }
    if (goods?.contact_type === 'phone' && !phonePattern.test(normalized)) {
      return Promise.reject(new Error('请正确输入手机号'));
    }
    if (goods?.contact_type === 'email' && !emailPattern.test(normalized)) {
      return Promise.reject(new Error('请正确输入邮箱'));
    }
    return Promise.resolve();
  }

  async function handleFinish(values: OrderCreateForm) {
    setLoading(true);
    setSubmittingMethod(values.payment_method);
    try {
      const device = /mobile|android|iphone|ipad/i.test(window.navigator.userAgent) ? 'mobile' : 'pc';
      const order = await unwrap<{ order_no: string; payment: { submit_url: string; method: string; fields: Record<string, string> } }>(
        api.post('/api/public/orders', {
          goods_id: Number(goodsId),
          buyer_contact: values.buyer_contact.trim(),
          quantity: Number(quantity || 1),
          payment_method: values.payment_method,
          device,
          agent_code: agentCode,
          channel_code: channelCode,
          source_raw: {
            referrer: document.referrer || null,
            agent_code: agentCode || null,
            channel_code: channelCode || null
          }
        })
      );

      localStorage.setItem(`nicefk-order-contact:${order.order_no}`, values.buyer_contact.trim());

      const submitForm = document.createElement('form');
      submitForm.method = order.payment.method;
      submitForm.action = order.payment.submit_url;
      Object.entries(order.payment.fields).forEach(([key, value]) => {
        const input = document.createElement('input');
        input.type = 'hidden';
        input.name = key;
        input.value = String(value);
        submitForm.appendChild(input);
      });
      document.body.appendChild(submitForm);
      navigate(`/order/${order.order_no}`);
      submitForm.submit();
    } catch (error) {
      message.error(getErrorMessage(error, '创建订单失败，请稍后再试'));
    } finally {
      setLoading(false);
      setSubmittingMethod(undefined);
    }
  }

  async function handlePay(method: string) {
    try {
      const values = await form.validateFields();
      await handleFinish({
        buyer_contact: values.buyer_contact,
        payment_method: method
      });
    } catch {
      return;
    }
  }

  function renderPayButton(method: string) {
    const normalized = method.toLowerCase();
    const isAlipay = normalized === 'alipay';
    const icon = isAlipay ? <AlipayCircleOutlined /> : <WechatOutlined />;
    const className = isAlipay ? 'pay-action-button pay-action-button--alipay' : 'pay-action-button pay-action-button--wxpay';
    return (
      <Button
        key={method}
        size="large"
        className={className}
        icon={icon}
        loading={loading && submittingMethod === method}
        onClick={() => handlePay(method)}
      >
        {normalizePayMethodLabel(method)}
      </Button>
    );
  }

  return (
    <PublicPage
      brand={site?.site_name || undefined}
      pageTitle={goods?.title || '商品页面'}
      extra={
        <Link to={`/orders/query?return_to=${encodeURIComponent(goodsPath)}`}>
          <Button type="primary" icon={<SearchOutlined />}>
            查询订单
          </Button>
        </Link>
      }
    >
      <Space direction="vertical" size={18} style={{ width: '100%' }}>
        <Card className="public-section-card public-section-card--notice" bordered={false}>
          <Space align="start" size={14}>
            <NotificationOutlined className="public-section-card__icon" />
            <div>
              <Typography.Title level={5} style={{ marginTop: 0, marginBottom: 8 }}>
                全站公告
              </Typography.Title>
              <MarkdownBlock content={site?.notice || '请确认联系方式填写正确，支付成功后系统会自动发货。'} className="markdown-block" />
            </div>
          </Space>
        </Card>

        <Card className="public-section-card public-product-card" bordered={false}>
          <Row gutter={[{ xs: 0, sm: 24, lg: 24 }, 24]} align="middle">
            <Col xs={24} lg={10}>
              {goods?.cover ? (
                <Image src={goods.cover} alt={goods.title} preview={false} className="goods-cover" />
              ) : (
                <div className="goods-cover goods-cover--placeholder">
                  <ShoppingCartOutlined style={{ fontSize: 42, marginBottom: 12 }} />
                  <span>商品封面</span>
                </div>
              )}
            </Col>
            <Col xs={24} lg={14}>
              <Space direction="vertical" size={18} style={{ width: '100%' }}>
                <div>
                  <Typography.Title level={2} className="public-product-card__title">
                    {goods?.title || '商品详情'}
                  </Typography.Title>
                </div>
                <MarkdownBlock content={goods?.description || '暂无商品说明。'} className="markdown-block" />
                <Form form={form} layout="vertical" initialValues={{ payment_method: paymentOptions[0] }}>
                  <div className="product-detail-list">
                    <div className="product-detail-row product-detail-row--unit">
                      <span className="product-detail-row__label">商品单价：</span>
                      <div className="product-detail-row__value">
                        <Typography.Text className="price-pill__current">{unitPriceText}</Typography.Text>
                        {goods?.original_price ? (
                          <Typography.Text delete className="price-pill__original">
                            ¥{Number(goods.original_price).toFixed(2)}
                          </Typography.Text>
                        ) : null}
                      </div>
                    </div>
                    <div className="product-detail-row">
                      <span className="product-detail-row__label">发货方式：</span>
                      <div className="product-detail-row__value">自动发货</div>
                    </div>
                    <div className="product-detail-row">
                      <span className="product-detail-row__label">联系方式：</span>
                      <div className="product-detail-row__value product-detail-row__value--full">
                        <Form.Item
                          name="buyer_contact"
                          rules={[{ validator: (_, value) => validateContact(value) }]}
                          className="product-contact-field"
                        >
                          <Input size="large" placeholder={contactPlaceholder} allowClear inputMode={contactInputMode} />
                        </Form.Item>
                      </div>
                    </div>
                    <div className="product-detail-row">
                      <span className="product-detail-row__label">购买数量：</span>
                      <div className="product-detail-row__value">
                        <div className="product-quantity-field">
                          <InputNumber
                            value={quantity}
                            min={1}
                            max={Math.max(goods?.available_stock ?? 1, 1)}
                            controls
                            size="large"
                            onChange={(value) => {
                              const next = Math.max(1, Number(value || 1));
                              setQuantity(next);
                            }}
                          />
                        </div>
                      </div>
                    </div>
                    <div className="product-detail-row">
                      <span className="product-detail-row__label">{goods?.stock_display_mode === 'custom' ? '库存状态：' : '剩余库存：'}</span>
                      <div className="product-detail-row__value">
                        <span className={`stock-badge stock-badge--${stockDisplay.tone}`}>
                          <TagsOutlined />
                          {stockDisplay.text}
                        </span>
                      </div>
                    </div>
                    <div className="product-detail-row product-detail-row--amount">
                      <span className="product-detail-row__label">订单金额：</span>
                      <div className="product-detail-row__value">
                        <Typography.Text className="price-pill__current">{amountText}</Typography.Text>
                      </div>
                    </div>
                  </div>

                  <div className="product-pay-section">
                    <Space wrap className="pay-action-group">
                      {paymentOptions.map((method) => renderPayButton(method))}
                    </Space>
                    {!paymentOptions.length ? (
                      <Typography.Text type="secondary">当前商品暂未配置可用支付方式，请先在后台商品配置中开启。</Typography.Text>
                    ) : null}
                  </div>
                </Form>
              </Space>
            </Col>
          </Row>
        </Card>
      </Space>
    </PublicPage>
  );
}
