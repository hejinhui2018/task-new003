import type { SegmentKind } from '../types';

/**
 * 深色导播台主题。
 * 分类色取自 dataviz 校验通过的槽位（深色表面 #1a1a19），
 * 类型→槽位映射经过“时间轴实际相邻顺序”验证：蓝/橙/青/黄/紫/品红。
 * 缓冲段不是分类序列，使用中性灰 + 斜纹表示。
 */
export const theme = {
  page: '#0d0d0d',
  surface: '#1a1a19',
  surfaceAlt: '#20201f',
  ink: '#ffffff',
  inkSecondary: '#c3c2b7',
  muted: '#898781',
  grid: '#2c2c2a',
  baseline: '#383835',
  border: 'rgba(255,255,255,0.10)',
  good: '#0ca30c',
  warning: '#fab219',
  serious: '#ec835a',
  critical: '#d03b3b',
  blue: '#3987e5',
  orange: '#d95926',
  aqua: '#199e70',
  yellow: '#c98500',
  magenta: '#d55181',
  violet: '#9085e9',
  buffer: '#6f7a88',
};

interface KindStyle {
  color: string;
  label: string;
  short: string;
}

export const KIND_STYLES: Record<SegmentKind, KindStyle> = {
  intro: { color: theme.blue, label: '开场', short: '开场' },
  news: { color: theme.orange, label: '新闻', short: '新闻' },
  interview: { color: theme.aqua, label: '采访', short: '采访' },
  buffer: { color: theme.buffer, label: '缓冲', short: '缓冲' },
  'live-link': { color: theme.yellow, label: '连线', short: '连线' },
  commentary: { color: theme.violet, label: '评论', short: '评论' },
  outro: { color: theme.magenta, label: '片尾', short: '片尾' },
  segment: { color: theme.blue, label: '环节', short: '环节' },
};

export function kindStyle(kind: SegmentKind): KindStyle {
  return KIND_STYLES[kind] ?? KIND_STYLES.segment;
}
