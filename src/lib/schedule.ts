import type {
  ConflictConsumption,
  IdleGap,
  PinnedPoint,
  ScheduleConflict,
  ScheduleResult,
  Segment,
  TimedSegment,
  WindowAdjustment,
} from '../types';
import { formatClock, formatDuration } from './format';

/**
 * 调度引擎（纯函数）
 *
 * 规则：
 * 1. 普通环节整体顺延：上一个环节结束即下一个开始。
 * 2. 固定开播点是硬边界：固定环节必须在指定秒数准点开始，前后被切成独立窗口。
 * 3. 窗口内容超时（P > W）时按顺序消化：
 *    a. 先吃缓冲段（可降到 0，离固定点近的优先）；
 *    b. 再压缩可压缩环节（不低于 minDurationSec，离固定点近的优先）；
 *    c. 全部到下限仍放不下 → 报冲突：固定点绝不移动、环节绝不重叠，
 *       缺口以“被迫低于下限”的形式落到离固定点最近的环节上并标红。
 * 4. 窗口内容不足时，空闲如实保留为 gap（不偷偷前移固定点）。
 */

interface Window {
  /** 本窗口包含的环节下标（含起始固定环节） */
  indices: number[];
  /** 窗口起点（相对开播秒数） */
  start: number;
  /** 窗口硬终点（下一个固定点）；null 表示节目尾部，自由顺延 */
  end: number | null;
  /** 触发本窗口硬终点的固定环节下标（用于冲突文案） */
  boundaryAnchorIdx: number | null;
}

function buildWindows(segments: Segment[], showStartSec: number): Window[] {
  const anchorIdx: number[] = [];
  segments.forEach((s, i) => {
    if (s.pinnedStartSec !== null) anchorIdx.push(i);
  });

  const windows: Window[] = [];

  // 第一个固定点之前的内容
  const firstAnchor = anchorIdx[0];
  if (firstAnchor !== undefined) {
    if (firstAnchor > 0) {
      windows.push({
        indices: segments.slice(0, firstAnchor).map((_, i) => i),
        start: showStartSec,
        end: segments[firstAnchor].pinnedStartSec as number,
        boundaryAnchorIdx: firstAnchor,
      });
    }
    // 每个固定环节起始一个窗口，直到下一个固定点前
    anchorIdx.forEach((idx, k) => {
      const next = anchorIdx[k + 1];
      const endIdx = next ?? segments.length;
      windows.push({
        indices: segments.slice(idx, endIdx).map((_, j) => idx + j),
        start: segments[idx].pinnedStartSec as number,
        end: next !== undefined ? (segments[next].pinnedStartSec as number) : null,
        boundaryAnchorIdx: next ?? null,
      });
    });
  } else {
    windows.push({ indices: segments.map((_, i) => i), start: showStartSec, end: null, boundaryAnchorIdx: null });
  }

  return windows;
}

function floorOf(s: Segment): number {
  return s.kind === 'buffer' ? 0 : Math.max(0, s.minDurationSec);
}

export function computeSchedule(segments: Segment[], showStartSec = 0): ScheduleResult {
  const timed: (TimedSegment | null)[] = segments.map(() => null);
  const conflicts: ScheduleConflict[] = [];
  const adjustments: WindowAdjustment[] = [];
  const gaps: IdleGap[] = [];

  for (const win of buildWindows(segments, showStartSec)) {
    const segs = win.indices.map((i) => segments[i]);
    const plannedTotal = segs.reduce((sum, s) => sum + s.plannedDurationSec, 0);

    // 各环节在本窗口内的实际时长（先按计划）
    const durations = segs.map((s) => s.plannedDurationSec);
    const consumed: ConflictConsumption[] = [];
    /** 被迫压缩到下限以下的窗口内位置 → 多砍的秒数 */
    const forced = new Map<number, number>();

    let conflict: ScheduleConflict | null = null;

    if (win.end !== null) {
      const width = win.end - win.start;
      const overflow = plannedTotal - width;

      if (overflow > 0) {
        let need = overflow;

        // 压缩来源：先缓冲（近固定点优先），再可压缩环节（近固定点优先）
        const distDesc = [...segs.keys()].sort((a, b) => b - a);
        const buffers = distDesc.filter((p) => segs[p].kind === 'buffer');
        const compressible = distDesc.filter(
          (p) => segs[p].kind !== 'buffer' && segs[p].compressible,
        );

        const cut = (p: number, via: 'buffer' | 'compress') => {
          if (need <= 0) return;
          const floor = floorOf(segs[p]);
          const room = durations[p] - floor;
          if (room <= 0) return;
          const amount = Math.min(need, room);
          durations[p] -= amount;
          need -= amount;
          const prev = consumed.find((c) => c.id === segs[p].id);
          if (prev) prev.providedSec += amount;
          else
            consumed.push({
              id: segs[p].id,
              name: segs[p].name,
              kind: segs[p].kind,
              via,
              providedSec: amount,
            });
        };

        buffers.forEach((p) => cut(p, 'buffer'));
        compressible.forEach((p) => cut(p, 'compress'));

        if (consumed.length > 0 || overflow > 0) {
          const anchorEl = segments[win.boundaryAnchorIdx as number];
          adjustments.push({
            anchorId: anchorEl.id,
            anchorName: anchorEl.name,
            pinSec: win.end,
            overflowSec: overflow,
            consumed: [...consumed],
            resolved: need <= 0,
          });
        }

        if (need > 0) {
          // 所有下限都已用尽仍放不下：最近的环节被迫低于下限，固定点不动
          const shortfall = need;
          for (const p of distDesc) {
            if (need <= 0) break;
            const amount = Math.min(need, durations[p]);
            if (amount > 0) {
              durations[p] -= amount;
              need -= amount;
              forced.set(p, (forced.get(p) ?? 0) + amount);
            }
          }

          const anchor = segments[win.boundaryAnchorIdx as number];
          const consumedSec = overflow - shortfall;
          conflict = {
            anchorId: anchor.id,
            anchorName: anchor.name,
            pinSec: win.end,
            requiredSec: win.start + plannedTotal,
            availableSec: win.end,
            overflowSec: overflow,
            consumedSec,
            consumed,
            unresolvedSec: shortfall,
            message: buildConflictMessage(anchor.name, win.end, overflow, consumedSec, shortfall),
          };
        }
      }
    }

    // 落时间
    let cursor = win.start;
    segs.forEach((s, p) => {
      const idx = win.indices[p];
      const durationSec = Math.max(0, durations[p]);
      const compressedSec = Math.max(0, s.plannedDurationSec - durationSec);
      const isForced = forced.has(p);
      timed[idx] = {
        ...s,
        startSec: cursor,
        endSec: cursor + durationSec,
        durationSec,
        deltaSec: durationSec - s.plannedDurationSec,
        compressedSec,
        status: isForced ? 'conflict' : compressedSec > 0 ? 'compressed' : 'ok',
      };
      cursor += durationSec;
    });

    // 固定点前内容（含消化后的实际时长）提前结束 → 空闲如实保留；
    // 冲突窗口的缺口是“放不下”造成的，由冲突报告说明，不计为空闲。
    if (win.end !== null && conflict === null && cursor < win.end - 0.5) {
      gaps.push({ startSec: cursor, endSec: win.end });
    }

    if (conflict) conflicts.push(conflict);
  }

  const valid = timed.filter((t): t is TimedSegment => t !== null);
  const pinnedPoints: PinnedPoint[] = valid
    .filter((t) => t.pinnedStartSec !== null)
    .map((t) => ({ id: t.id, name: t.name, startSec: t.pinnedStartSec as number, durationSec: t.durationSec }));

  const endSec = valid.length ? valid[valid.length - 1].endSec : showStartSec;
  const contentSec = valid.reduce((sum, t) => sum + t.durationSec, 0);
  const totalPlannedSec = segments.reduce((sum, s) => sum + s.plannedDurationSec, 0);
  const bufferPlannedSec = segments
    .filter((s) => s.kind === 'buffer')
    .reduce((sum, s) => sum + s.plannedDurationSec, 0);
  const bufferRemainingSec = valid
    .filter((t) => t.kind === 'buffer')
    .reduce((sum, t) => sum + t.durationSec, 0);

  return {
    segments: valid,
    conflicts,
    adjustments,
    gaps,
    pinnedPoints,
    showStartSec,
    endSec,
    spanSec: endSec - showStartSec,
    contentSec,
    totalPlannedSec,
    bufferPlannedSec,
    bufferRemainingSec,
  };
}

function buildConflictMessage(
  anchorName: string,
  pinSec: number,
  overflowSec: number,
  consumedSec: number,
  unresolvedSec: number,
): string {
  const parts = [
    `固定点「${anchorName}」必须于 ${formatClock(pinSec)} 开播，前方内容超时 ${formatDuration(overflowSec)}`,
  ];
  if (consumedSec > 0) parts.push(`已通过缓冲/压缩消化 ${formatDuration(consumedSec)}`);
  parts.push(`仍有 ${formatDuration(unresolvedSec)} 无法安放`);
  parts.push('最近环节已被迫低于时长下限且标红——请删减内容或后移固定点；固定点未被移动、环节未重叠');
  return parts.join('，') + '。';
}

/** 找到某环节如果在当前顺序下“现在固定开播”，默认的固定时间（其计划开始时刻） */
export function plannedStartOf(segments: Segment[], id: string): number | null {
  const idx = segments.findIndex((s) => s.id === id);
  if (idx < 0) return null;
  let cursor = 0;
  for (let i = 0; i < idx; i++) cursor += segments[i].plannedDurationSec;
  return cursor;
}
