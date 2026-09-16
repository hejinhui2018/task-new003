import { describe, expect, it } from 'vitest';
import { createHistory, rundownReducer } from '../state/reducer';
import { computeSchedule } from '../lib/schedule';
import { createSeedSegments } from '../lib/seed';

function durationOf(schedule: ReturnType<typeof computeSchedule>, id: string) {
  const s = schedule.segments.find((x) => x.id === id);
  if (!s) throw new Error(`missing ${id}`);
  return { start: s.startSec, end: s.endSec, dur: s.durationSec, status: s.status };
}

describe('撤销 / 重做', () => {
  it('延长采访后撤销：缓冲、压缩、冲突、片尾时间全部恢复', () => {
    let h = createHistory(createSeedSegments());

    const before = computeSchedule(h.present);
    expect(before.conflicts).toHaveLength(0);
    expect(durationOf(before, 'seg-buffer').dur).toBe(120);
    expect(before.endSec).toBe(1800);

    // 采访 +4 分钟：缓冲被吃光、采访被压 2 分钟，无冲突
    h = rundownReducer(h, { type: 'set-duration', id: 'seg-interview', sec: 600 });
    const extended = computeSchedule(h.present);
    expect(durationOf(extended, 'seg-buffer').dur).toBe(0);
    expect(durationOf(extended, 'seg-interview').dur).toBe(480);
    expect(extended.adjustments[0].resolved).toBe(true);
    expect(extended.conflicts).toHaveLength(0);
    expect(extended.endSec).toBe(1800);

    // 再延长到 13 分钟：仍由缓冲+采访自身消化，实际采访仍为 8:00（下限 3:00 之上）
    h = rundownReducer(h, { type: 'set-duration', id: 'seg-interview', sec: 780 });
    const harder = computeSchedule(h.present);
    expect(durationOf(harder, 'seg-buffer').dur).toBe(0);
    expect(durationOf(harder, 'seg-interview').dur).toBe(480);
    expect(harder.conflicts).toHaveLength(0);

    // 撤销到“采访 10 分钟”状态
    h = rundownReducer(h, { type: 'undo' });
    const undone = computeSchedule(h.present);
    expect(h.present.find((s) => s.id === 'seg-interview')!.plannedDurationSec).toBe(600);
    expect(durationOf(undone, 'seg-buffer').dur).toBe(0);
    expect(durationOf(undone, 'seg-interview').dur).toBe(480);
    expect(undone.conflicts).toHaveLength(0);

    // 再撤销：完全回到初始，缓冲恢复、片尾 10:30、冲突与消化记录清空
    h = rundownReducer(h, { type: 'undo' });
    const restored = computeSchedule(h.present);
    expect(h.present.find((s) => s.id === 'seg-interview')!.plannedDurationSec).toBe(360);
    expect(durationOf(restored, 'seg-buffer').dur).toBe(120);
    expect(durationOf(restored, 'seg-interview').dur).toBe(360);
    expect(durationOf(restored, 'seg-outro').start).toBe(1620);
    expect(restored.endSec).toBe(1800);
    expect(restored.conflicts).toHaveLength(0);
    expect(restored.adjustments).toHaveLength(0);
  });

  it('冲突状态随撤销/重做一起恢复', () => {
    let h = createHistory(createSeedSegments());

    // 新闻 +7 分钟 → 冲突（欠 2 分钟）
    h = rundownReducer(h, { type: 'set-duration', id: 'seg-news', sec: 720 });
    expect(computeSchedule(h.present).conflicts).toHaveLength(1);

    // 撤销 → 无冲突
    h = rundownReducer(h, { type: 'undo' });
    expect(computeSchedule(h.present).conflicts).toHaveLength(0);

    // 重做 → 冲突与未解决量原样回来
    h = rundownReducer(h, { type: 'redo' });
    const s = computeSchedule(h.present);
    expect(s.conflicts).toHaveLength(1);
    expect(s.conflicts[0].unresolvedSec).toBe(120);
    expect(s.segments.find((x) => x.id === 'seg-news')!.plannedDurationSec).toBe(720);
  });

  it('不能撤销/重做时返回原状态；新编辑清空重做栈', () => {
    let h = createHistory(createSeedSegments());
    expect(rundownReducer(h, { type: 'undo' })).toBe(h);
    expect(rundownReducer(h, { type: 'redo' })).toBe(h);

    h = rundownReducer(h, { type: 'set-duration', id: 'seg-news', sec: 360 });
    h = rundownReducer(h, { type: 'undo' });
    h = rundownReducer(h, { type: 'set-duration', id: 'seg-news', sec: 420 }); // 新编辑
    expect(rundownReducer(h, { type: 'redo' })).toBe(h); // future 已清空
    const sched = computeSchedule(h.present);
    expect(sched.segments.find((x) => x.id === 'seg-news')!.plannedDurationSec).toBe(420);
  });

  it('拖动排序进入历史：重排后撤销恢复原顺序', () => {
    let h = createHistory(createSeedSegments());
    const firstId = h.present[0].id;
    const secondId = h.present[1].id;
    h = rundownReducer(h, { type: 'reorder', activeId: secondId, overId: firstId });
    expect(h.present[0].id).toBe(secondId);
    h = rundownReducer(h, { type: 'undo' });
    expect(h.present[0].id).toBe(firstId);
  });

  it('固定/取消固定、设固定时间均可撤销', () => {
    let h = createHistory(createSeedSegments());
    h = rundownReducer(h, { type: 'toggle-pin', id: 'seg-commentary' });
    expect(h.present.find((s) => s.id === 'seg-commentary')!.pinnedStartSec).toBe(1260);
    h = rundownReducer(h, { type: 'set-pin-time', id: 'seg-commentary', sec: 1300 });
    expect(h.present.find((s) => s.id === 'seg-commentary')!.pinnedStartSec).toBe(1300);
    h = rundownReducer(h, { type: 'undo' });
    expect(h.present.find((s) => s.id === 'seg-commentary')!.pinnedStartSec).toBe(1260);
    h = rundownReducer(h, { type: 'undo' });
    expect(h.present.find((s) => s.id === 'seg-commentary')!.pinnedStartSec).toBeNull();
  });

  it('时长与下限的钳制：计划时长不低于下限，下限不高于计划时长', () => {
    let h = createHistory(createSeedSegments());
    h = rundownReducer(h, { type: 'set-duration', id: 'seg-interview', sec: 60 });
    // 采访下限 180，计划时长被钳到 180
    expect(h.present.find((s) => s.id === 'seg-interview')!.plannedDurationSec).toBe(180);

    h = rundownReducer(h, { type: 'set-min-duration', id: 'seg-interview', sec: 9999 });
    expect(h.present.find((s) => s.id === 'seg-interview')!.minDurationSec).toBe(180);
  });
});
