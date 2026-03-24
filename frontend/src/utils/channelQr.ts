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
const dotTypes: readonly DotType[] = ['rounded', 'dots', 'square', 'extra-rounded', 'classy', 'classy-rounded'];
const cornerSquareTypes: readonly CornerSquareType[] = ['square', 'rounded', 'extra-rounded', 'dots', 'classy', 'classy-rounded', 'dot'];
const cornerDotTypes: readonly CornerDotType[] = ['dot', 'square', 'rounded', 'dots', 'classy', 'classy-rounded', 'extra-rounded'];
const errorCorrectionLevels: readonly ErrorCorrectionLevel[] = ['L', 'M', 'Q', 'H'];
const shapeTypes: readonly ShapeType[] = ['square', 'circle'];

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

function clampNumber(value: unknown, fallback: number, min: number, max: number) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    return fallback;
  }
  return Math.min(max, Math.max(min, parsed));
}

function pickEnum<T extends string>(value: unknown, validValues: readonly T[], fallback: T): T {
  return typeof value === 'string' && validValues.includes(value as T) ? (value as T) : fallback;
}

function normalizeColor(value: unknown, fallback: string) {
  const normalized = typeof value === 'string' ? value.trim() : '';
  return /^#(?:[0-9a-fA-F]{3}){1,2}$/.test(normalized) ? normalized : fallback;
}

export function normalizeChannelQrStyle(value?: Partial<ChannelQrStyleSettings> | null): ChannelQrStyleSettings {
  return {
    width: clampNumber(value?.width, defaultChannelQrStyle.width, 180, 960),
    height: clampNumber(value?.height, defaultChannelQrStyle.height, 180, 960),
    margin: clampNumber(value?.margin, defaultChannelQrStyle.margin, 0, 40),
    shape: pickEnum(value?.shape, shapeTypes, defaultChannelQrStyle.shape),
    errorCorrectionLevel: pickEnum(value?.errorCorrectionLevel, errorCorrectionLevels, defaultChannelQrStyle.errorCorrectionLevel),
    dotsType: pickEnum(value?.dotsType, dotTypes, defaultChannelQrStyle.dotsType),
    dotsColor: normalizeColor(value?.dotsColor, defaultChannelQrStyle.dotsColor),
    cornersSquareType: pickEnum(value?.cornersSquareType, cornerSquareTypes, defaultChannelQrStyle.cornersSquareType),
    cornersSquareColor: normalizeColor(value?.cornersSquareColor, defaultChannelQrStyle.cornersSquareColor),
    cornersDotType: pickEnum(value?.cornersDotType, cornerDotTypes, defaultChannelQrStyle.cornersDotType),
    cornersDotColor: normalizeColor(value?.cornersDotColor, defaultChannelQrStyle.cornersDotColor),
    backgroundColor: normalizeColor(value?.backgroundColor, defaultChannelQrStyle.backgroundColor),
    image: typeof value?.image === 'string' ? value.image.trim() : '',
    imageSize: clampNumber(value?.imageSize, defaultChannelQrStyle.imageSize, 0.1, 0.5),
    imageMargin: clampNumber(value?.imageMargin, defaultChannelQrStyle.imageMargin, 0, 20),
    hideBackgroundDots: typeof value?.hideBackgroundDots === 'boolean' ? value.hideBackgroundDots : defaultChannelQrStyle.hideBackgroundDots
  };
}

export function loadChannelQrPresets(scope: string): ChannelQrStylePreset[] {
  if (typeof window === 'undefined') {
    return [];
  }
  const rows = safeParse<ChannelQrStylePreset[]>(window.localStorage.getItem(storageKey(scope, 'presets'))) || [];
  return rows.map((item) => ({
    ...item,
    settings: normalizeChannelQrStyle(item.settings)
  }));
}

export function saveChannelQrPresets(scope: string, presets: ChannelQrStylePreset[]) {
  if (typeof window === 'undefined') {
    return;
  }
  window.localStorage.setItem(
    storageKey(scope, 'presets'),
    JSON.stringify(
      presets.map((item) => ({
        ...item,
        settings: normalizeChannelQrStyle(item.settings)
      }))
    )
  );
}

export function loadLastChannelQrStyle(scope: string): ChannelQrStyleSettings {
  if (typeof window === 'undefined') {
    return defaultChannelQrStyle;
  }
  return normalizeChannelQrStyle(safeParse<Partial<ChannelQrStyleSettings>>(window.localStorage.getItem(storageKey(scope, 'last-style'))));
}

export function saveLastChannelQrStyle(scope: string, settings: ChannelQrStyleSettings) {
  if (typeof window === 'undefined') {
    return;
  }
  window.localStorage.setItem(storageKey(scope, 'last-style'), JSON.stringify(normalizeChannelQrStyle(settings)));
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
