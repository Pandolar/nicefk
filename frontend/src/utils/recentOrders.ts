import type { OrderInfo } from '../types';

const COOKIE_KEY = 'nicefk_recent_orders';
const MAX_RECENT_ORDERS = 8;
const COOKIE_MAX_AGE = 60 * 60 * 24 * 30;

export interface RecentOrderRef {
  order_no: string;
  buyer_contact: string;
  updated_at: string;
}

function encodeValue(value: RecentOrderRef[]) {
  return encodeURIComponent(JSON.stringify(value));
}

function decodeValue(value: string) {
  try {
    const parsed = JSON.parse(decodeURIComponent(value));
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function readRecentOrderRefs(): RecentOrderRef[] {
  if (typeof document === 'undefined') {
    return [];
  }
  const item = document.cookie
    .split('; ')
    .find((entry) => entry.startsWith(`${COOKIE_KEY}=`));
  if (!item) {
    return [];
  }
  const value = item.slice(COOKIE_KEY.length + 1);
  return decodeValue(value)
    .map((entry) => ({
      order_no: String(entry?.order_no || '').trim(),
      buyer_contact: String(entry?.buyer_contact || '').trim(),
      updated_at: String(entry?.updated_at || '').trim()
    }))
    .filter((entry) => entry.order_no && entry.buyer_contact);
}

export function saveRecentOrderRef(order: Pick<OrderInfo, 'order_no' | 'buyer_contact' | 'status' | 'deliver_time' | 'pay_time'>) {
  if (typeof document === 'undefined') {
    return;
  }
  if (!['paid', 'delivered'].includes(String(order.status || ''))) {
    return;
  }
  const nextItem: RecentOrderRef = {
    order_no: order.order_no,
    buyer_contact: order.buyer_contact,
    updated_at: order.deliver_time || order.pay_time || new Date().toISOString()
  };
  const merged = [
    nextItem,
    ...readRecentOrderRefs().filter((item) => !(item.order_no === nextItem.order_no && item.buyer_contact === nextItem.buyer_contact))
  ].slice(0, MAX_RECENT_ORDERS);
  document.cookie = `${COOKIE_KEY}=${encodeValue(merged)}; Max-Age=${COOKIE_MAX_AGE}; Path=/; SameSite=Lax`;
}
