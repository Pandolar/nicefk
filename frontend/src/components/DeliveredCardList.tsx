import { Card, Space, Typography } from 'antd';
import type { OrderInfo } from '../types';

export function DeliveredCardList({ snapshot }: { snapshot?: OrderInfo['card_snapshot'] }) {
  const items = Array.isArray(snapshot?.items) && snapshot.items.length
    ? snapshot.items
    : [{ card_code: snapshot?.card_code, card_secret: snapshot?.card_secret }];

  return (
    <Space direction="vertical" size={12} style={{ width: '100%' }}>
      {items.map((item, index) => (
        <Space key={`${item.card_code || 'card'}-${index}`} wrap>
          <TagCard label={`卡密 ${index + 1}`} value={item.card_code ?? '-'} />
          {item.card_secret ? <TagCard label={`密钥 ${index + 1}`} value={item.card_secret} /> : null}
        </Space>
      ))}
    </Space>
  );
}

function TagCard({ label, value }: { label: string; value: string }) {
  return (
    <Card size="small" className="compact-value-card">
      <Typography.Text type="secondary">{label}</Typography.Text>
      <Typography.Paragraph className="compact-value-card__value" copyable={{ text: value }}>
        {value}
      </Typography.Paragraph>
    </Card>
  );
}
