import { Tag } from 'antd';
import { orderStatusMeta } from '../utils/format';

interface StatusTagProps {
  status: string;
}

export function StatusTag({ status }: StatusTagProps) {
  const meta = orderStatusMeta(status);
  return <Tag color={meta.color}>{meta.text}</Tag>;
}
