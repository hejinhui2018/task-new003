/** 环节类型：仅用于配色与图标，调度规则只看 compressible / pinnedStartSec / kind==='buffer' */
export type SegmentKind =
  | 'intro'
  | 'news'
  | 'interview'
  | 'buffer'
  | 'live-link'
  | 'commentary'
  | 'outro'
  | 'segment';

export type SegmentId = string;

/** 编排数据：一个流程环节（持久化到 localStorage 的最小结构） */
export interface Segment {
  id: SegmentId;
  name: string;
  kind: SegmentKind;
  /** 计划时长（秒） */
  plannedDurationSec: number;
  /** 是否允许在固定点前被压缩 */
  compressible: boolean;
  /** 压缩下限（秒） */
  minDurationSec: number;
  /** 固定开播点：相对节目开播的秒数；null 表示不固定 */
  pinnedStartSec: number | null;
}

export type SegmentStatus = 'ok' | 'extended' | 'compressed' | 'conflict';

/** 调度计算后的环节（含实际时间） */
export interface TimedSegment extends Segment {
  startSec: number;
  endSec: number;
  /** 实际时长（压缩后可能小于 plannedDurationSec） */
  durationSec: number;
  /** 相对计划的变化：>0 延长，<0 被压缩 */
  deltaSec: number;
  /** 被压缩掉的秒数 */
  compressedSec: number;
  status: SegmentStatus;
}

/** 一次固定点前的消化记录 */
export interface ConflictConsumption {
  id: SegmentId;
  name: string;
  kind: SegmentKind;
  via: 'buffer' | 'compress';
  providedSec: number;
}

/** 固定点冲突报告：固定点时间永不被改写，这里只如实报告放不下的量 */
export interface ScheduleConflict {
  anchorId: SegmentId;
  anchorName: string;
  /** 固定开播点（相对开播秒数） */
  pinSec: number;
  /** 固定点前按计划所需的总时长 */
  requiredSec: number;
  /** 固定点前可用的总时长 */
  availableSec: number;
  /** 原始超时量 */
  overflowSec: number;
  /** 已通过缓冲/压缩消化的量 */
  consumedSec: number;
  consumed: ConflictConsumption[];
  /** 消化后仍无法安放的量 */
  unresolvedSec: number;
  message: string;
}

export interface IdleGap {
  startSec: number;
  endSec: number;
}

/** 固定点前的调度消化记录（无论最终是否冲突都保留） */
export interface WindowAdjustment {
  anchorId: SegmentId;
  anchorName: string;
  pinSec: number;
  overflowSec: number;
  consumed: ConflictConsumption[];
  /** true = 已完全消化；false = 仍有冲突 */
  resolved: boolean;
}

export interface PinnedPoint {
  id: SegmentId;
  name: string;
  startSec: number;
  durationSec: number;
}

export interface ScheduleResult {
  segments: TimedSegment[];
  conflicts: ScheduleConflict[];
  /** 每个固定点前发生过的缓冲/压缩消化 */
  adjustments: WindowAdjustment[];
  /** 固定点前内容提前结束时留下的空闲段 */
  gaps: IdleGap[];
  pinnedPoints: PinnedPoint[];
  showStartSec: number;
  /** 最后一个环节的结束时间 */
  endSec: number;
  /** 整档跨度（含空闲） */
  spanSec: number;
  /** 环节实际时长合计（不含空闲） */
  contentSec: number;
  totalPlannedSec: number;
  bufferPlannedSec: number;
  bufferRemainingSec: number;
}
