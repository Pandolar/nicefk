import { CopyOutlined, DeleteOutlined, DownloadOutlined, ReloadOutlined, SaveOutlined } from '@ant-design/icons';
import { App, Button, Card, Col, Input, InputNumber, Modal, Row, Select, Space, Switch, Typography } from 'antd';
import { useEffect, useMemo, useRef, useState } from 'react';
import QRCodeStyling from 'qr-code-styling';
import type { ChannelItem } from '../types';
import {
  buildChannelQrFileName,
  buildChannelQrOptions,
  defaultChannelQrStyle,
  loadChannelQrPresets,
  loadLastChannelQrStyle,
  normalizeChannelQrStyle,
  saveChannelQrPresets,
  saveLastChannelQrStyle,
  type ChannelQrStylePreset,
  type ChannelQrStyleSettings
} from '../utils/channelQr';

type Props = {
  open: boolean;
  storageScope: string;
  channel: ChannelItem | null;
  siteUrl?: string;
  fallbackGoodsId?: number | null;
  onClose: () => void;
};

const dotTypeOptions = [
  { label: '圆角', value: 'rounded' },
  { label: '点状', value: 'dots' },
  { label: '方块', value: 'square' },
  { label: '圆润方块', value: 'extra-rounded' },
  { label: '精致', value: 'classy' },
  { label: '精致圆角', value: 'classy-rounded' }
];

const cornerSquareOptions = [
  { label: '方块', value: 'square' },
  { label: '圆角', value: 'rounded' },
  { label: '圆润方块', value: 'extra-rounded' },
  { label: '点状', value: 'dots' },
  { label: '精致', value: 'classy' },
  { label: '精致圆角', value: 'classy-rounded' }
];

const cornerDotOptions = [
  { label: '圆点', value: 'dot' },
  { label: '方块', value: 'square' },
  { label: '圆角', value: 'rounded' },
  { label: '点状', value: 'dots' },
  { label: '精致', value: 'classy' },
  { label: '精致圆角', value: 'classy-rounded' },
  { label: '圆润方块', value: 'extra-rounded' }
];

function resolvePromoLink(channel: ChannelItem | null, siteUrl?: string, fallbackGoodsId?: number | null) {
  if (!channel) {
    return '';
  }
  if (channel.promo_link) {
    return channel.promo_link;
  }
  const goodsId = channel.goods_id || fallbackGoodsId;
  if (!goodsId) {
    return '';
  }
  const baseUrl = (siteUrl || window.location.origin || '').replace(/\/$/, '');
  return `${baseUrl}/goods/${goodsId}?agent_code=${channel.agent_code}&channel_code=${channel.channel_code}`;
}

export function ChannelQrModal({ open, storageScope, channel, siteUrl, fallbackGoodsId, onClose }: Props) {
  const { message } = App.useApp();
  const previewRef = useRef<HTMLDivElement | null>(null);
  const qrInstanceRef = useRef<QRCodeStyling | null>(null);
  const renderedSettingsRef = useRef<ChannelQrStyleSettings>(defaultChannelQrStyle);
  const [settings, setSettings] = useState<ChannelQrStyleSettings>(defaultChannelQrStyle);
  const [presets, setPresets] = useState<ChannelQrStylePreset[]>([]);
  const [selectedPresetId, setSelectedPresetId] = useState<string>();
  const [presetName, setPresetName] = useState('');
  const [previewWarning, setPreviewWarning] = useState('');
  const promoLink = useMemo(() => resolvePromoLink(channel, siteUrl, fallbackGoodsId), [channel, fallbackGoodsId, siteUrl]);

  const presetOptions = useMemo(
    () => presets.map((item) => ({ label: item.name, value: item.id })),
    [presets]
  );

  useEffect(() => {
    if (!open) {
      return;
    }
    setPresets(loadChannelQrPresets(storageScope));
    setSettings(loadLastChannelQrStyle(storageScope));
    setSelectedPresetId(undefined);
    setPresetName('');
  }, [open, storageScope]);

  useEffect(() => {
    if (!open) {
      setPreviewWarning('');
      qrInstanceRef.current = null;
      return;
    }

    const containerElement = previewRef.current;
    if (!containerElement) {
      return;
    }
    const container = containerElement;

    let cancelled = false;

    async function mountInstance(nextSettings: ChannelQrStyleSettings) {
      const instance = new QRCodeStyling(buildChannelQrOptions(promoLink, nextSettings));
      container.innerHTML = '';
      instance.append(container);
      await instance.getRawData('svg');
      if (cancelled) {
        return;
      }
      qrInstanceRef.current = instance;
      renderedSettingsRef.current = nextSettings;
    }

    async function renderPreview() {
      qrInstanceRef.current = null;
      setPreviewWarning('');
      container.innerHTML = '';

      if (!promoLink) {
        return;
      }

      const normalizedSettings = normalizeChannelQrStyle(settings);
      try {
        await mountInstance(normalizedSettings);
      } catch {
        if (!normalizedSettings.image) {
          if (!cancelled) {
            container.innerHTML = '';
            message.error('二维码生成失败，请检查当前样式配置');
          }
          return;
        }

        try {
          const fallbackSettings = normalizeChannelQrStyle({ ...normalizedSettings, image: '' });
          await mountInstance(fallbackSettings);
          if (!cancelled) {
            setPreviewWarning('中心 Logo 加载失败，已自动切换为无 Logo 版本进行预览和下载。');
            message.warning('中心 Logo 加载失败，已自动切换为无 Logo 二维码');
          }
        } catch {
          if (!cancelled) {
            container.innerHTML = '';
            message.error('二维码生成失败，请检查推广链接或样式配置');
          }
        }
      }
    }

    void renderPreview();

    return () => {
      cancelled = true;
      qrInstanceRef.current = null;
      container.innerHTML = '';
    };
  }, [message, open, promoLink, settings]);

  useEffect(() => {
    if (!open) {
      return;
    }
    saveLastChannelQrStyle(storageScope, settings);
  }, [open, settings, storageScope]);

  function updateSetting<Key extends keyof ChannelQrStyleSettings>(key: Key, value: ChannelQrStyleSettings[Key]) {
    setSettings((current) => ({
      ...current,
      [key]: value
    }));
  }

  function applyPreset(presetId?: string) {
    setSelectedPresetId(presetId);
    if (!presetId) {
      return;
    }
    const preset = presets.find((item) => item.id === presetId);
    if (!preset) {
      return;
    }
    setSettings(preset.settings);
    saveLastChannelQrStyle(storageScope, preset.settings);
  }

  function handleSavePreset() {
    const name = presetName.trim();
    if (!name) {
      message.warning('请输入样式名称');
      return;
    }
    const now = new Date().toISOString();
    const existing = presets.find((item) => item.name === name);
    const nextPreset: ChannelQrStylePreset = existing
      ? { ...existing, updatedAt: now, settings }
      : {
          id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
          name,
          updatedAt: now,
          settings
        };
    const nextPresets = existing
      ? presets.map((item) => (item.id === existing.id ? nextPreset : item))
      : [nextPreset, ...presets];
    setPresets(nextPresets);
    setSelectedPresetId(nextPreset.id);
    saveChannelQrPresets(storageScope, nextPresets);
    message.success(existing ? '二维码样式已更新' : '二维码样式已保存');
  }

  function handleDeletePreset() {
    if (!selectedPresetId) {
      message.warning('请先选择要删除的样式');
      return;
    }
    const nextPresets = presets.filter((item) => item.id !== selectedPresetId);
    setPresets(nextPresets);
    setSelectedPresetId(undefined);
    saveChannelQrPresets(storageScope, nextPresets);
    message.success('二维码样式已删除');
  }

  async function copyPromoLink() {
    if (!promoLink) {
      message.warning('当前渠道还没有可用推广链接');
      return;
    }
    try {
      await navigator.clipboard.writeText(promoLink);
      message.success('推广链接已复制');
    } catch {
      message.error('复制失败，请检查浏览器剪贴板权限');
    }
  }

  async function downloadQr(extension: 'png' | 'svg') {
    if (!promoLink || !channel) {
      message.warning('当前渠道还没有可下载的二维码');
      return;
    }

    async function resolveBlob() {
      const activeInstance = qrInstanceRef.current;
      if (activeInstance) {
        const raw = await activeInstance.getRawData(extension);
        if (raw instanceof Blob) {
          return { blob: raw, fallbackUsed: renderedSettingsRef.current.image !== settings.image };
        }
      }

      const normalizedSettings = normalizeChannelQrStyle(settings);
      if (!normalizedSettings.image) {
        return null;
      }

      const fallbackInstance = new QRCodeStyling(buildChannelQrOptions(promoLink, { ...normalizedSettings, image: '' }));
      const raw = await fallbackInstance.getRawData(extension);
      if (raw instanceof Blob) {
        return { blob: raw, fallbackUsed: true };
      }
      return null;
    }

    try {
      const result = await resolveBlob();
      if (!result) {
        throw new Error('qr-download-failed');
      }
      const url = URL.createObjectURL(result.blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `${buildChannelQrFileName(channel.agent_code, channel.channel_code)}.${extension}`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 0);
      if (result.fallbackUsed) {
        message.warning('Logo 加载失败，已下载无 Logo 版本二维码');
      }
    } catch {
      message.error('下载失败，请检查推广链接或 Logo 图片地址是否可访问');
    }
  }

  return (
    <Modal
      title={channel ? `渠道二维码 · ${channel.channel_name}` : '渠道二维码'}
      open={open}
      onCancel={onClose}
      footer={null}
      width={1040}
      destroyOnClose
    >
      <Row gutter={[16, 16]}>
        <Col xs={24} lg={10}>
          <Card className="channel-qr-card" bordered={false}>
            <Space direction="vertical" size={12} style={{ width: '100%' }}>
              <Typography.Text strong>{channel?.channel_name || '-'}</Typography.Text>
              <Typography.Text type="secondary" copyable={Boolean(promoLink) ? { text: promoLink } : false}>
                {promoLink || '当前渠道暂无推广链接'}
              </Typography.Text>
              <div className="channel-qr-preview">
                <div ref={previewRef} className="channel-qr-preview__canvas" />
              </div>
              <Space wrap>
                <Button icon={<CopyOutlined />} onClick={copyPromoLink}>
                  复制链接
                </Button>
                <Button type="primary" icon={<DownloadOutlined />} onClick={() => downloadQr('png')}>
                  下载 PNG
                </Button>
                <Button icon={<DownloadOutlined />} onClick={() => downloadQr('svg')}>
                  下载 SVG
                </Button>
                <Button icon={<ReloadOutlined />} onClick={() => setSettings(defaultChannelQrStyle)}>
                  恢复默认
                </Button>
              </Space>
            </Space>
          </Card>
        </Col>
        <Col xs={24} lg={14}>
          <Space direction="vertical" size={16} style={{ width: '100%' }}>
            <Card className="channel-qr-card" bordered={false}>
              <Space direction="vertical" size={12} style={{ width: '100%' }}>
                <Typography.Text strong>样式方案</Typography.Text>
                <Space wrap style={{ width: '100%' }}>
                  <Select
                    allowClear
                    placeholder="选择已保存样式"
                    value={selectedPresetId}
                    options={presetOptions}
                    onChange={applyPreset}
                    style={{ minWidth: 220 }}
                  />
                  <Input
                    placeholder="输入样式名称后保存"
                    value={presetName}
                    onChange={(event) => setPresetName(event.target.value)}
                    style={{ minWidth: 220 }}
                  />
                  <Button type="primary" icon={<SaveOutlined />} onClick={handleSavePreset}>
                    保存样式
                  </Button>
                  <Button danger icon={<DeleteOutlined />} disabled={!selectedPresetId} onClick={handleDeletePreset}>
                    删除样式
                  </Button>
                </Space>
                <Typography.Text type="secondary">
                  当前样式会自动记住，下次新增或查看其他博主渠道二维码时会默认沿用。
                </Typography.Text>
                {previewWarning ? <Typography.Text type="warning">{previewWarning}</Typography.Text> : null}
                {!promoLink ? (
                  <Typography.Text type="warning">
                    当前渠道没有可用推广链接。请为该渠道绑定默认商品，或检查站点地址配置。
                  </Typography.Text>
                ) : null}
              </Space>
            </Card>

            <Card className="channel-qr-card" bordered={false}>
              <Row gutter={[12, 12]}>
                <Col xs={12} md={8}>
                  <Typography.Text type="secondary">尺寸</Typography.Text>
                  <InputNumber min={180} max={960} value={settings.width} onChange={(value) => updateSetting('width', Number(value || 320))} style={{ width: '100%' }} />
                </Col>
                <Col xs={12} md={8}>
                  <Typography.Text type="secondary">边距</Typography.Text>
                  <InputNumber min={0} max={40} value={settings.margin} onChange={(value) => updateSetting('margin', Number(value || 0))} style={{ width: '100%' }} />
                </Col>
                <Col xs={12} md={8}>
                  <Typography.Text type="secondary">容错率</Typography.Text>
                  <Select
                    value={settings.errorCorrectionLevel}
                    options={[
                      { label: 'L 低', value: 'L' },
                      { label: 'M 中', value: 'M' },
                      { label: 'Q 高', value: 'Q' },
                      { label: 'H 很高', value: 'H' }
                    ]}
                    onChange={(value) => updateSetting('errorCorrectionLevel', value)}
                  />
                </Col>
                <Col xs={12} md={8}>
                  <Typography.Text type="secondary">整体形态</Typography.Text>
                  <Select
                    value={settings.shape}
                    options={[
                      { label: '方形', value: 'square' },
                      { label: '圆形', value: 'circle' }
                    ]}
                    onChange={(value) => updateSetting('shape', value)}
                  />
                </Col>
                <Col xs={12} md={8}>
                  <Typography.Text type="secondary">点阵样式</Typography.Text>
                  <Select value={settings.dotsType} options={dotTypeOptions} onChange={(value) => updateSetting('dotsType', value)} />
                </Col>
                <Col xs={12} md={8}>
                  <Typography.Text type="secondary">点阵颜色</Typography.Text>
                  <Input type="color" value={settings.dotsColor} onChange={(event) => updateSetting('dotsColor', event.target.value)} />
                </Col>
                <Col xs={12} md={8}>
                  <Typography.Text type="secondary">定位框样式</Typography.Text>
                  <Select
                    value={settings.cornersSquareType}
                    options={cornerSquareOptions}
                    onChange={(value) => updateSetting('cornersSquareType', value)}
                  />
                </Col>
                <Col xs={12} md={8}>
                  <Typography.Text type="secondary">定位框颜色</Typography.Text>
                  <Input
                    type="color"
                    value={settings.cornersSquareColor}
                    onChange={(event) => updateSetting('cornersSquareColor', event.target.value)}
                  />
                </Col>
                <Col xs={12} md={8}>
                  <Typography.Text type="secondary">中心点样式</Typography.Text>
                  <Select value={settings.cornersDotType} options={cornerDotOptions} onChange={(value) => updateSetting('cornersDotType', value)} />
                </Col>
                <Col xs={12} md={8}>
                  <Typography.Text type="secondary">中心点颜色</Typography.Text>
                  <Input type="color" value={settings.cornersDotColor} onChange={(event) => updateSetting('cornersDotColor', event.target.value)} />
                </Col>
                <Col xs={12} md={8}>
                  <Typography.Text type="secondary">背景颜色</Typography.Text>
                  <Input type="color" value={settings.backgroundColor} onChange={(event) => updateSetting('backgroundColor', event.target.value)} />
                </Col>
                <Col xs={24}>
                  <Typography.Text type="secondary">中心 Logo 地址</Typography.Text>
                  <Input
                    placeholder="https://example.com/logo.png"
                    value={settings.image}
                    onChange={(event) => updateSetting('image', event.target.value)}
                  />
                </Col>
                <Col xs={12} md={8}>
                  <Typography.Text type="secondary">Logo 比例</Typography.Text>
                  <InputNumber
                    min={0.1}
                    max={0.5}
                    step={0.02}
                    value={settings.imageSize}
                    onChange={(value) => updateSetting('imageSize', Number(value || 0.28))}
                    style={{ width: '100%' }}
                  />
                </Col>
                <Col xs={12} md={8}>
                  <Typography.Text type="secondary">Logo 边距</Typography.Text>
                  <InputNumber
                    min={0}
                    max={20}
                    value={settings.imageMargin}
                    onChange={(value) => updateSetting('imageMargin', Number(value || 0))}
                    style={{ width: '100%' }}
                  />
                </Col>
                <Col xs={24} md={8}>
                  <Typography.Text type="secondary">隐藏 Logo 遮挡点阵</Typography.Text>
                  <div className="channel-qr-switch">
                    <Switch checked={settings.hideBackgroundDots} onChange={(value) => updateSetting('hideBackgroundDots', value)} />
                  </div>
                </Col>
              </Row>
            </Card>
          </Space>
        </Col>
      </Row>
    </Modal>
  );
}
