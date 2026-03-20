export interface ApiResponse<T> {
  message: string;
  data: T;
}

export interface GoodsItem {
  id: number;
  title: string;
  slug?: string | null;
  cover?: string | null;
  description: string;
  price: string;
  original_price?: string | null;
  status: string;
  contact_type: string;
  pay_methods: string[];
  stock_display_mode?: string;
  stock_display_text?: string | null;
  email_enabled?: boolean;
  email_subject_template?: string | null;
  email_body_template?: string | null;
  sort_order: number;
  available_stock: number;
}

export interface SiteInfo {
  site_name: string;
  notice: string;
  footer: string;
  site_url: string;
  extra_js?: string;
}

export interface OrderInfo {
  order_no: string;
  trade_no?: string | null;
  goods_id: number;
  buyer_contact: string;
  contact_type?: string;
  quantity?: number;
  amount: string;
  pay_method: string;
  status: string;
  card_snapshot?: {
    card_code?: string;
    card_secret?: string | null;
    quantity?: number;
    items?: Array<{
      card_code?: string;
      card_secret?: string | null;
    }>;
  } | null;
  agent_code?: string | null;
  agent_name?: string | null;
  source_channel_code?: string | null;
  source_channel_name?: string | null;
  created_at: string;
  pay_time?: string | null;
  deliver_time?: string | null;
  expire_time?: string | null;
  fail_reason?: string | null;
  email_status?: string | null;
  email_sent_at?: string | null;
  email_error?: string | null;
}

export interface ConfigItem {
  config_key: string;
  config_value: string | number | boolean | Record<string, unknown> | unknown[] | null;
  config_type: string;
  group_name: string;
  description?: string | null;
  is_sensitive: boolean;
}

export interface CdkItem {
  id: number;
  goods_id: number;
  card_code: string;
  card_secret?: string | null;
  status: string;
  order_id?: number | null;
  locked_at?: string | null;
  sold_at?: string | null;
}

export interface AgentAccount {
  agent_code: string;
  agent_name: string;
  username: string;
  status: number;
  allowed_goods_ids: number[];
}

export interface ChannelItem {
  agent_code: string;
  channel_code: string;
  channel_name: string;
  promoter_name?: string | null;
  created_at?: string | null;
  goods_id?: number | null;
  status: number;
  note?: string | null;
  visit_pv: number;
  visit_uv: number;
  order_count: number;
  paid_count: number;
  paid_amount: string;
  promo_link?: string | null;
}

export interface LoginResult {
  token: string;
  role: string;
  display_name: string;
  agent_code?: string | null;
}

export interface DashboardSummary {
  total_orders?: number;
  paid_orders?: number;
  total_amount?: string | number;
  goods_count?: number;
  card_count?: number;
}

export interface AgentDashboardSummary extends DashboardSummary {
  agent_code?: string;
  display_name?: string;
  channel_count?: number;
  site_url?: string;
  allowed_goods_ids?: number[];
  channels?: ChannelItem[];
}
