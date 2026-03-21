import { SearchOutlined } from '@ant-design/icons';
import { App, Button, Card, Col, Form, Input, List, Row, Space, Typography } from 'antd';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { api, getErrorMessage, unwrap } from '../api/client';
import { DeliveredCardList } from '../components/DeliveredCardList';
import { MarkdownBlock } from '../components/MarkdownBlock';
import { PublicPage } from '../components/PublicPage';
import { PublicRecentOrders } from '../components/PublicRecentOrders';
import { StatusTag } from '../components/StatusTag';
import type { OrderInfo } from '../types';
import { emailPattern, formatCurrency, formatDateTime, normalizePayMethodLabel, phonePattern } from '../utils/format';
import { saveRecentOrderRef } from '../utils/recentOrders';

interface SearchForm {
  query?: string;
}

export function OrderSearchPage() {
  const { message } = App.useApp();
  const [searchParams] = useSearchParams();
  const [form] = Form.useForm<SearchForm>();
  const [orders, setOrders] = useState<OrderInfo[]>([]);
  const [loading, setLoading] = useState(false);
  const deliveryRef = useRef<HTMLDivElement | null>(null);
  const autoScrollMarkerRef = useRef('');
  const returnPath = useMemo(() => {
    const candidate = searchParams.get('return_to') || localStorage.getItem('nicefk-last-public-goods-path') || '/goods/1';
    return candidate.startsWith('/goods/') ? candidate : '/goods/1';
  }, [searchParams]);

  useEffect(() => {
    const delivered = orders.find((item) => item.status === 'delivered');
    if (!delivered || !deliveryRef.current) {
      return;
    }
    const marker = `${delivered.order_no}:${delivered.deliver_time || delivered.pay_time || 'done'}`;
    if (autoScrollMarkerRef.current === marker) {
      return;
    }
    autoScrollMarkerRef.current = marker;
    window.requestAnimationFrame(() => {
      deliveryRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
  }, [orders]);

  async function handleSearch(values: SearchForm) {
    const query = values.query?.trim();
    if (!query) {
      message.warning('请填写订单号或手机号/邮箱');
      return;
    }
    const isContact = phonePattern.test(query) || emailPattern.test(query);

    setLoading(true);
    try {
      const data = await unwrap<OrderInfo[]>(
        api.post('/api/public/orders/search', {
          order_no: isContact ? undefined : query,
          buyer_contact: isContact ? query : undefined
        })
      );
      data.forEach((item) => saveRecentOrderRef(item));
      setOrders(data);
    } catch (error) {
      setOrders([]);
      message.error(getErrorMessage(error, '订单查询失败'));
    } finally {
      setLoading(false);
    }
  }

  return (
    <PublicPage
      title="查询订单"
      pageTitle="查询订单"
      subtitle="支持按订单号或手机号/邮箱查询订单状态，已发卡订单会直接展示卡密结果。"
      extra={
        <Link to={returnPath}>
          <Button>返回商品页</Button>
        </Link>
      }
    >
      <Row gutter={[20, 20]}>
        <Col xs={24} lg={7}>
          <Card title="查询条件" bordered={false}>
            <Form form={form} layout="vertical" onFinish={handleSearch}>
              <Form.Item label="订单号 / 手机号 / 邮箱" name="query">
                <Input placeholder="请输入订单号、手机号或邮箱" allowClear />
              </Form.Item>
              <Button type="primary" htmlType="submit" icon={<SearchOutlined />} loading={loading} block>
                立即查询
              </Button>
            </Form>
          </Card>
        </Col>

        <Col xs={24} lg={17} ref={deliveryRef}>
          <Card title={orders.length ? '查询结果' : '近期订单'} bordered={false}>
            {orders.length ? (
              <List
                itemLayout="vertical"
                dataSource={orders}
                renderItem={(item) => (
                  <List.Item key={item.order_no}>
                    <Space direction="vertical" size={12} style={{ width: '100%' }}>
                      <Row justify="space-between" align="middle" gutter={[12, 12]}>
                        <Col>
                          <Typography.Title level={5} style={{ margin: 0 }}>
                            {item.order_no}
                          </Typography.Title>
                          <Typography.Text type="secondary">联系方式：{item.buyer_contact}</Typography.Text>
                        </Col>
                        <Col>
                          <StatusTag status={item.status} />
                        </Col>
                      </Row>
                      <Row gutter={[12, 12]}>
                        <Col xs={24} md={12}>数量：{item.quantity ?? 1}</Col>
                        <Col xs={24} md={12}>金额：￥{formatCurrency(item.amount)}</Col>
                        <Col xs={24} md={12}>支付方式：{normalizePayMethodLabel(item.pay_method)}</Col>
                        <Col xs={24} md={12}>下单时间：{formatDateTime(item.created_at)}</Col>
                        <Col xs={24} md={12}>发卡时间：{formatDateTime(item.deliver_time)}</Col>
                      </Row>
                      {item.status === 'delivered' ? (
                        <Space direction="vertical" size={16} style={{ width: '100%' }}>
                          <DeliveredCardList snapshot={item.card_snapshot} />
                          {item.delivery_instructions ? (
                            <div>
                              <Typography.Title level={5} style={{ marginTop: 0 }}>
                                发货说明
                              </Typography.Title>
                              <MarkdownBlock content={item.delivery_instructions} />
                            </div>
                          ) : null}
                        </Space>
                      ) : (
                        <Typography.Text type="secondary">
                          当前订单还没有发卡，如已支付可前往
                          <Link to={`/order/${item.order_no}`}> 订单状态页 </Link>
                          继续检查。
                        </Typography.Text>
                      )}
                    </Space>
                  </List.Item>
                )}
              />
            ) : (
              <PublicRecentOrders title="" emptyText="当前浏览器还没有近期订单，支付成功后会自动记录在这里。" />
            )}
          </Card>
        </Col>
      </Row>
    </PublicPage>
  );
}
