import {
  CopyOutlined,
  LinkOutlined,
  LogoutOutlined,
  MenuOutlined,
  PlusOutlined,
  ReloadOutlined,
  TagsOutlined,
  UnorderedListOutlined
} from '@ant-design/icons';
import {
  ModalForm,
  PageContainer,
  ProCard,
  ProFormSelect,
  ProFormText,
  ProFormTextArea,
  ProTable,
  type ProColumns
} from '@ant-design/pro-components';
import { App, Button, Drawer, Form, Grid, Layout, Menu, Space, Statistic, Typography } from 'antd';
import type { MenuProps } from 'antd';
import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { api, authHeaders, getErrorMessage, unwrap } from '../api/client';
import { StatusTag } from '../components/StatusTag';
import type { AgentDashboardSummary, ChannelItem, GoodsItem, OrderInfo } from '../types';
import { AGENT_CODE_KEY, AGENT_TOKEN_KEY, clearAgentSession } from '../utils/auth';
import { formatCurrency, formatDateTime, normalizePayMethodLabel, toPlainText, toSearchText } from '../utils/format';

const { Header, Sider, Content } = Layout;

const menuItems = [
  { key: 'overview', icon: <TagsOutlined />, label: '总览' },
  { key: 'channels', icon: <LinkOutlined />, label: '来源渠道' },
  { key: 'orders', icon: <UnorderedListOutlined />, label: '支付流水' }
] as const;

type AgentSectionKey = (typeof menuItems)[number]['key'];

function isAgentSectionKey(value: string | undefined): value is AgentSectionKey {
  return menuItems.some((item) => item.key === value);
}

type AgentChannelFormValues = {
  channel_code: string;
  channel_name: string;
  promoter_name?: string;
  goods_id?: number;
  status: number;
  note?: string;
};

type AgentChannelBatchValues = {
  goods_id?: number;
  status: number;
  rows_text: string;
};

const smallTableSearch = {
  labelWidth: 'auto' as const,
  defaultCollapsed: false,
  collapseRender: false as const
};

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

function parseTimeValue(value: unknown) {
  if (value && typeof value === 'object' && 'valueOf' in value && typeof value.valueOf === 'function') {
    const raw = Number(value.valueOf());
    if (!Number.isNaN(raw) && raw > 0) {
      return raw;
    }
  }
  return Date.parse(toPlainText(value));
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

export function AgentDashboardPage() {
  const navigate = useNavigate();
  const { section } = useParams();
  const { message } = App.useApp();
  const screens = Grid.useBreakpoint();
  const token = localStorage.getItem(AGENT_TOKEN_KEY);
  const agentCode = localStorage.getItem(AGENT_CODE_KEY) || '';

  const [navOpen, setNavOpen] = useState(false);
  const [summary, setSummary] = useState<AgentDashboardSummary>({});
  const [orders, setOrders] = useState<OrderInfo[]>([]);
  const [channels, setChannels] = useState<ChannelItem[]>([]);
  const [goods, setGoods] = useState<GoodsItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [channelModalOpen, setChannelModalOpen] = useState(false);
  const [channelBatchModalOpen, setChannelBatchModalOpen] = useState(false);
  const [editingChannel, setEditingChannel] = useState<ChannelItem | null>(null);
  const [selectedChannelKeys, setSelectedChannelKeys] = useState<string[]>([]);
  const [reloadToken, setReloadToken] = useState(0);

  const [channelForm] = Form.useForm<AgentChannelFormValues>();
  const [channelBatchForm] = Form.useForm<AgentChannelBatchValues>();

  const activeSection: AgentSectionKey = isAgentSectionKey(section) ? section : 'overview';
  const currentSection = menuItems.find((item) => item.key === activeSection) ?? menuItems[0];
  const paidOrders = useMemo(() => orders.filter((item) => item.status === 'delivered' || item.status === 'paid'), [orders]);
  const navigationItems: MenuProps['items'] = menuItems.map((item) => ({ key: item.key, icon: item.icon, label: item.label }));
  const goodsOptions = useMemo(
    () => goods.map((item) => ({ label: `${item.id} - ${item.title}`, value: item.id })),
    [goods]
  );

  const channelColumns: ProColumns<ChannelItem>[] = [
    { title: '关键词', dataIndex: 'keyword', hideInTable: true, fieldProps: { placeholder: '搜索渠道 / 博主 / 编码' } },
    { title: '状态', dataIndex: 'status', hideInTable: true, valueType: 'select', valueEnum: { 1: { text: '启用' }, 0: { text: '禁用' } } },
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
    { title: '渠道编码', dataIndex: 'channel_code', copyable: true, width: 140 },
    { title: '渠道名称', dataIndex: 'channel_name' },
    { title: '博主', dataIndex: 'promoter_name', renderText: (value) => toPlainText(value) || '-', search: false },
    { title: '添加时间', dataIndex: 'created_at', width: 168, search: false, sorter: true, renderText: (value) => formatDateTime(value) },
    { title: '浏览', dataIndex: 'visit_pv', sorter: true, search: false, render: (_, record) => `${record.visit_pv} / UV ${record.visit_uv}` },
    { title: '下单', dataIndex: 'order_count', sorter: true, search: false },
    { title: '支付', dataIndex: 'paid_count', sorter: true, search: false },
    { title: '金额', dataIndex: 'paid_amount', sorter: true, search: false, renderText: (value) => `￥${formatCurrency(value)}` },
    {
      title: '推广链接',
      dataIndex: 'promo_link',
      copyable: true,
      ellipsis: true,
      search: false,
      renderText: (value) => toPlainText(value) || '-'
    },
    {
      title: '操作',
      valueType: 'option',
      width: 80,
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
        </Button>
      ]
    }
  ];

  const orderColumns: ProColumns<OrderInfo>[] = [
    { title: '关键词', dataIndex: 'keyword', hideInTable: true, fieldProps: { placeholder: '搜索订单号 / 联系方式 / 渠道' } },
    {
      title: '渠道',
      dataIndex: 'source_channel_code',
      hideInTable: true,
      valueType: 'select',
      fieldProps: {
        allowClear: true,
        options: channels.map((item) => ({
          label: `${item.channel_name} (${item.channel_code})`,
          value: item.channel_code
        }))
      }
    },
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
    { title: '订单号', dataIndex: 'order_no', copyable: true, ellipsis: true },
    { title: '联系方式', dataIndex: 'buyer_contact', ellipsis: true, search: false },
    { title: '数量', dataIndex: 'quantity', width: 80, search: false, sorter: true, renderText: (value) => toPlainText(value) || '1' },
    { title: '金额', dataIndex: 'amount', sorter: true, search: false, renderText: (value) => `￥${formatCurrency(value)}` },
    { title: '支付方式', dataIndex: 'pay_method', search: false, renderText: (value) => normalizePayMethodLabel(value) },
    {
      title: '来源渠道',
      dataIndex: 'source_channel_name',
      search: false,
      render: (_, record) => toPlainText(record.source_channel_name) || toPlainText(record.source_channel_code) || '-'
    },
    { title: '状态', dataIndex: 'status', search: false, render: (_, record) => <StatusTag status={record.status} /> },
    { title: '发卡时间', dataIndex: 'deliver_time', search: false, sorter: true, renderText: (value) => formatDateTime(value) }
  ];

  useEffect(() => {
    if (section && isAgentSectionKey(section)) {
      return;
    }
    navigate('/agent/dashboard/overview', { replace: true });
  }, [navigate, section]);

  useEffect(() => {
    if (!token) {
      return;
    }
    loadAll();
  }, [token]);

  useEffect(() => {
    if (!channelModalOpen) {
      return;
    }
    channelForm.setFieldsValue(
      editingChannel
        ? {
            channel_code: editingChannel.channel_code,
            channel_name: editingChannel.channel_name,
            promoter_name: editingChannel.promoter_name ?? undefined,
            goods_id: editingChannel.goods_id ?? undefined,
            status: editingChannel.status,
            note: editingChannel.note ?? undefined
          }
        : {
            channel_code: '',
            channel_name: '',
            promoter_name: undefined,
            goods_id: goods[0]?.id,
            status: 1,
            note: undefined
          }
    );
  }, [channelModalOpen, editingChannel, channelForm, goods]);

  async function loadAll() {
    if (!token) {
      return;
    }
    setLoading(true);
    try {
      const headers = authHeaders(token);
      const [summaryData, orderData, channelData, goodsData] = await Promise.all([
        unwrap<AgentDashboardSummary>(api.get('/api/agent/dashboard', { headers })),
        unwrap<OrderInfo[]>(api.get('/api/agent/orders', { headers })),
        unwrap<ChannelItem[]>(api.get('/api/agent/channels', { headers })),
        unwrap<GoodsItem[]>(api.get('/api/agent/goods', { headers }))
      ]);
      setSummary(summaryData);
      setOrders(orderData);
      setChannels(channelData);
      setGoods(goodsData);
      setReloadToken((value) => value + 1);
    } catch (error) {
      message.error(getErrorMessage(error, '代理数据加载失败'));
    } finally {
      setLoading(false);
    }
  }

  function handleLogout() {
    clearAgentSession();
    navigate('/agent/login');
  }

  async function submitChannel(values: AgentChannelFormValues) {
    if (!token) {
      return false;
    }
    try {
      const payload = {
        ...values,
        agent_code: agentCode,
        promoter_name: values.promoter_name || undefined,
        goods_id: values.goods_id || undefined,
        note: values.note || undefined
      };
      if (editingChannel) {
        await unwrap<ChannelItem>(api.put(`/api/agent/channels/${editingChannel.channel_code}`, payload, { headers: authHeaders(token) }));
        message.success('渠道更新成功');
      } else {
        await unwrap<ChannelItem>(api.post('/api/agent/channels', payload, { headers: authHeaders(token) }));
        message.success('渠道创建成功');
      }
      setChannelModalOpen(false);
      setEditingChannel(null);
      channelForm.resetFields();
      await loadAll();
      return true;
    } catch (error) {
      message.error(getErrorMessage(error, '渠道保存失败'));
      return false;
    }
  }

  async function submitChannelBatch(values: AgentChannelBatchValues) {
    if (!token) {
      return false;
    }
    try {
      const result = await unwrap<{ imported: number; skipped: number }>(
        api.post(
          '/api/agent/channels/batch',
          {
            ...values,
            agent_code: agentCode
          },
          { headers: authHeaders(token) }
        )
      );
      message.success(`批量新增完成，成功 ${result.imported} 条，跳过 ${result.skipped} 条`);
      setChannelBatchModalOpen(false);
      channelBatchForm.resetFields();
      await loadAll();
      return true;
    } catch (error) {
      message.error(getErrorMessage(error, '批量新增失败'));
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
      message.warning('请先选择渠道');
      return;
    }
    try {
      await navigator.clipboard.writeText(text);
      message.success('已复制选中链接');
    } catch {
      message.error('复制失败，请检查剪贴板权限');
    }
  }

  function renderOverview() {
    const totalSuccessAmount = paidOrders.reduce((sum, item) => sum + Number(item.amount || 0), 0);
    const todayKey = getShanghaiDateKey(new Date().toISOString());
    const todayAmount = paidOrders.reduce((sum, item) => {
      return getShanghaiDateKey(getSuccessfulOrderTime(item)) === todayKey ? sum + Number(item.amount || 0) : sum;
    }, 0);
    const amount7d = getTrailingAmount(paidOrders, 7);
    const amount30d = getTrailingAmount(paidOrders, 30);
    const onSaleGoodsCount = goods.filter((item) => item.status === 'on').length;
    const availableCardCount = goods.reduce((sum, item) => sum + item.available_stock, 0);
    const dailyRows = buildDailyAmountRows(paidOrders, 7);
    const maxDailyAmount = Math.max(...dailyRows.map((item) => item.amount), 1);

    return (
      <Space direction="vertical" size={16} style={{ width: '100%' }}>
        <div className="dashboard-stat-grid">
          <SummaryCard title="交易成功总金额" value={`￥${formatCurrency(totalSuccessAmount)}`} extra={`${paidOrders.length} 笔成功订单`} />
          <SummaryCard title="今日金额" value={`￥${formatCurrency(todayAmount)}`} extra="按北京时间统计" />
          <SummaryCard title="近 7 日金额" value={`￥${formatCurrency(amount7d)}`} extra="最近 7 天成功支付" />
          <SummaryCard title="近 30 日金额" value={`￥${formatCurrency(amount30d)}`} extra="最近 30 天成功支付" />
          <SummaryCard title="在售商品数量" value={onSaleGoodsCount} extra={`${goods.length} 个可推广商品`} />
          <SummaryCard title="可用卡密总数量" value={availableCardCount} extra="按当前商品库存统计" />
        </div>

        <div className="dashboard-two-column">
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

          <ProCard title="来源渠道表现" className="dashboard-panel">
            <div className="list-stack">
              {channels.length ? (
                channels.slice(0, 6).map((item) => (
                  <div key={item.channel_code} className="list-line list-line--compact">
                    <div>
                      <Typography.Text strong>{item.channel_name}</Typography.Text>
                      <div className="muted-text">{item.promoter_name || item.channel_code}</div>
                    </div>
                    <div className="list-line__right">
                      <Typography.Text>￥{formatCurrency(item.paid_amount)}</Typography.Text>
                      <Typography.Text type="secondary">{item.paid_count} 单</Typography.Text>
                    </div>
                  </div>
                ))
              ) : (
                <Typography.Text type="secondary">你还没有创建来源渠道。</Typography.Text>
              )}
            </div>
          </ProCard>
        </div>
      </Space>
    );
  }

  function renderChannels() {
    return (
      <ProTable<ChannelItem>
        key="agent-channels-table"
        rowKey={(record) => `${record.agent_code}-${record.channel_code}`}
        params={{ reloadToken }}
        columns={channelColumns}
        loading={loading}
        search={smallTableSearch}
        size="small"
        cardBordered
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
            icon={<PlusOutlined />}
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
          <Button key="copy" icon={<CopyOutlined />} disabled={!selectedChannelKeys.length} onClick={copySelectedChannelLinks}>
            复制选中链接
          </Button>
        ]}
        request={async (params, sorter) => {
          const keyword = toSearchText(params.keyword);
          const status = toPlainText(params.status).trim();
          const startAt = params.created_from ? parseTimeValue(params.created_from) : null;
          const endAt = params.created_to ? parseTimeValue(params.created_to) : null;
          const filtered = channels.filter((item) => {
            const createdAt = item.created_at ? new Date(item.created_at).getTime() : null;
            const hitKeyword = !keyword || toSearchText(item.channel_code, item.channel_name, item.promoter_name).includes(keyword);
            const hitStatus = !status || String(item.status) === status;
            const hitTime =
              (!startAt || (createdAt !== null && createdAt >= startAt)) &&
              (!endAt || (createdAt !== null && createdAt <= endAt + 86400000));
            return hitKeyword && hitStatus && hitTime;
          });
          return toPagedResult(applySorter(filtered, sorter as Record<string, string>), params);
        }}
      />
    );
  }

  function renderOrders() {
    return (
      <ProTable<OrderInfo>
        key="agent-orders-table"
        rowKey="order_no"
        params={{ reloadToken }}
        columns={orderColumns}
        loading={loading}
        search={smallTableSearch}
        size="small"
        cardBordered
        pagination={{ pageSize: 10, showSizeChanger: false }}
        options={false}
        request={async (params, sorter) => {
          const keyword = toSearchText(params.keyword);
          const channelCode = toPlainText(params.source_channel_code).trim();
          const startAt = params.created_from ? parseTimeValue(params.created_from) : null;
          const endAt = params.created_to ? parseTimeValue(params.created_to) : null;
          const filtered = paidOrders.filter((item) => {
            const createdAt = item.created_at ? new Date(item.created_at).getTime() : null;
            const hitKeyword =
              !keyword || toSearchText(item.order_no, item.buyer_contact, item.source_channel_code, item.source_channel_name).includes(keyword);
            const hitChannel = !channelCode || item.source_channel_code === channelCode;
            const hitTime =
              (!startAt || (createdAt !== null && createdAt >= startAt)) &&
              (!endAt || (createdAt !== null && createdAt <= endAt + 86400000));
            return hitKeyword && hitChannel && hitTime;
          });
          return toPagedResult(applySorter(filtered, sorter as Record<string, string>), params);
        }}
      />
    );
  }

  return (
    <Layout className="console-shell console-shell--agent">
      {screens.lg ? (
        <Sider width={236} className="console-shell__sider">
          <div className="console-shell__brand">
            <Typography.Text className="console-shell__eyebrow">Agent Console</Typography.Text>
            <Typography.Title level={4} style={{ margin: '8px 0 0' }}>
              代理工作台
            </Typography.Title>
          </div>
          <Menu
            mode="inline"
            selectedKeys={[activeSection]}
            items={navigationItems}
            onClick={(info) => navigate(`/agent/dashboard/${info.key}`)}
          />
        </Sider>
      ) : (
        <Drawer placement="left" title="代理工作台" open={navOpen} onClose={() => setNavOpen(false)} bodyStyle={{ padding: 0 }}>
          <Menu
            mode="inline"
            selectedKeys={[activeSection]}
            items={navigationItems}
            onClick={(info) => {
              navigate(`/agent/dashboard/${info.key}`);
              setNavOpen(false);
            }}
          />
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
            <Button icon={<LogoutOutlined />} onClick={handleLogout}>
              退出登录
            </Button>
          </Space>
        </Header>
        <Content className="console-shell__content">
          <PageContainer key={activeSection} ghost header={{ title: currentSection.label, breadcrumb: undefined }}>
            {activeSection === 'overview' ? renderOverview() : null}
            {activeSection === 'channels' ? renderChannels() : null}
            {activeSection === 'orders' ? renderOrders() : null}
          </PageContainer>
        </Content>
      </Layout>

      <ModalForm<AgentChannelFormValues>
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
        <ProFormText name="channel_code" label="渠道编码" rules={[{ required: true, message: '请输入渠道编码' }]} disabled={Boolean(editingChannel)} />
        <ProFormText name="channel_name" label="渠道名称" rules={[{ required: true, message: '请输入渠道名称' }]} />
        <ProFormText name="promoter_name" label="博主名称" />
        <ProFormSelect name="goods_id" label="默认商品" options={goodsOptions} />
        <ProFormSelect name="status" label="状态" valueEnum={{ 1: '启用', 0: '禁用' }} rules={[{ required: true }]} />
        <ProFormTextArea name="note" label="备注" fieldProps={{ rows: 4 }} />
      </ModalForm>

      <ModalForm<AgentChannelBatchValues>
        title="批量新增来源渠道"
        open={channelBatchModalOpen}
        form={channelBatchForm}
        modalProps={{
          destroyOnClose: true,
          onCancel: () => setChannelBatchModalOpen(false)
        }}
        initialValues={{ status: 1, goods_id: goods[0]?.id }}
        onFinish={submitChannelBatch}
      >
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
