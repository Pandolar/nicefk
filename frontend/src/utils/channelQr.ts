import type { CornerDotType, CornerSquareType, DotType, ErrorCorrectionLevel, Options, ShapeType } from 'qr-code-styling';

export type ChannelQrStyleSettings = {
  width: number;
  height: number;
  margin: number;
  shape: ShapeType;
  errorCorrectionLevel: ErrorCorrectionLevel;
  dotsType: DotType;
  dotsColor: string;
  cornersSquareType: CornerSquareType;
  cornersSquareColor: string;
  cornersDotType: CornerDotType;
  cornersDotColor: string;
  backgroundColor: string;
  image: string;
  imageSize: number;
  imageMargin: number;
  hideBackgroundDots: boolean;
};

export type ChannelQrStylePreset = {
  id: string;
  name: string;
  updatedAt: string;
  settings: ChannelQrStyleSettings;
};

const STORAGE_PREFIX = 'nicefk-channel-qr';

export const defaultChannelQrStyle: ChannelQrStyleSettings = {
  width: 320,
  height: 320,
  margin: 8,
  shape: 'square',
  errorCorrectionLevel: 'H',
  dotsType: 'rounded',
  dotsColor: '#111827',
  cornersSquareType: 'extra-rounded',
  cornersSquareColor: '#111827',
  cornersDotType: 'dot',
  cornersDotColor: '#2563eb',
  backgroundColor: '#ffffff',
  image: '',
  imageSize: 0.28,
  imageMargin: 4,
  hideBackgroundDots: true
};

function storageKey(scope: string, suffix: 'presets' | 'last-style') {
  return `${STORAGE_PREFIX}:${scope}:${suffix}`;
}

function safeParse<T>(value: string | null): T | null {
  if (!value) {
    return null;
  }
  try {
    return JSON.parse(value) as T;
  } catch {
    return null;
  }
}

function normalizeStyle(value?: Partial<ChannelQrStyleSettings> | null): ChannelQrStyleSettings {
  return {
    ...defaultChannelQrStyle,
    ...value,
    image: String(value?.image || '')
  };
}

export function loadChannelQrPresets(scope: string): ChannelQrStylePreset[] {
  if (typeof window === 'undefined') {
    return [];
  }
  const rows = safeParse<ChannelQrStylePreset[]>(window.localStorage.getItem(storageKey(scope, 'presets'))) || [];
  return rows.map((item) => ({
    ...item,
    settings: normalizeStyle(item.settings)
  }));
}

export function saveChannelQrPresets(scope: string, presets: ChannelQrStylePreset[]) {
  if (typeof window === 'undefined') {
    return;
  }
  window.localStorage.setItem(storageKey(scope, 'presets'), JSON.stringify(presets));
}

export function loadLastChannelQrStyle(scope: string): ChannelQrStyleSettings {
  if (typeof window === 'undefined') {
    return defaultChannelQrStyle;
  }
  return normalizeStyle(safeParse<Partial<ChannelQrStyleSettings>>(window.localStorage.getItem(storageKey(scope, 'last-style'))));
}

export function saveLastChannelQrStyle(scope: string, settings: ChannelQrStyleSettings) {
  if (typeof window === 'undefined') {
    return;
  }
  window.localStorage.setItem(storageKey(scope, 'last-style'), JSON.stringify(settings));
}

export function buildChannelQrOptions(data: string, settings: ChannelQrStyleSettings): Options {
  const logo = settings.image.trim();
  return {
    type: 'svg',
    width: settings.width,
    height: settings.height,
    margin: settings.margin,
    data,
    shape: settings.shape,
    image: logo || undefined,
    qrOptions: {
      errorCorrectionLevel: settings.errorCorrectionLevel
    },
    imageOptions: {
      crossOrigin: 'anonymous',
      saveAsBlob: true,
      hideBackgroundDots: settings.hideBackgroundDots,
      imageSize: settings.imageSize,
      margin: settings.imageMargin
    },
    dotsOptions: {
      type: settings.dotsType,
      color: settings.dotsColor
    },
    cornersSquareOptions: {
      type: settings.cornersSquareType,
      color: settings.cornersSquareColor
    },
    cornersDotOptions: {
      type: settings.cornersDotType,
      color: settings.cornersDotColor
    },
    backgroundOptions: {
      color: settings.backgroundColor
    }
  };
}

export function buildChannelQrFileName(agentCode: string, channelCode: string) {
  return `${agentCode || 'agent'}-${channelCode || 'channel'}-qr`.replace(/[^a-zA-Z0-9-_]+/g, '-');
}
