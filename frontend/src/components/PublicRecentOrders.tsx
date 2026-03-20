import { Card, Empty, List, Space, Typography } from 'antd';
import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api, unwrap } from '../api/client';
import type { OrderInfo } from '../types';
import { formatCurrency, formatDateTime, normalizePayMethodLabel } from '../utils/format';
import { readRecentOrderRefs, saveRecentOrderRef } from '../utils/recentOrders';
import { DeliveredCardList } from './DeliveredCardList';
import { StatusTag } from './StatusTag';

interface PublicRecentOrdersProps {
  title?: string;
  emptyText?: string;
}

export function PublicRecentOrders({
  title = '近期订单',
  emptyText = '当前浏览器还没有可展示的近期订单'
}: PublicRecentOrdersProps) {
  const [orders, setOrders] = useState<OrderInfo[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    let cancelled = false;

    async function loadRecentOrders() {
      const refs = readRecentOrderRefs();
      if (!refs.length) {
        setOrders([]);
        return;
      }
      setLoading(true);
      try {
        const results = await Promise.allSettled(
          refs.map((item) =>
            unwrap<OrderInfo>(
              api.get(`/api/public/orders/${item.order_no}`, {
                params: { buyer_contact: item.buyer_contact }
              })
            )
          )
        );
        if (cancelled) {
          return;
        }
        const rows = results
          .filter((item): item is PromiseFulfilledResult<OrderInfo> => item.status === 'fulfilled')
          .map((item) => item.value)
          .filter((item) => ['paid', 'delivered'].includes(item.status))
          .sort((left, right) => new Date(right.deliver_time || right.pay_time || right.created_at).getTime() - new Date(left.deliver_time || left.pay_time || left.created_at).getTime());
        rows.forEach((item) => saveRecentOrderRef(item));
        setOrders(rows);
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    loadRecentOrders();
    return () => {
      cancelled = true;
    };
  }, []);

  const content = (
    <List
      loading={loading}
      itemLayout="vertical"
      dataSource={orders}
      locale={{
        emptyText: <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={emptyText} />
      }}
      renderItem={(item) => (
        <List.Item key={`${item.order_no}-${item.buyer_contact}`}>
          <Space direction="vertical" size={12} style={{ width: '100%' }}>
            <Space align="center" style={{ justifyContent: 'space-between', width: '100%' }} wrap>
              <div>
                <Typography.Title level={5} style={{ margin: 0 }}>
                  {item.order_no}
                </Typography.Title>
                <Typography.Text type="secondary">{item.buyer_contact}</Typography.Text>
              </div>
              <StatusTag status={item.status} />
            </Space>
            <Space size={[16, 8]} wrap>
              <Typography.Text>数量 {item.quantity ?? 1}</Typography.Text>
              <Typography.Text>金额 ￥{formatCurrency(item.amount)}</Typography.Text>
              <Typography.Text>{normalizePayMethodLabel(item.pay_method)}</Typography.Text>
              <Typography.Text type="secondary">{formatDateTime(item.deliver_time || item.pay_time || item.created_at)}</Typography.Text>
            </Space>
            {item.status === 'delivered' ? <DeliveredCardList snapshot={item.card_snapshot} /> : null}
            <Link to={`/order/${item.order_no}`}>
              <Typography.Link>查看订单详情</Typography.Link>
            </Link>
          </Space>
        </List.Item>
      )}
    />
  );

  if (!title) {
    return content;
  }

  return (
    <Card title={title} bordered={false}>
      {content}
    </Card>
  );
}
