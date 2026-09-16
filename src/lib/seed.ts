import type { Segment } from '../types';

/**
 * 内置 30 分钟直播（10:00 开播）：
 * 10:00 开场 2:00
 * 10:02 新闻 5:00
 * 10:07 可压缩采访 6:00（下限 3:00）
 * 10:13 缓冲 2:00
 * 10:15 连线 6:00 ← 固定开播点
 * 10:21 评论 6:00
 * 10:27 片尾 3:00
 */
export const SHOW_START_SEC = 0;

export function createSeedSegments(): Segment[] {
  return [
    {
      id: 'seg-intro',
      name: '开场',
      kind: 'intro',
      plannedDurationSec: 120,
      compressible: false,
      minDurationSec: 120,
      pinnedStartSec: null,
    },
    {
      id: 'seg-news',
      name: '新闻速览',
      kind: 'news',
      plannedDurationSec: 300,
      compressible: false,
      minDurationSec: 300,
      pinnedStartSec: null,
    },
    {
      id: 'seg-interview',
      name: '嘉宾采访（可压缩）',
      kind: 'interview',
      plannedDurationSec: 360,
      compressible: true,
      minDurationSec: 180,
      pinnedStartSec: null,
    },
    {
      id: 'seg-buffer',
      name: '缓冲段',
      kind: 'buffer',
      plannedDurationSec: 120,
      compressible: true,
      minDurationSec: 0,
      pinnedStartSec: null,
    },
    {
      id: 'seg-live-link',
      name: '现场连线',
      kind: 'live-link',
      plannedDurationSec: 360,
      compressible: false,
      minDurationSec: 360,
      pinnedStartSec: 15 * 60, // 10:15
    },
    {
      id: 'seg-commentary',
      name: '评论员点评',
      kind: 'commentary',
      plannedDurationSec: 360,
      compressible: true,
      minDurationSec: 240,
      pinnedStartSec: null,
    },
    {
      id: 'seg-outro',
      name: '片尾',
      kind: 'outro',
      plannedDurationSec: 180,
      compressible: false,
      minDurationSec: 180,
      pinnedStartSec: null,
    },
  ];
}

let idCounter = 0;
export function newSegmentId(): string {
  idCounter += 1;
  return `seg-${Date.now().toString(36)}-${idCounter}`;
}
