export const phonePattern = /^1\d{10}$/;
export const emailPattern = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

export function toPlainText(value: unknown): string {
  if (value == null) {
    return '';
  }
  if (typeof value === 'string') {
    return value;
  }
  if (typeof value === 'number' || typeof value === 'boolean' || typeof value === 'bigint') {
    return String(value);
  }
  if (Array.isArray(value)) {
    return value.map((item) => toPlainText(item)).filter(Boolean).join(' ');
  }
  try {
    return JSON.stringify(value);
  } catch {
    return '';
  }
}

export function toSearchText(...values: unknown[]): string {
  return values
    .map((item) => toPlainText(item).trim())
    .filter(Boolean)
    .join(' ')
    .toLowerCase();
}

export function formatCurrency(value: string | number | null | undefined) {
  const amount = Number(value ?? 0);
  if (Number.isNaN(amount)) {
    return '0.00';
  }
  return amount.toFixed(2);
}

export function formatDateTime(value?: string | null) {
  if (!value) {
    return '-';
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return '-';
  }
  return date.toLocaleString('zh-CN');
}

export function maskSensitiveValue(value: unknown) {
  if (value == null) {
    return '-';
  }
  const text = typeof value === 'string' ? value : JSON.stringify(value);
  if (text.length <= 8) {
    return '******';
  }
  return `${text.slice(0, 3)}******${text.slice(-3)}`;
}

export function prettyConfigValue(value: unknown) {
  if (typeof value === 'string') {
    return value;
  }
  return JSON.stringify(value ?? '', null, 2);
}

export function normalizePayMethodLabel(method: unknown) {
  const text = toPlainText(method).trim();
  if (!text) {
    return '-';
  }
  const normalized = text.toLowerCase();
  if (normalized === 'alipay') return '支付宝';
  if (normalized === 'wxpay' || normalized === 'wechat') return '微信支付';
  if (normalized === 'qqpay') return 'QQ 钱包';
  return text;
}

export function normalizePayMethods(methods: unknown) {
  if (!Array.isArray(methods)) {
    return [];
  }
  return methods.map((item) => toPlainText(item).trim()).filter(Boolean);
}

export function normalizeContactType(contactType: unknown) {
  const value = toPlainText(contactType).trim();
  if (value === 'phone') return '仅手机号';
  if (value === 'email') return '仅邮箱';
  return '手机号或邮箱';
}

export function orderStatusMeta(status: string) {
  switch (status) {
    case 'delivered':
      return { color: 'success' as const, text: '已发卡' };
    case 'paid':
      return { color: 'processing' as const, text: '已支付' };
    case 'expired':
      return { color: 'default' as const, text: '已过期' };
    case 'failed':
      return { color: 'error' as const, text: '处理失败' };
    default:
      return { color: 'warning' as const, text: '待支付' };
  }
}
