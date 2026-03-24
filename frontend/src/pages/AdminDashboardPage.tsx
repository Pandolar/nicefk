import {
  AppstoreOutlined,
  CreditCardOutlined,
  LogoutOutlined,
  MenuOutlined,
  NotificationOutlined,
  QrcodeOutlined,
  ReloadOutlined,
  SettingOutlined,
  ShopOutlined,
  TeamOutlined,
  TagsOutlined
} from '@ant-design/icons';
import {
  DrawerForm,
  ModalForm,
  PageContainer,
  ProCard,
  ProFormDependency,
  ProFormDigit,
  ProFormSelect,
  ProFormSwitch,
  ProFormText,
  ProFormTextArea,
  ProTable,
  type ProColumns
} from '@ant-design/pro-components';
import {
  App,
  Button,
  Col,
  Descriptions,
  Drawer,
  Form,
  Grid,
  Input,
  InputNumber,
  Layout,
  List,
  Menu,
  Progress,
  Row,
  Space,
  Statistic,
  Switch,
  Tag,
  Tabs,
  Typography
} from 'antd';
import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { api, authHeaders, getErrorMessage, unwrap } from '../api/client';
import { ChannelQrModal } from '../components/ChannelQrModal';
import { StatusTag } from '../components/StatusTag';
import type { AgentAccount, CdkItem, ChannelItem, ConfigItem, DashboardSummary, GoodsItem, OrderInfo } from '../types';
import { ADMIN_TOKEN_KEY, clearAdminSession } from '../utils/auth';
import { buildConsolePageTitle } from '../utils/pageTitle';
import {
  formatCurrency,
  formatDateTime,
  normalizePayMethodLabel,
  normalizePayMethods,
  prettyConfigValue,
  toPlainText,
  toSearchText
} from '../utils/format';

const { Header, Sider, Content } = Layout;

const menuItems = [
  { key: 'overview', icon: <AppstoreOutlined />, label: '总览', hint: '查看支付、库存与渠道的核心数据' },
  { key: 'goods', icon: <ShopOutlined />, label: '商品管理', hint: '管理商品信息、支付方式与展示状态' },
  { key: 'cards', icon: <CreditCardOutlined />, label: '卡密管理', hint: '批量导入卡密并查看占用情况' },
  { key: 'orders', icon: <NotificationOutlined />, label: '订单管理', hint: '查看订单状态、支付方式与渠道归因' },
  { key: 'agents', icon: <TeamOutlined />, label: '代理管理', hint: '维护代理账号与可推广商品范围' },
  { key: 'channels', icon: <TagsOutlined />, label: '来源渠道', hint: '统计渠道访问、下单与支付表现' },
  { key: 'configs', icon: <SettingOutlined />, label: '系统配置', hint: '统一维护站点配置与支付参数' }
] as const;

type AdminSectionKey = (typeof menuItems)[number]['key'];

function isAdminSectionKey(value: string | undefined): value is AdminSectionKey {
  return menuItems.some((item) => item.key === value);
}

type GoodsFormValues = {
  title: string;
  slug?: string;
  cover?: string;
  cover_fit_mode: string;
  cover_width?: number;
  cover_height?: number;
  description: string;
  delivery_instructions: string;
  price: number;
  original_price?: number;
  status: string;
  contact_type: string;
  pay_methods: string[];
  stock_display_mode: string;
  stock_display_text?: string;
  email_enabled: boolean;
  email_subject_template?: string;
  email_body_template?: string;
  sort_order: number;
};

type AgentFormValues = {
  agent_code: string;
  agent_name: string;
  username: string;
  password?: string;
  status: number;
  allowed_goods_ids: number[];
};

type ChannelFormValues = {
  agent_code: string;
  channel_code: string;
  channel_name: string;
  promoter_name?: string;
  goods_id?: number;
  status: number;
  note?: string;
};

type CardImportValues = {
  goods_id: number;
  cards_text: string;
};

type ChannelBatchValues = {
  agent_code: string;
  goods_id?: number;
  status: number;
  rows_text: string;
};

const goodsStatusEnum = {
  on: { text: '上架', status: 'Success' },
  off: { text: '下架', status: 'Default' }
} as const;

const cardStatusEnum = {
  unused: { text: '未使用', status: 'Success' },
  frozen: { text: '已冻结', status: 'Default' },
  locked: { text: '锁定中', status: 'Processing' },
  sold: { text: '已售出', status: 'Error' }
} as const;

const emailStatusText: Record<string, string> = {
  sent: '已发送',
  failed: '发送失败',
  skipped: '未发送'
};

const smallTableSearch = {
  labelWidth: 'auto' as const,
  defaultCollapsed: false,
  collapseRender: false as const
};

function toNumber(value: unknown) {
  const amount = Number(value ?? 0);
  return Number.isFinite(amount) ? amount : 0;
}

function toPagedResult<T>(data: T[], params: { current?: number; pageSize?: number }) {
  const current = Number(params.current ?? 1);
  const pageSize = Number(params.pageSize ?? 10);
  const start = Math.max(0, (current - 1) * pageSize);
  return {
    data: data.slice(start, start + pageSize),
    success: true,
    total: data.length
  };
}

function compareSortValue(left: unknown, right: unknown) {
  const leftTime = parseTimeValue(left);
  const rightTime = parseTimeValue(right);
  if (!Number.isNaN(leftTime) && !Number.isNaN(rightTime)) {
    return leftTime - rightTime;
  }

  const leftNumber = Number(left);
  const rightNumber = Number(right);
  if (!Number.isNaN(leftNumber) && !Number.isNaN(rightNumber)) {
    return leftNumber - rightNumber;
  }

  return toPlainText(left).localeCompare(toPlainText(right), 'zh-CN');
}

function parseTimeValue(value: unknown) {
  if (value && typeof value === 'object' && 'valueOf' in value && typeof value.valueOf === 'function') {
    const raw = Number(value.valueOf());
    if (!Number.isNaN(raw) && raw > 0) {
      return raw;
    }
  }
  return Date.parse(toPlainText(value));
}

function applySorter<T>(data: T[], sorter: Record<string, string> | Record<string, { order?: string }> | undefined) {
  const sorterEntries = Object.entries(sorter ?? {});
  const activeSorter = sorterEntries.find(([, value]) => {
    if (typeof value === 'string') {
      return value;
    }
    return value?.order;
  });
  if (!activeSorter) {
    return data;
  }

  const [field, value] = activeSorter;
  const order = typeof value === 'string' ? value : value?.order;
  if (!order) {
    return data;
  }

  return [...data].sort((left, right) => {
    const result = compareSortValue((left as Record<string, unknown>)[field], (right as Record<string, unknown>)[field]);
    return order === 'descend' ? -result : result;
  });
}

function getShanghaiDateKey(value?: string | null) {
  if (!value) {
    return '';
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return '';
  }
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Shanghai',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  }).format(date);
}

function getSuccessfulOrderTime(order: OrderInfo) {
  return order.pay_time || order.deliver_time || order.created_at;
}

function getTrailingAmount(orders: OrderInfo[], days: number) {
  const now = Date.now();
  const min = now - (days - 1) * 86400000;
  return orders.reduce((sum, item) => {
    const time = new Date(getSuccessfulOrderTime(item)).getTime();
    if (Number.isNaN(time) || time < min) {
      return sum;
    }
    return sum + Number(item.amount || 0);
  }, 0);
}

function buildDailyAmountRows(orders: OrderInfo[], days: number) {
  const formatter = new Intl.DateTimeFormat('zh-CN', {
    timeZone: 'Asia/Shanghai',
    month: 'numeric',
    day: 'numeric'
  });
  const buckets = new Map<string, number>();
  for (let index = days - 1; index >= 0; index -= 1) {
    const point = new Date(Date.now() - index * 86400000);
    const key = getShanghaiDateKey(point.toISOString());
    buckets.set(key, 0);
  }
  orders.forEach((item) => {
    const key = getShanghaiDateKey(getSuccessfulOrderTime(item));
    if (!buckets.has(key)) {
      return;
    }
    buckets.set(key, (buckets.get(key) ?? 0) + Number(item.amount || 0));
  });
  return [...buckets.entries()].map(([key, amount]) => ({
    key,
    label: formatter.format(new Date(`${key}T00:00:00+08:00`)),
    amount
  }));
}

export function AdminDashboardPage() {
  const navigate = useNavigate();
  const { section } = useParams();
  const { message } = App.useApp();
  const screens = Grid.useBreakpoint();
  const token = localStorage.getItem(ADMIN_TOKEN_KEY);

  const [navOpen, setNavOpen] = useState(false);
  const [summary, setSummary] = useState<DashboardSummary>({});
  const [goods, setGoods] = useState<GoodsItem[]>([]);
  const [cards, setCards] = useState<CdkItem[]>([]);
  const [orders, setOrders] = useState<OrderInfo[]>([]);
  const [agents, setAgents] = useState<AgentAccount[]>([]);
  const [channels, setChannels] = useState<ChannelItem[]>([]);
  const [configs, setConfigs] = useState<ConfigItem[]>([]);
  const [loading, setLoading] = useState(false);

  const [goodsDrawerOpen, setGoodsDrawerOpen] = useState(false);
  const [cardModalOpen, setCardModalOpen] = useState(false);
  const [agentModalOpen, setAgentModalOpen] = useState(false);
  const [channelModalOpen, setChannelModalOpen] = useState(false);
  const [channelBatchModalOpen, setChannelBatchModalOpen] = useState(false);
  const [passwordModalOpen, setPasswordModalOpen] = useState(false);

  const [editingGoods, setEditingGoods] = useState<GoodsItem | null>(null);
  const [editingAgent, setEditingAgent] = useState<AgentAccount | null>(null);
  const [editingChannel, setEditingChannel] = useState<ChannelItem | null>(null);
  const [qrChannel, setQrChannel] = useState<ChannelItem | null>(null);
  const [selectedCardIds, setSelectedCardIds] = useState<number[]>([]);
  const [selectedChannelKeys, setSelectedChannelKeys] = useState<string[]>([]);
  const [selectedConfigKey, setSelectedConfigKey] = useState('SITE_NOTICE');
  const [activeConfigGroup, setActiveConfigGroup] = useState('all');
  const [configDraftValue, setConfigDraftValue] = useState<string | number | boolean>('');
  const [savingConfig, setSavingConfig] = useState(false);
  const [clearingConfigCache, setClearingConfigCache] = useState(false);
  const [clearingGoodsCache, setClearingGoodsCache] = useState(false);
  const [reloadToken, setReloadToken] = useState(0);

  const [goodsForm] = Form.useForm<GoodsFormValues>();
  const [cardForm] = Form.useForm<CardImportValues>();
  const [agentForm] = Form.useForm<AgentFormValues>();
  const [channelForm] = Form.useForm<ChannelFormValues>();
  const [channelBatchForm] = Form.useForm<ChannelBatchValues>();
  const [passwordForm] = Form.useForm<{ current_password: string; new_password: string; confirm_password: string }>();

  const activeSection: AdminSectionKey = isAdminSectionKey(section) ? section : 'overview';
  const currentSection = menuItems.find((item) => item.key === activeSection) ?? menuItems[0];
  const goodsOptions = useMemo(
    () => goods.map((item) => ({ label: `${item.id} - ${item.title}`, value: item.id })),
    [goods]
  );
  const agentOptions = useMemo(
    () => agents.map((item) => ({ label: `${item.agent_code} · ${item.agent_name}`, value: item.agent_code })),
    [agents]
  );
  const selectedConfig = useMemo(
    () => configs.find((item) => item.config_key === selectedConfigKey) ?? null,
    [configs, selectedConfigKey]
  );
  const siteUrl = useMemo(() => {
    const value = configs.find((item) => item.config_key === 'SITE_URL')?.config_value;
    return typeof value === 'string' && value ? value.replace(/\/$/, '') : window.location.origin;
  }, [configs]);
  const configGroupOptions = useMemo(() => ['all', ...Array.from(new Set(configs.map((item) => item.group_name)))], [configs]);
  const groupedConfigs = useMemo(
    () => (activeConfigGroup === 'all' ? configs : configs.filter((item) => item.group_name === activeConfigGroup)),
    [activeConfigGroup, configs]
  );

  const paidOrders = useMemo(() => orders.filter((item) => item.status === 'delivered' || item.status === 'paid'), [orders]);
  const pendingOrders = useMemo(() => orders.filter((item) => item.status === 'pending'), [orders]);
  const lowStockGoods = useMemo(
    () =>
      [...goods]
        .sort((left, right) => left.available_stock - right.available_stock)
        .slice(0, 6),
    [goods]
  );
  const recentOrders = useMemo(
    () =>
      [...orders]
        .sort((left, right) => new Date(right.created_at).getTime() - new Date(left.created_at).getTime())
        .slice(0, 8),
    [orders]
  );
  const paymentSummary = useMemo(() => {
    const summaryMap = new Map<string, number>();
    paidOrders.forEach((item) => {
      const key = normalizePayMethodLabel(item.pay_method);
      summaryMap.set(key, (summaryMap.get(key) ?? 0) + 1);
    });
    return [...summaryMap.entries()]
      .map(([label, count]) => ({ label, count }))
      .sort((left, right) => right.count - left.count);
  }, [paidOrders]);

  useEffect(() => {
    if (section && isAdminSectionKey(section)) {
      return;
    }
    navigate('/admin/dashboard/overview', { replace: true });
  }, [navigate, section]);

  useEffect(() => {
    document.title = buildConsolePageTitle(currentSection.label, '管理后台');
  }, [currentSection.label]);

  useEffect(() => {
    if (!token) {
      return;
    }
    loadAll();
  }, [token]);

  useEffect(() => {
    if (selectedConfig) {
      if (selectedConfig.config_type === 'json') {
        setConfigDraftValue(prettyConfigValue(selectedConfig.config_value));
      } else if (selectedConfig.config_type === 'bool') {
        setConfigDraftValue(Boolean(selectedConfig.config_value));
      } else if (selectedConfig.config_type === 'int') {
        setConfigDraftValue(Number(selectedConfig.config_value ?? 0));
      } else {
        setConfigDraftValue(String(selectedConfig.config_value ?? ''));
      }
    }
  }, [selectedConfig]);

  useEffect(() => {
    if (!configs.length) {
      return;
    }
    if (!configs.some((item) => item.config_key === selectedConfigKey)) {
      setSelectedConfigKey(configs[0].config_key);
    }
  }, [configs, selectedConfigKey]);

  useEffect(() => {
    if (!configGroupOptions.includes(activeConfigGroup)) {
      setActiveConfigGroup('all');
    }
  }, [activeConfigGroup, configGroupOptions]);

  useEffect(() => {
    if (!goodsDrawerOpen) {
      return;
    }
    goodsForm.setFieldsValue(
      editingGoods
        ? {
            title: editingGoods.title,
            slug: editingGoods.slug ?? undefined,
            cover: editingGoods.cover ?? undefined,
            cover_fit_mode: editingGoods.cover_fit_mode || 'cover',
            cover_width: editingGoods.cover_width ?? undefined,
            cover_height: editingGoods.cover_height ?? undefined,
            description: editingGoods.description,
            delivery_instructions: editingGoods.delivery_instructions || '',
            price: toNumber(editingGoods.price),
            original_price: editingGoods.original_price ? toNumber(editingGoods.original_price) : undefined,
            status: editingGoods.status,
            contact_type: editingGoods.contact_type,
            pay_methods: normalizePayMethods(editingGoods.pay_methods),
            stock_display_mode: editingGoods.stock_display_mode || 'real',
            stock_display_text: editingGoods.stock_display_text ?? undefined,
            email_enabled: Boolean(editingGoods.email_enabled),
            email_subject_template: editingGoods.email_subject_template ?? undefined,
            email_body_template: editingGoods.email_body_template ?? undefined,
            sort_order: editingGoods.sort_order
          }
        : {
            title: '',
            slug: undefined,
            cover: undefined,
            cover_fit_mode: 'cover',
            cover_width: undefined,
            cover_height: undefined,
            description: '',
            delivery_instructions: '',
            price: 19.9,
            original_price: undefined,
            status: 'on',
            contact_type: 'both',
            pay_methods: ['alipay', 'wxpay'],
            stock_display_mode: 'real',
            stock_display_text: undefined,
            email_enabled: false,
            email_subject_template: '您的订单 {{order_no}} 已自动发货',
            email_body_template:
              '<h2>订单发货成功</h2><p>商品：{{goods_title}}</p><p>订单号：{{order_no}}</p><p>支付时间：{{pay_time}}</p><p>卡密：{{card_code}}</p><p>附加密钥（如有）：{{card_secret}}</p>',
            sort_order: 0
          }
    );
  }, [editingGoods, goodsDrawerOpen, goodsForm]);

  useEffect(() => {
    if (!agentModalOpen) {
      return;
    }
    agentForm.setFieldsValue(
      editingAgent
        ? {
            agent_code: editingAgent.agent_code,
            agent_name: editingAgent.agent_name,
            username: editingAgent.username,
            password: undefined,
            status: editingAgent.status,
            allowed_goods_ids: editingAgent.allowed_goods_ids ?? []
          }
        : {
            agent_code: '',
            agent_name: '',
            username: '',
            password: undefined,
            status: 1,
            allowed_goods_ids: []
          }
    );
  }, [agentForm, agentModalOpen, editingAgent]);

  useEffect(() => {
    if (!channelModalOpen) {
      return;
    }
    channelForm.setFieldsValue(
      editingChannel
        ? {
            agent_code: editingChannel.agent_code,
            channel_code: editingChannel.channel_code,
            channel_name: editingChannel.channel_name,
            promoter_name: editingChannel.promoter_name ?? undefined,
            goods_id: editingChannel.goods_id ?? undefined,
            status: editingChannel.status,
            note: editingChannel.note ?? undefined
          }
        : {
            agent_code: undefined,
            channel_code: '',
            channel_name: '',
            promoter_name: undefined,
            goods_id: undefined,
            status: 1,
            note: undefined
          }
    );
  }, [channelForm, channelModalOpen, editingChannel]);

  async function loadAll() {
    if (!token) {
      return;
    }
    setLoading(true);
    try {
      const headers = authHeaders(token);
      const [summaryData, goodsData, cardData, orderData, agentData, channelData, configData] = await Promise.all([
        unwrap<DashboardSummary>(api.get('/api/admin/dashboard', { headers })),
        unwrap<GoodsItem[]>(api.get('/api/admin/goods', { headers })),
        unwrap<CdkItem[]>(api.get('/api/admin/cdks', { headers })),
        unwrap<OrderInfo[]>(api.get('/api/admin/orders', { headers })),
        unwrap<AgentAccount[]>(api.get('/api/admin/agents', { headers })),
        unwrap<ChannelItem[]>(api.get('/api/admin/channels', { headers })),
        unwrap<ConfigItem[]>(api.get('/api/admin/configs', { headers }))
      ]);
      setSummary(summaryData);
      setGoods(
        goodsData.map((item) => ({
          ...item,
          pay_methods: normalizePayMethods(item.pay_methods)
        }))
      );
      setCards(cardData);
      setOrders(orderData);
      setAgents(agentData);
      setChannels(channelData);
      setConfigs(configData);
      setReloadToken((value) => value + 1);
    } catch (error) {
      message.error(getErrorMessage(error, '后台数据加载失败'));
    } finally {
      setLoading(false);
    }
  }

  function handleLogout() {
    clearAdminSession();
    navigate('/admin/login');
  }

  async function submitAdminPassword(values: { current_password: string; new_password: string; confirm_password: string }) {
    if (!token) {
      return false;
    }
    try {
      await unwrap<{ updated: boolean }>(
        api.post(
          '/api/admin/auth/change-password',
          {
            current_password: values.current_password,
            new_password: values.new_password
          },
          { headers: authHeaders(token) }
        )
      );
      message.success('管理员密码修改成功');
      setPasswordModalOpen(false);
      passwordForm.resetFields();
      return true;
    } catch (error) {
      message.error(getErrorMessage(error, '密码修改失败'));
      return false;
    }
  }

  async function clearCache(scope: 'configs' | 'goods') {
    if (!token) {
      return;
    }
    const setter = scope === 'configs' ? setClearingConfigCache : setClearingGoodsCache;
    setter(true);
    try {
      const result = await unwrap<{ cleared: number }>(
        api.post(`/api/admin/cache/${scope}/clear`, {}, { headers: authHeaders(token) })
      );
      message.success(`${scope === 'configs' ? '配置' : '商品'}缓存已清理，处理 ${result.cleared} 项`);
    } catch (error) {
      message.error(getErrorMessage(error, '缓存清理失败'));
    } finally {
      setter(false);
    }
  }

  async function submitGoods(values: GoodsFormValues) {
    if (!token) {
      return false;
    }
    try {
      const payload = {
        ...values,
        pay_methods: normalizePayMethods(values.pay_methods),
        slug: values.slug || null,
        cover: values.cover || null,
        cover_fit_mode: values.cover_fit_mode,
        cover_width: values.cover_width ?? null,
        cover_height: values.cover_height ?? null,
        original_price: values.original_price ?? null,
        delivery_instructions: values.delivery_instructions || '',
        stock_display_text: values.stock_display_mode === 'custom' ? values.stock_display_text || null : null,
        email_subject_template: values.email_enabled ? values.email_subject_template || null : null,
        email_body_template: values.email_enabled ? values.email_body_template || null : null,
        sort_order: Number(values.sort_order ?? 0)
      };
      if (editingGoods) {
        await unwrap<GoodsItem>(api.put(`/api/admin/goods/${editingGoods.id}`, payload, { headers: authHeaders(token) }));
        message.success('商品更新成功');
      } else {
        await unwrap<GoodsItem>(api.post('/api/admin/goods', payload, { headers: authHeaders(token) }));
        message.success('商品创建成功');
      }
      setGoodsDrawerOpen(false);
      setEditingGoods(null);
      goodsForm.resetFields();
      await loadAll();
      return true;
    } catch (error) {
      message.error(getErrorMessage(error, '商品保存失败'));
      return false;
    }
  }

  async function submitCards(values: CardImportValues) {
    if (!token) {
      return false;
    }
    try {
      const result = await unwrap<{ imported: number; skipped: number }>(
        api.post('/api/admin/cdks/import', values, { headers: authHeaders(token) })
      );
      message.success(`导入成功，新增 ${result.imported} 条，跳过 ${result.skipped} 条`);
      setCardModalOpen(false);
      cardForm.resetFields();
      await loadAll();
      return true;
    } catch (error) {
      message.error(getErrorMessage(error, '卡密导入失败'));
      return false;
    }
  }

  async function submitCardStatus(status: 'unused' | 'frozen') {
    if (!token) {
      return;
    }
    if (!selectedCardIds.length) {
      message.warning('请先选择要操作的卡密');
      return;
    }
    try {
      const result = await unwrap<{ changed: number; skipped: number }>(
        api.post(
          '/api/admin/cdks/batch-status',
          { ids: selectedCardIds, status },
          { headers: authHeaders(token) }
        )
      );
      message.success(`${status === 'frozen' ? '冻结' : '解冻'}完成，成功 ${result.changed} 条，跳过 ${result.skipped} 条`);
      setSelectedCardIds([]);
      await loadAll();
    } catch (error) {
      message.error(getErrorMessage(error, '批量操作失败'));
    }
  }

  async function submitAgent(values: AgentFormValues) {
    if (!token) {
      return false;
    }
    try {
      const payload = {
        ...values,
        password: values.password || undefined,
        allowed_goods_ids: values.allowed_goods_ids ?? []
      };
      if (editingAgent) {
        await unwrap<AgentAccount>(api.put(`/api/admin/agents/${editingAgent.agent_code}`, payload, { headers: authHeaders(token) }));
        message.success('代理更新成功');
      } else {
        await unwrap<AgentAccount>(api.post('/api/admin/agents', payload, { headers: authHeaders(token) }));
        message.success('代理创建成功');
      }
      setAgentModalOpen(false);
      setEditingAgent(null);
      agentForm.resetFields();
      await loadAll();
      return true;
    } catch (error) {
      message.error(getErrorMessage(error, '代理保存失败'));
      return false;
    }
  }

  async function submitChannel(values: ChannelFormValues) {
    if (!token) {
      return false;
    }
    try {
      const payload = {
        ...values,
        promoter_name: values.promoter_name || undefined,
        goods_id: values.goods_id || undefined,
        note: values.note || undefined
      };
      let savedChannel: ChannelItem;
      if (editingChannel) {
        savedChannel = await unwrap<ChannelItem>(
          api.put(`/api/admin/channels/${editingChannel.agent_code}/${editingChannel.channel_code}`, payload, {
            headers: authHeaders(token)
          })
        );
        message.success('渠道更新成功');
      } else {
        savedChannel = await unwrap<ChannelItem>(api.post('/api/admin/channels', payload, { headers: authHeaders(token) }));
        message.success('渠道创建成功');
      }
      setChannelModalOpen(false);
      setEditingChannel(null);
      channelForm.resetFields();
      setQrChannel(savedChannel);
      await loadAll();
      return true;
    } catch (error) {
      message.error(getErrorMessage(error, '渠道保存失败'));
      return false;
    }
  }

  async function submitChannelBatch(values: ChannelBatchValues) {
    if (!token) {
      return false;
    }
    try {
      const result = await unwrap<{ imported: number; skipped: number }>(
        api.post('/api/admin/channels/batch', values, { headers: authHeaders(token) })
      );
      message.success(`批量新增完成，成功 ${result.imported} 条，跳过 ${result.skipped} 条`);
      setChannelBatchModalOpen(false);
      channelBatchForm.resetFields();
      await loadAll();
      return true;
    } catch (error) {
      message.error(getErrorMessage(error, '批量新增渠道失败'));
      return false;
    }
  }

  async function copySelectedChannelLinks() {
    const text = channels
      .filter((item) => selectedChannelKeys.includes(`${item.agent_code}-${item.channel_code}`))
      .map((item) => item.promo_link)
      .filter(Boolean)
      .join('\n');
    if (!text) {
      message.warning('请先选择带推广链接的渠道');
      return;
    }
    try {
      await navigator.clipboard.writeText(text);
      message.success('已复制选中渠道链接');
    } catch {
      message.error('复制失败，请检查浏览器剪贴板权限');
    }
  }

  async function saveConfig() {
    if (!token || !selectedConfig) {
      return;
    }
    setSavingConfig(true);
    try {
      let value: unknown;
      if (selectedConfig.config_type === 'json') {
        value = JSON.parse(String(configDraftValue || '').trim() || '{}');
      } else if (selectedConfig.config_type === 'bool') {
        value = Boolean(configDraftValue);
      } else if (selectedConfig.config_type === 'int') {
        value = Number(configDraftValue ?? 0);
      } else {
        value = String(configDraftValue ?? '');
      }
      await unwrap<ConfigItem>(api.put(`/api/admin/configs/${selectedConfig.config_key}`, { value }, { headers: authHeaders(token) }));
      message.success('配置保存成功');
      await loadAll();
    } catch (error) {
      message.error(getErrorMessage(error, '配置保存失败'));
    } finally {
      setSavingConfig(false);
    }
  }

  const goodsColumns: ProColumns<GoodsItem>[] = [
    { title: '关键词', dataIndex: 'keyword', hideInTable: true, fieldProps: { placeholder: '搜索标题 / slug / ID' } },
    { title: '状态', dataIndex: 'status', hideInTable: true, valueType: 'select', valueEnum: goodsStatusEnum },
    { title: 'ID', dataIndex: 'id', width: 72 },
    { title: '商品标题', dataIndex: 'title', ellipsis: true },
    { title: '售价', dataIndex: 'price', width: 110, renderText: (value) => `￥${formatCurrency(value)}` },
    { title: '库存', dataIndex: 'available_stock', width: 90 },
    {
      title: '前台库存展示',
      dataIndex: 'stock_display_mode',
      search: false,
      width: 140,
      render: (_, record) =>
        record.stock_display_mode === 'custom' ? record.stock_display_text || '自定义文案' : '真实库存'
    },
    {
      title: '封面展示',
      dataIndex: 'cover_fit_mode',
      width: 120,
      search: false,
      render: (_, record) => {
        const modeText: Record<string, string> = {
          cover: '填充裁切',
          contain: '完整显示',
          fill: '拉伸铺满',
          'scale-down': '按比例缩小'
        };
        return modeText[record.cover_fit_mode || 'cover'] || '填充裁切';
      }
    },
    { title: '状态', dataIndex: 'status', valueEnum: goodsStatusEnum, width: 90, search: false },
    {
      title: '支付方式',
      dataIndex: 'pay_methods',
      search: false,
      render: (_, record) => (
        <Space wrap size={[6, 6]}>
          {normalizePayMethods(record.pay_methods).map((item) => (
            <Tag key={item}>{normalizePayMethodLabel(item)}</Tag>
          ))}
        </Space>
      )
    },
    {
      title: '操作',
      valueType: 'option',
      width: 140,
      render: (_, record) => [
        <Button
          key="edit"
          type="link"
          onClick={() => {
            setEditingGoods(record);
            setGoodsDrawerOpen(true);
          }}
        >
          编辑
        </Button>
      ]
    },
    {
      title: '邮件',
      dataIndex: 'email_enabled',
      search: false,
      width: 96,
      render: (_, record) => (record.email_enabled ? <Tag color="green">开启</Tag> : <Tag>关闭</Tag>)
    }
  ];

  const cardColumns: ProColumns<CdkItem>[] = [
    { title: '关键词', dataIndex: 'keyword', hideInTable: true, fieldProps: { placeholder: '搜索卡密 / 商品ID / 订单ID' } },
    { title: '商品', dataIndex: 'goods_id', hideInTable: true, valueType: 'select', fieldProps: { options: goodsOptions, allowClear: true } },
    { title: '状态', dataIndex: 'status', hideInTable: true, valueType: 'select', valueEnum: cardStatusEnum },
    { title: 'ID', dataIndex: 'id', width: 72 },
    { title: '商品 ID', dataIndex: 'goods_id', width: 90 },
    { title: '卡密', dataIndex: 'card_code', copyable: true, ellipsis: true },
    { title: '状态', dataIndex: 'status', valueEnum: cardStatusEnum, width: 100, search: false },
    { title: '订单 ID', dataIndex: 'order_id', renderText: (value) => toPlainText(value) || '-' }
  ];

  const orderColumns: ProColumns<OrderInfo>[] = [
    { title: '关键词', dataIndex: 'keyword', hideInTable: true, fieldProps: { placeholder: '订单号 / 联系方式 / 代理 / 渠道' } },
    {
      title: '状态',
      dataIndex: 'status',
      hideInTable: true,
      valueType: 'select',
      valueEnum: {
        pending: { text: '待支付' },
        delivered: { text: '已发卡' },
        paid: { text: '已支付' },
        expired: { text: '已过期' },
        failed: { text: '失败' }
      }
    },
    { title: '订单号', dataIndex: 'order_no', copyable: true, ellipsis: true },
    { title: '联系方式', dataIndex: 'buyer_contact', ellipsis: true },
    { title: '数量', dataIndex: 'quantity', width: 80, search: false, renderText: (value) => toPlainText(value) || '1' },
    { title: '金额', dataIndex: 'amount', width: 110, renderText: (value) => `￥${formatCurrency(value)}` },
    { title: '支付方式', dataIndex: 'pay_method', width: 110, renderText: (value) => normalizePayMethodLabel(value) },
    { title: '状态', dataIndex: 'status', width: 90, search: false, render: (_, record) => <StatusTag status={record.status} /> },
    {
      title: '邮件状态',
      dataIndex: 'email_status',
      search: false,
      width: 108,
      render: (_, record) => {
        if (record.contact_type !== 'email') {
          return <Typography.Text type="secondary">-</Typography.Text>;
        }
        const text = emailStatusText[toPlainText(record.email_status)] || '待处理';
        if (record.email_status === 'sent') {
          return <Tag color="green">{text}</Tag>;
        }
        if (record.email_status === 'failed') {
          return <Tag color="red">{text}</Tag>;
        }
        if (record.email_status === 'skipped') {
          return <Tag>{text}</Tag>;
        }
        return <Tag color="blue">{text}</Tag>;
      }
    },
    { title: '代理', dataIndex: 'agent_code', width: 100, renderText: (value) => toPlainText(value) || '-' },
    {
      title: '来源渠道',
      dataIndex: 'source_channel_name',
      search: false,
      ellipsis: true,
      render: (_, record) => toPlainText(record.source_channel_name) || toPlainText(record.source_channel_code) || '-'
    },
    { title: '创建时间', dataIndex: 'created_at', search: false, width: 168, renderText: (value) => formatDateTime(value) }
  ];

  const agentColumns: ProColumns<AgentAccount>[] = [
    { title: '关键词', dataIndex: 'keyword', hideInTable: true, fieldProps: { placeholder: '搜索代理编码 / 名称 / 账号' } },
    {
      title: '状态',
      dataIndex: 'status',
      hideInTable: true,
      valueType: 'select',
      valueEnum: {
        1: { text: '启用' },
        0: { text: '禁用' }
      }
    },
    { title: '代理编码', dataIndex: 'agent_code', width: 120 },
    { title: '代理名称', dataIndex: 'agent_name' },
    { title: '登录账号', dataIndex: 'username' },
    {
      title: '推广商品',
      dataIndex: 'allowed_goods_ids',
      search: false,
      render: (_, record) =>
        Array.isArray(record.allowed_goods_ids) && record.allowed_goods_ids.length ? record.allowed_goods_ids.join(', ') : '全部商品'
    },
    {
      title: '示例链接',
      dataIndex: 'sample_link',
      search: false,
      ellipsis: true,
      render: (_, record) => {
        const goodsId = record.allowed_goods_ids?.[0] ?? goods[0]?.id;
        return goodsId ? (
          <Typography.Text copyable>{`${siteUrl}/goods/${goodsId}?agent_code=${record.agent_code}`}</Typography.Text>
        ) : (
          '-'
        );
      }
    },
    {
      title: '操作',
      valueType: 'option',
      width: 90,
      render: (_, record) => [
        <Button
          key="edit"
          type="link"
          onClick={() => {
            setEditingAgent(record);
            setAgentModalOpen(true);
          }}
        >
          编辑
        </Button>
      ]
    }
  ];

  const channelColumns: ProColumns<ChannelItem>[] = [
    { title: '关键词', dataIndex: 'keyword', hideInTable: true, fieldProps: { placeholder: '搜索代理 / 渠道 / 博主' } },
    { title: '代理', dataIndex: 'agent_code', hideInTable: true, valueType: 'select', fieldProps: { options: agentOptions, allowClear: true } },
    {
      title: '开始日期',
      dataIndex: 'created_from',
      hideInTable: true,
      valueType: 'text',
      fieldProps: { type: 'date' }
    },
    {
      title: '结束日期',
      dataIndex: 'created_to',
      hideInTable: true,
      valueType: 'text',
      fieldProps: { type: 'date' }
    },
    {
      title: '状态',
      dataIndex: 'status',
      hideInTable: true,
      valueType: 'select',
      valueEnum: {
        1: { text: '启用' },
        0: { text: '禁用' }
      }
    },
    { title: '代理', dataIndex: 'agent_code', width: 110 },
    {
      title: '渠道',
      dataIndex: 'channel_name',
      render: (_, record) => (
        <Space direction="vertical" size={0}>
          <span>{record.channel_name}</span>
          <Typography.Text type="secondary" copyable>
            {record.channel_code}
          </Typography.Text>
        </Space>
      )
    },
    { title: '博主', dataIndex: 'promoter_name', width: 140, renderText: (value) => toPlainText(value) || '-', search: false },
    { title: '添加时间', dataIndex: 'created_at', width: 168, search: false, sorter: true, renderText: (value) => formatDateTime(value) },
    { title: '浏览', dataIndex: 'visit_pv', width: 120, search: false, sorter: true, render: (_, record) => `${record.visit_pv} / UV ${record.visit_uv}` },
    { title: '下单', dataIndex: 'order_count', width: 90, search: false, sorter: true },
    { title: '支付', dataIndex: 'paid_count', width: 90, search: false, sorter: true },
    { title: '金额', dataIndex: 'paid_amount', width: 110, search: false, sorter: true, renderText: (value) => `￥${formatCurrency(value)}` },
    {
      title: '推广链接',
      dataIndex: 'promo_link',
      search: false,
      ellipsis: true,
      render: (_, record) => (record.promo_link ? <Typography.Text copyable>{record.promo_link}</Typography.Text> : '-')
    },
    {
      title: '操作',
      valueType: 'option',
      width: 140,
      render: (_, record) => [
        <Button
          key="edit"
          type="link"
          onClick={() => {
            setEditingChannel(record);
            setChannelModalOpen(true);
          }}
        >
          编辑
        </Button>,
        <Button key="qr" type="link" icon={<QrcodeOutlined />} onClick={() => setQrChannel(record)}>
          二维码
        </Button>
      ]
    }
  ];

  const navigationMenu = (
    <Menu
      mode="inline"
      selectedKeys={[activeSection]}
      items={menuItems.map((item) => ({ key: item.key, icon: item.icon, label: item.label }))}
      onClick={(info) => {
        navigate(`/admin/dashboard/${info.key}`);
        setNavOpen(false);
      }}
    />
  );

  function renderOverview() {
    const totalSuccessAmount = paidOrders.reduce((sum, item) => sum + toNumber(item.amount), 0);
    const todayKey = getShanghaiDateKey(new Date().toISOString());
    const todayAmount = paidOrders.reduce((sum, item) => {
      return getShanghaiDateKey(getSuccessfulOrderTime(item)) === todayKey ? sum + toNumber(item.amount) : sum;
    }, 0);
    const amount7d = getTrailingAmount(paidOrders, 7);
    const amount30d = getTrailingAmount(paidOrders, 30);
    const onSaleGoodsCount = goods.filter((item) => item.status === 'on').length;
    const availableCardCount = goods.reduce((sum, item) => sum + item.available_stock, 0);
    const dailyRows = buildDailyAmountRows(paidOrders, 7);
    const maxDailyAmount = Math.max(...dailyRows.map((item) => item.amount), 1);
    const paymentRows = paymentSummary.slice(0, 4);

    return (
      <Space direction="vertical" size={16} style={{ width: '100%' }}>
        <div className="dashboard-stat-grid">
          <SummaryCard title="交易成功总金额" value={`￥${formatCurrency(totalSuccessAmount)}`} extra={`${paidOrders.length} 笔成功订单`} />
          <SummaryCard title="今日金额" value={`￥${formatCurrency(todayAmount)}`} extra="按北京时间统计" />
          <SummaryCard title="近 7 日金额" value={`￥${formatCurrency(amount7d)}`} extra="最近 7 天成功支付" />
          <SummaryCard title="近 30 日金额" value={`￥${formatCurrency(amount30d)}`} extra="最近 30 天成功支付" />
          <SummaryCard title="在售商品数量" value={onSaleGoodsCount} extra={`${goods.length} 个商品`} />
          <SummaryCard title="可用卡密总数量" value={availableCardCount} extra="按未使用库存计算" />
        </div>

        <Row gutter={[16, 16]}>
          <Col xs={24} lg={14}>
            <ProCard title="近 7 日交易趋势" className="dashboard-panel">
              <div className="metric-bar-list">
                {dailyRows.map((item) => (
                  <div key={item.key} className="metric-bar-item">
                    <div className="metric-bar-item__head">
                      <Typography.Text>{item.label}</Typography.Text>
                      <Typography.Text type="secondary">￥{formatCurrency(item.amount)}</Typography.Text>
                    </div>
                    <div className="metric-bar-item__track">
                      <div className="metric-bar-item__fill" style={{ width: `${Math.max((item.amount / maxDailyAmount) * 100, item.amount > 0 ? 8 : 0)}%` }} />
                    </div>
                  </div>
                ))}
              </div>
            </ProCard>
          </Col>
          <Col xs={24} lg={10}>
            <ProCard title="支付方式占比" className="dashboard-panel">
              <div className="list-stack">
                {paymentRows.length ? (
                  paymentRows.map((item) => (
                    <div key={item.label} className="progress-line">
                      <div className="progress-line__head">
                        <Typography.Text>{item.label}</Typography.Text>
                        <Typography.Text type="secondary">￥{formatCurrency((item.count / Math.max(paidOrders.length, 1)) * totalSuccessAmount)}</Typography.Text>
                      </div>
                      <Progress percent={Math.round((item.count / Math.max(paidOrders.length, 1)) * 100)} showInfo={false} strokeColor="#2563eb" />
                    </div>
                  ))
                ) : (
                  <Typography.Text type="secondary">暂无支付成功订单</Typography.Text>
                )}
              </div>
            </ProCard>
          </Col>
        </Row>
      </Space>
    );
  }

  function renderGoodsSection() {
    return (
      <Space direction="vertical" size={16} style={{ width: '100%' }}>
        <div className="dashboard-stat-grid dashboard-stat-grid--compact">
          <SummaryCard title="商品总数" value={goods.length} extra={`${goods.filter((item) => item.status === 'on').length} 个上架`} />
          <SummaryCard title="总库存" value={goods.reduce((sum, item) => sum + item.available_stock, 0)} extra="按当前可用卡密计算" />
          <SummaryCard title="支持支付方式" value={new Set(goods.flatMap((item) => normalizePayMethods(item.pay_methods))).size} extra="按商品配置展示" />
        </div>
        <ProTable<GoodsItem>
          key="admin-goods-table"
          rowKey="id"
          params={{ reloadToken }}
          size="small"
          cardBordered
          columns={goodsColumns}
          loading={loading}
          search={smallTableSearch}
          pagination={{ pageSize: 10, showSizeChanger: false }}
          options={false}
          toolBarRender={() => [
            <Button
              key="create"
              type="primary"
              onClick={() => {
                setEditingGoods(null);
                setGoodsDrawerOpen(true);
              }}
            >
              新增商品
            </Button>
          ]}
          request={async (params) => {
            const keyword = toSearchText(params.keyword);
            const status = toPlainText(params.status).trim();
            const filtered = goods.filter((item) => {
              const hitKeyword = !keyword || toSearchText(item.id, item.title, item.slug).includes(keyword);
              const hitStatus = !status || item.status === status;
              return hitKeyword && hitStatus;
            });
            return toPagedResult(filtered, params);
          }}
        />
      </Space>
    );
  }

  function renderCardSection() {
    return (
      <Space direction="vertical" size={16} style={{ width: '100%' }}>
        <div className="dashboard-stat-grid dashboard-stat-grid--compact">
          <SummaryCard title="未使用卡密" value={cards.filter((item) => item.status === 'unused').length} extra="可直接发放" />
          <SummaryCard title="锁定中的卡密" value={cards.filter((item) => item.status === 'locked').length} extra="待支付或处理中" />
          <SummaryCard title="已售卡密" value={cards.filter((item) => item.status === 'sold').length} extra="历史发卡统计" />
        </div>
        <ProTable<CdkItem>
          key="admin-cards-table"
          rowKey="id"
          params={{ reloadToken }}
          size="small"
          cardBordered
          columns={cardColumns}
          loading={loading}
          search={smallTableSearch}
          pagination={{ pageSize: 10, showSizeChanger: false }}
          options={false}
          rowSelection={{
            selectedRowKeys: selectedCardIds,
            onChange: (keys) => setSelectedCardIds(keys.map((item) => Number(item)))
          }}
          toolBarRender={() => [
            <Button key="import" type="primary" onClick={() => setCardModalOpen(true)}>
              导入卡密
            </Button>,
            <Button key="freeze" disabled={!selectedCardIds.length} onClick={() => submitCardStatus('frozen')}>
              批量冻结
            </Button>,
            <Button key="unfreeze" disabled={!selectedCardIds.length} onClick={() => submitCardStatus('unused')}>
              批量解冻
            </Button>
          ]}
          request={async (params) => {
            const keyword = toSearchText(params.keyword);
            const goodsId = Number(params.goods_id ?? 0);
            const status = toPlainText(params.status).trim();
            const filtered = cards.filter((item) => {
              const hitKeyword = !keyword || toSearchText(item.card_code, item.goods_id, item.order_id).includes(keyword);
              const hitGoods = !goodsId || item.goods_id === goodsId;
              const hitStatus = !status || item.status === status;
              return hitKeyword && hitGoods && hitStatus;
            });
            return toPagedResult(filtered, params);
          }}
        />
      </Space>
    );
  }

  function renderOrderSection() {
    return (
      <Space direction="vertical" size={16} style={{ width: '100%' }}>
        <div className="dashboard-stat-grid dashboard-stat-grid--compact">
          <SummaryCard title="成功订单" value={paidOrders.length} extra={`总金额 ￥${formatCurrency(summary.total_amount)}`} />
          <SummaryCard title="待支付" value={pendingOrders.length} extra="支持前台主动检查" />
          <SummaryCard title="已过期" value={orders.filter((item) => item.status === 'expired').length} extra="超过 5 分钟自动过期" />
        </div>
        <ProTable<OrderInfo>
          key="admin-orders-table"
          rowKey="order_no"
          params={{ reloadToken }}
          size="small"
          cardBordered
          columns={orderColumns}
          loading={loading}
          search={smallTableSearch}
          pagination={{ pageSize: 10, showSizeChanger: false }}
          options={false}
          toolBarRender={() => [
            <Button key="refresh" icon={<ReloadOutlined />} onClick={() => loadAll()}>
              刷新数据
            </Button>
          ]}
          request={async (params) => {
            const keyword = toSearchText(params.keyword);
            const status = toPlainText(params.status).trim();
            const filtered = orders.filter((item) => {
              const hitKeyword =
                !keyword ||
                toSearchText(
                  item.order_no,
                  item.buyer_contact,
                  item.agent_code,
                  item.source_channel_code,
                  item.source_channel_name
                ).includes(keyword);
              const hitStatus = !status || item.status === status;
              return hitKeyword && hitStatus;
            });
            return toPagedResult(filtered, params);
          }}
        />
      </Space>
    );
  }

  function renderAgentSection() {
    return (
      <Space direction="vertical" size={16} style={{ width: '100%' }}>
        <div className="dashboard-stat-grid dashboard-stat-grid--compact">
          <SummaryCard title="代理数量" value={agents.length} extra={`${agents.filter((item) => item.status === 1).length} 个启用`} />
          <SummaryCard title="来源渠道" value={channels.length} extra="归属到代理名下" />
          <SummaryCard title="支付成功订单" value={paidOrders.filter((item) => item.agent_code).length} extra="按代理归因统计" />
        </div>
        <ProTable<AgentAccount>
          key="admin-agents-table"
          rowKey="agent_code"
          params={{ reloadToken }}
          size="small"
          cardBordered
          columns={agentColumns}
          loading={loading}
          search={smallTableSearch}
          pagination={{ pageSize: 10, showSizeChanger: false }}
          options={false}
          toolBarRender={() => [
            <Button
              key="create"
              type="primary"
              onClick={() => {
                setEditingAgent(null);
                setAgentModalOpen(true);
              }}
            >
              新增代理
            </Button>
          ]}
          request={async (params) => {
            const keyword = toSearchText(params.keyword);
            const status = toPlainText(params.status).trim();
            const filtered = agents.filter((item) => {
              const hitKeyword = !keyword || toSearchText(item.agent_code, item.agent_name, item.username).includes(keyword);
              const hitStatus = !status || String(item.status) === status;
              return hitKeyword && hitStatus;
            });
            return toPagedResult(filtered, params);
          }}
        />
      </Space>
    );
  }

  function renderChannelSection() {
    const totalVisitPv = channels.reduce((sum, item) => sum + item.visit_pv, 0);
    const totalVisitUv = channels.reduce((sum, item) => sum + item.visit_uv, 0);
    const totalOrders = channels.reduce((sum, item) => sum + item.order_count, 0);
    const totalPaid = channels.reduce((sum, item) => sum + item.paid_count, 0);

    return (
      <Space direction="vertical" size={16} style={{ width: '100%' }}>
        <div className="dashboard-stat-grid dashboard-stat-grid--compact">
          <SummaryCard title="渠道总数" value={channels.length} extra={`${channels.filter((item) => item.status === 1).length} 个启用`} />
          <SummaryCard title="浏览" value={totalVisitPv} extra={`UV ${totalVisitUv}`} />
          <SummaryCard title="下单" value={totalOrders} extra={`支付 ${totalPaid}`} />
          <SummaryCard title="支付金额" value={`￥${formatCurrency(channels.reduce((sum, item) => sum + toNumber(item.paid_amount), 0))}`} extra="全部渠道汇总" />
        </div>

        <ProTable<ChannelItem>
          key="admin-channels-table"
          rowKey={(record) => `${record.agent_code}-${record.channel_code}`}
          params={{ reloadToken }}
          size="small"
          cardBordered
          columns={channelColumns}
          loading={loading}
          search={smallTableSearch}
          pagination={{ pageSize: 10, showSizeChanger: false }}
          options={false}
          rowSelection={{
            selectedRowKeys: selectedChannelKeys,
            onChange: (keys) => setSelectedChannelKeys(keys.map((item) => String(item)))
          }}
          toolBarRender={() => [
            <Button
              key="create"
              type="primary"
              onClick={() => {
                setEditingChannel(null);
                setChannelModalOpen(true);
              }}
            >
              新增渠道
            </Button>,
            <Button key="batch" onClick={() => setChannelBatchModalOpen(true)}>
              批量新增
            </Button>,
            <Button key="copy" disabled={!selectedChannelKeys.length} onClick={copySelectedChannelLinks}>
              复制选中链接
            </Button>
          ]}
          request={async (params, sorter) => {
            const keyword = toSearchText(params.keyword);
            const agentCode = toPlainText(params.agent_code).trim();
            const status = toPlainText(params.status).trim();
            const startAt = params.created_from ? parseTimeValue(params.created_from) : null;
            const endAt = params.created_to ? parseTimeValue(params.created_to) : null;
            const filtered = channels.filter((item) => {
              const hitKeyword = !keyword || toSearchText(item.agent_code, item.channel_code, item.channel_name, item.promoter_name).includes(keyword);
              const hitAgent = !agentCode || item.agent_code === agentCode;
              const hitStatus = !status || String(item.status) === status;
              const createdAt = item.created_at ? new Date(item.created_at).getTime() : null;
              const hitTime =
                (!startAt || (createdAt !== null && createdAt >= startAt)) &&
                (!endAt || (createdAt !== null && createdAt <= endAt + 86400000));
              return hitKeyword && hitAgent && hitStatus && hitTime;
            });
            return toPagedResult(applySorter(filtered, sorter as Record<string, string>), params);
          }}
        />
      </Space>
    );
  }

  function renderConfigSection() {
    return (
      <Row gutter={[16, 16]}>
        <Col xs={24} xl={9}>
          <ProCard title="配置列表" className="dashboard-panel">
            <Space direction="vertical" size={14} style={{ width: '100%' }}>
              <Tabs
                activeKey={activeConfigGroup}
                onChange={setActiveConfigGroup}
                items={configGroupOptions.map((item) => ({
                  key: item,
                  label: item === 'all' ? '全部' : item
                }))}
              />
              <List
                loading={loading}
                dataSource={groupedConfigs}
                renderItem={(item) => {
                  const active = item.config_key === selectedConfigKey;
                  return (
                    <List.Item
                      onClick={() => setSelectedConfigKey(item.config_key)}
                      style={{
                        cursor: 'pointer',
                        borderRadius: 12,
                        paddingInline: 14,
                        background: active ? 'rgba(22, 119, 255, 0.08)' : 'transparent',
                        border: active ? '1px solid rgba(22, 119, 255, 0.18)' : '1px solid transparent'
                      }}
                    >
                      <List.Item.Meta
                        title={
                          <Space size={8}>
                            <Typography.Text strong>{item.config_key}</Typography.Text>
                            <Tag>{item.config_type}</Tag>
                          </Space>
                        }
                        description={item.description || item.group_name}
                      />
                    </List.Item>
                  );
                }}
              />
            </Space>
          </ProCard>
        </Col>
        <Col xs={24} xl={15}>
          <ProCard title={selectedConfig?.config_key || '编辑配置'} className="dashboard-panel">
            <Space direction="vertical" size={14} style={{ width: '100%' }}>
              <Descriptions column={1} size="small" bordered>
                <Descriptions.Item label="配置键">{selectedConfig?.config_key || '-'}</Descriptions.Item>
                <Descriptions.Item label="分组">{selectedConfig?.group_name || '-'}</Descriptions.Item>
                <Descriptions.Item label="类型">{selectedConfig?.config_type || '-'}</Descriptions.Item>
                <Descriptions.Item label="说明">{selectedConfig?.description || '请选择要编辑的配置项'}</Descriptions.Item>
              </Descriptions>
              <Space wrap>
                <Button loading={clearingConfigCache} onClick={() => clearCache('configs')}>
                  清配置缓存
                </Button>
                <Button loading={clearingGoodsCache} onClick={() => clearCache('goods')}>
                  清商品缓存
                </Button>
              </Space>
              {selectedConfig?.config_type === 'bool' ? (
                <div className="config-editor-switch">
                  <Typography.Text>当前开关</Typography.Text>
                  <Switch checked={Boolean(configDraftValue)} onChange={(checked) => setConfigDraftValue(checked)} />
                </div>
              ) : selectedConfig?.config_type === 'int' ? (
                <InputNumber
                  style={{ width: '100%' }}
                  value={Number(configDraftValue ?? 0)}
                  onChange={(value) => setConfigDraftValue(Number(value ?? 0))}
                />
              ) : (
                <Input.TextArea
                  value={String(configDraftValue ?? '')}
                  onChange={(event) => setConfigDraftValue(event.target.value)}
                  rows={selectedConfig?.config_type === 'json' ? 18 : 14}
                />
              )}
              <Space wrap>
                <Button type="primary" loading={savingConfig} onClick={saveConfig}>
                  保存配置
                </Button>
                {selectedConfig?.config_type === 'json' ? (
                  <Button
                    onClick={() => {
                      try {
                        setConfigDraftValue(JSON.stringify(JSON.parse(String(configDraftValue || '{}')), null, 2));
                      } catch {
                        message.warning('当前 JSON 格式不正确，无法格式化');
                      }
                    }}
                  >
                    格式化 JSON
                  </Button>
                ) : null}
              </Space>
            </Space>
          </ProCard>
        </Col>
      </Row>
    );
  }

  function renderBody() {
    switch (activeSection) {
      case 'goods':
        return renderGoodsSection();
      case 'cards':
        return renderCardSection();
      case 'orders':
        return renderOrderSection();
      case 'agents':
        return renderAgentSection();
      case 'channels':
        return renderChannelSection();
      case 'configs':
        return renderConfigSection();
      case 'overview':
      default:
        return renderOverview();
    }
  }

  return (
    <Layout className="console-shell">
      {screens.lg ? (
        <Sider width={236} className="console-shell__sider">
          <div className="console-shell__brand">
            <Typography.Text className="console-shell__eyebrow">Admin Console</Typography.Text>
            <Typography.Title level={4} style={{ margin: '8px 0 0' }}>
              后台管理
            </Typography.Title>
          </div>
          {navigationMenu}
        </Sider>
      ) : (
        <Drawer
          placement="left"
          title="后台管理"
          open={navOpen}
          onClose={() => setNavOpen(false)}
          bodyStyle={{ padding: 0 }}
        >
          {navigationMenu}
        </Drawer>
      )}

      <Layout>
        <Header className="console-shell__header">
          <Space size={12}>
            {!screens.lg ? (
              <Button icon={<MenuOutlined />} onClick={() => setNavOpen(true)}>
                导航
              </Button>
            ) : null}
          </Space>
          <Space>
            <Button icon={<ReloadOutlined />} onClick={() => loadAll()}>
              刷新
            </Button>
            <Button onClick={() => setPasswordModalOpen(true)}>
              修改密码
            </Button>
            <Button icon={<LogoutOutlined />} onClick={handleLogout}>
              退出登录
            </Button>
          </Space>
        </Header>
        <Content className="console-shell__content">
          <PageContainer
            key={activeSection}
            ghost
            header={{
              title: currentSection.label,
              breadcrumb: undefined
            }}
          >
            {renderBody()}
          </PageContainer>
        </Content>
      </Layout>

      <DrawerForm<GoodsFormValues>
        title={editingGoods ? `编辑商品 #${editingGoods.id}` : '新增商品'}
        width={560}
        form={goodsForm}
        open={goodsDrawerOpen}
        drawerProps={{
          destroyOnClose: true,
          onClose: () => {
            setGoodsDrawerOpen(false);
            setEditingGoods(null);
          }
        }}
        onFinish={submitGoods}
      >
        <ProFormText name="title" label="商品标题" rules={[{ required: true, message: '请输入商品标题' }]} />
        <ProFormText name="slug" label="商品标识" placeholder="如 vip-card" />
        <ProFormText name="cover" label="封面地址" />
        <Row gutter={12}>
          <Col span={8}>
            <ProFormSelect
              name="cover_fit_mode"
              label="封面显示方式"
              valueEnum={{ cover: '填充裁切', contain: '完整显示', fill: '拉伸铺满', 'scale-down': '按比例缩小' }}
              rules={[{ required: true }]}
            />
          </Col>
          <Col span={8}>
            <ProFormDigit name="cover_width" label="封面宽度" min={80} fieldProps={{ style: { width: '100%' }, addonAfter: 'px' }} />
          </Col>
          <Col span={8}>
            <ProFormDigit name="cover_height" label="封面高度" min={80} fieldProps={{ style: { width: '100%' }, addonAfter: 'px' }} />
          </Col>
        </Row>
        <ProFormTextArea name="description" label="商品说明（Markdown）" fieldProps={{ rows: 5 }} />
        <ProFormTextArea
          name="delivery_instructions"
          label="发货说明（Markdown，可留空）"
          extra="留空时使用系统配置中的默认发货说明模板"
          fieldProps={{ rows: 5 }}
        />
        <Row gutter={12}>
          <Col span={12}>
            <ProFormDigit name="price" label="售价" min={0} fieldProps={{ style: { width: '100%' } }} rules={[{ required: true }]} />
          </Col>
          <Col span={12}>
            <ProFormDigit name="original_price" label="原价" min={0} fieldProps={{ style: { width: '100%' } }} />
          </Col>
        </Row>
        <Row gutter={12}>
          <Col span={12}>
            <ProFormSelect
              name="contact_type"
              label="联系方式类型"
              valueEnum={{ both: '手机号或邮箱', phone: '仅手机号', email: '仅邮箱' }}
              rules={[{ required: true }]}
            />
          </Col>
          <Col span={12}>
            <ProFormSelect name="status" label="状态" valueEnum={{ on: '上架', off: '下架' }} rules={[{ required: true }]} />
          </Col>
        </Row>
        <ProFormSelect
          name="pay_methods"
          label="支付方式按钮"
          mode="multiple"
          options={[
            { label: '支付宝', value: 'alipay' },
            { label: '微信支付', value: 'wxpay' }
          ]}
          rules={[{ required: true, message: '至少选择一种支付方式' }]}
        />
        <Row gutter={12}>
          <Col span={12}>
            <ProFormSelect
              name="stock_display_mode"
              label="前台库存展示"
              valueEnum={{ real: '显示真实库存', custom: '显示自定义文案' }}
              rules={[{ required: true }]}
            />
          </Col>
          <Col span={12}>
            <ProFormText name="stock_display_text" label="库存文案" placeholder="如：即将售罄" />
          </Col>
        </Row>
        <ProFormSwitch
          name="email_enabled"
          label="自动发货邮件"
          tooltip="仅当买家填写的是邮箱时才会发送"
        />
        <ProFormDependency name={['email_enabled']}>
          {({ email_enabled }) =>
            email_enabled ? (
              <>
                <ProFormText
                  name="email_subject_template"
                  label="邮件标题模板"
                  placeholder="如：您的订单 {{order_no}} 已自动发货"
                />
                <ProFormTextArea
                  name="email_body_template"
                  label="邮件正文模板（HTML）"
                  fieldProps={{ rows: 8 }}
                  extra="可用变量：{{goods_title}} {{order_no}} {{buyer_contact}} {{pay_time}} {{deliver_time}} {{amount}} {{card_code}} {{card_secret}} {{trade_no}}；其中 {{card_code}} 是主卡密，{{card_secret}} 是可选附加密钥，如果你只有单段卡密，只用 {{card_code}} 即可"
                />
              </>
            ) : null
          }
        </ProFormDependency>
        <ProFormDigit name="sort_order" label="排序" fieldProps={{ style: { width: '100%' } }} />
      </DrawerForm>

      <ModalForm<{ current_password: string; new_password: string; confirm_password: string }>
        title="修改管理员密码"
        open={passwordModalOpen}
        form={passwordForm}
        modalProps={{
          destroyOnClose: true,
          onCancel: () => {
            setPasswordModalOpen(false);
            passwordForm.resetFields();
          }
        }}
        onFinish={submitAdminPassword}
      >
        <ProFormText.Password
          name="current_password"
          label="当前密码"
          placeholder="请输入当前密码"
          rules={[{ required: true, message: '请输入当前密码' }]}
        />
        <ProFormText.Password
          name="new_password"
          label="新密码"
          placeholder="请输入新密码"
          rules={[
            { required: true, message: '请输入新密码' },
            { min: 6, message: '新密码至少 6 位' }
          ]}
        />
        <ProFormText.Password
          name="confirm_password"
          label="确认新密码"
          placeholder="请再次输入新密码"
          rules={[
            { required: true, message: '请再次输入新密码' },
            ({ getFieldValue }) => ({
              validator(_, value) {
                if (!value || value === getFieldValue('new_password')) {
                  return Promise.resolve();
                }
                return Promise.reject(new Error('两次输入的新密码不一致'));
              }
            })
          ]}
        />
      </ModalForm>

      <ModalForm<CardImportValues>
        title="批量导入卡密"
        open={cardModalOpen}
        form={cardForm}
        modalProps={{ destroyOnClose: true, onCancel: () => setCardModalOpen(false) }}
        onFinish={submitCards}
      >
        <ProFormSelect name="goods_id" label="关联商品" options={goodsOptions} rules={[{ required: true, message: '请选择商品' }]} />
        <ProFormTextArea
          name="cards_text"
          label="卡密内容"
          fieldProps={{ rows: 10 }}
          rules={[{ required: true, message: '请输入卡密内容' }]}
        />
      </ModalForm>

      <ModalForm<AgentFormValues>
        title={editingAgent ? `编辑代理 ${editingAgent.agent_code}` : '新增代理'}
        open={agentModalOpen}
        form={agentForm}
        modalProps={{
          destroyOnClose: true,
          onCancel: () => {
            setAgentModalOpen(false);
            setEditingAgent(null);
          }
        }}
        onFinish={submitAgent}
      >
        <ProFormText name="agent_code" label="代理编码" rules={[{ required: true, message: '请输入代理编码' }]} disabled={Boolean(editingAgent)} />
        <ProFormText name="agent_name" label="代理名称" rules={[{ required: true, message: '请输入代理名称' }]} />
        <ProFormText name="username" label="登录账号" rules={[{ required: true, message: '请输入登录账号' }]} />
        <ProFormText.Password name="password" label="登录密码" placeholder={editingAgent ? '留空表示不修改' : '新代理必填'} />
        <ProFormSelect name="status" label="状态" valueEnum={{ 1: '启用', 0: '禁用' }} rules={[{ required: true }]} />
        <ProFormSelect name="allowed_goods_ids" label="可推广商品" mode="multiple" options={goodsOptions} />
      </ModalForm>

      <ModalForm<ChannelFormValues>
        title={editingChannel ? `编辑渠道 ${editingChannel.channel_code}` : '新增来源渠道'}
        open={channelModalOpen}
        form={channelForm}
        modalProps={{
          destroyOnClose: true,
          onCancel: () => {
            setChannelModalOpen(false);
            setEditingChannel(null);
          }
        }}
        onFinish={submitChannel}
      >
        <ProFormSelect
          name="agent_code"
          label="所属代理"
          options={agentOptions}
          rules={[{ required: true, message: '请选择代理' }]}
          disabled={Boolean(editingChannel)}
        />
        <ProFormText name="channel_code" label="渠道编码" rules={[{ required: true, message: '请输入渠道编码' }]} disabled={Boolean(editingChannel)} />
        <ProFormText name="channel_name" label="渠道名称" rules={[{ required: true, message: '请输入渠道名称' }]} />
        <ProFormText name="promoter_name" label="博主名称" />
        <ProFormSelect name="goods_id" label="默认商品" options={goodsOptions} />
        <ProFormSelect name="status" label="状态" valueEnum={{ 1: '启用', 0: '禁用' }} rules={[{ required: true }]} />
        <ProFormTextArea name="note" label="备注" fieldProps={{ rows: 4 }} />
      </ModalForm>

      <ModalForm<ChannelBatchValues>
        title="批量新增来源渠道"
        open={channelBatchModalOpen}
        form={channelBatchForm}
        modalProps={{
          destroyOnClose: true,
          onCancel: () => setChannelBatchModalOpen(false)
        }}
        initialValues={{ status: 1 }}
        onFinish={submitChannelBatch}
      >
        <ProFormSelect name="agent_code" label="所属代理" options={agentOptions} rules={[{ required: true, message: '请选择代理' }]} />
        <ProFormSelect name="goods_id" label="默认商品" options={goodsOptions} />
        <ProFormSelect name="status" label="状态" valueEnum={{ 1: '启用', 0: '禁用' }} rules={[{ required: true }]} />
        <ProFormTextArea
          name="rows_text"
          label="批量内容"
          fieldProps={{ rows: 10 }}
          extra="每行一条，支持 channel_code,渠道名称,博主名称 或 channel_code----渠道名称----博主名称"
          rules={[{ required: true, message: '请输入批量内容' }]}
        />
      </ModalForm>

      <ChannelQrModal
        open={Boolean(qrChannel)}
        storageScope="admin"
        channel={qrChannel}
        siteUrl={siteUrl}
        fallbackGoodsId={goods[0]?.id}
        onClose={() => setQrChannel(null)}
      />
    </Layout>
  );
}

function SummaryCard({ title, value, extra }: { title: string; value: string | number; extra: string }) {
  return (
    <ProCard className="summary-card" bordered>
      <Statistic title={title} value={value} />
      <Typography.Text type="secondary">{extra}</Typography.Text>
    </ProCard>
  );
}
