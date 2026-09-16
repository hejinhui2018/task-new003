import type { Segment } from '../types';
import { createSeedSegments } from '../lib/seed';

const STORAGE_KEY = 'live-rundown:segments:v1';

export function loadSegments(): Segment[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return createSeedSegments();
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return createSeedSegments();
    // 轻量校验：丢弃无法识别的数据
    const valid = parsed.filter(
      (s): s is Segment =>
        !!s &&
        typeof s === 'object' &&
        typeof (s as Segment).id === 'string' &&
        typeof (s as Segment).name === 'string' &&
        typeof (s as Segment).plannedDurationSec === 'number',
    );
    return valid.length > 0 ? valid : createSeedSegments();
  } catch {
    return createSeedSegments();
  }
}

export function saveSegments(segments: Segment[]): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(segments));
  } catch {
    // 存储不可用时静默（隐私模式等），不影响使用
  }
}

export const STORAGE_KEYS = { segments: STORAGE_KEY };
