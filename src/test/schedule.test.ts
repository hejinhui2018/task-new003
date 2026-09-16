import { describe, expect, it } from 'vitest';
import { computeSchedule } from '../lib/schedule';
import { createSeedSegments } from '../lib/seed';
import type { Segment } from '../types';

let uid = 0;
function seg(partial: Partial<Segment> & Pick<Segment, 'name' | 'plannedDurationSec'>): Segment {
  uid += 1;
  return {
    id: `t${uid}`,
    kind: 'segment',
    compressible: false,
    minDurationSec: partial.plannedDurationSec,
    pinnedStartSec: null,
    ...partial,
  };
}

/** 不变量：任何调度结果都不允许环节重叠、固定点必须准点 */
function assertNoOverlapAndPinsHonored(result: ReturnType<typeof computeSchedule>) {
  const { segments } = result;
  for (let i = 1; i < segments.length; i++) {
    expect(segments[i].startSec, `环节 ${segments[i].name} 与前序重叠`).toBeGreaterThanOrEqual(
      segments[i - 1].endSec,
    );
  }
  for (const s of segments) {
    if (s.pinnedStartSec !== null) {
      expect(s.startSec, `固定点 ${s.name} 被移动`).toBe(s.pinnedStartSec);
    }
    expect(s.durationSec).toBe(s.endSec - s.startSec);
  }
}

describe('computeSchedule — 时间传播（整体顺延）', () => {
  it('内置 30 分钟节目：连线准点 10:15，片尾 10:30 结束，无冲突无空闲', () => {
    const r = computeSchedule(createSeedSegments());
    assertNoOverlapAndPinsHonored(r);
    const byId = Object.fromEntries(r.segments.map((s) => [s.id, s]));
    expect(byId['seg-intro'].startSec).toBe(0);
    expect(byId['seg-news'].startSec).toBe(120);
    expect(byId['seg-interview'].startSec).toBe(420);
    expect(byId['seg-buffer'].startSec).toBe(780);
    expect(byId['seg-live-link'].startSec).toBe(900);
    expect(byId['seg-commentary'].startSec).toBe(1260);
    expect(byId['seg-outro'].startSec).toBe(1620);
    expect(r.endSec).toBe(1800);
    expect(r.conflicts).toHaveLength(0);
    expect(r.gaps).toHaveLength(0);
    expect(r.adjustments).toHaveLength(0);
  });

  it('无固定点时延长中间环节，后续环节整体顺延、总时长增长', () => {
    const segs = [
      seg({ name: 'A', plannedDurationSec: 100 }),
      seg({ name: 'B', plannedDurationSec: 200 }),
      seg({ name: 'C', plannedDurationSec: 300 }),
    ];
    segs[1] = { ...segs[1], plannedDurationSec: 350 };
    const r = computeSchedule(segs);
    assertNoOverlapAndPinsHonored(r);
    expect(r.segments.map((s) => [s.startSec, s.endSec])).toEqual([
      [0, 100],
      [100, 450],
      [450, 750],
    ]);
    expect(r.endSec).toBe(750);
  });

  it('固定点之后的延长只向后顺延，固定点与前方环节不受影响', () => {
    const seed = createSeedSegments();
    const list = seed.map((s) =>
      s.id === 'seg-commentary' ? { ...s, plannedDurationSec: 480 } : s,
    );
    const r = computeSchedule(list);
    assertNoOverlapAndPinsHonored(r);
    const byId = Object.fromEntries(r.segments.map((s) => [s.id, s]));
    expect(byId['seg-live-link'].startSec).toBe(900);
    expect(byId['seg-commentary'].startSec).toBe(1260);
    expect(byId['seg-commentary'].endSec).toBe(1740);
    expect(byId['seg-outro'].startSec).toBe(1740);
    expect(r.endSec).toBe(1920);
    expect(r.conflicts).toHaveLength(0);
  });

  it('前方内容缩短不会让固定点提前，中间如实保留空闲', () => {
    const seed = createSeedSegments();
    const list = seed.map((s) =>
      s.id === 'seg-interview' ? { ...s, plannedDurationSec: 240 } : s,
    );
    const r = computeSchedule(list);
    assertNoOverlapAndPinsHonored(r);
    expect(r.gaps).toHaveLength(1);
    expect(r.gaps[0]).toEqual({ startSec: 780, endSec: 900 });
    expect(r.segments.find((s) => s.id === 'seg-live-link')!.startSec).toBe(900);
  });
});

describe('computeSchedule — 缓冲与压缩分配', () => {
  it('采访延长 4 分钟：先吃光 2:00 缓冲，再压缩采访 2:00，连线准点、片尾不受影响', () => {
    const seed = createSeedSegments();
    const list = seed.map((s) =>
      s.id === 'seg-interview' ? { ...s, plannedDurationSec: 600 } : s,
    );
    const r = computeSchedule(list);
    assertNoOverlapAndPinsHonored(r);

    expect(r.conflicts).toHaveLength(0);
    expect(r.adjustments).toHaveLength(1);
    const adj = r.adjustments[0];
    expect(adj.resolved).toBe(true);
    expect(adj.overflowSec).toBe(240);
    expect(adj.consumed).toEqual([
      expect.objectContaining({ id: 'seg-buffer', via: 'buffer', providedSec: 120 }),
      expect.objectContaining({ id: 'seg-interview', via: 'compress', providedSec: 120 }),
    ]);

    const byId = Object.fromEntries(r.segments.map((s) => [s.id, s]));
    expect(byId['seg-buffer'].durationSec).toBe(0);
    expect(byId['seg-buffer'].status).toBe('compressed');
    expect(byId['seg-interview'].durationSec).toBe(480);
    expect(byId['seg-interview'].compressedSec).toBe(120);
    expect(byId['seg-live-link'].startSec).toBe(900);
    expect(byId['seg-outro'].startSec).toBe(1620);
    expect(r.endSec).toBe(1800);
    expect(r.bufferRemainingSec).toBe(0);
  });

  it('缓冲先于可压缩环节被消耗', () => {
    // 计划 180+300+120=600 与窗口等宽；新闻延长 90 后应只动缓冲、不压采访
    const base = [
      seg({ name: '新闻', plannedDurationSec: 180 }),
      seg({ name: '采访', plannedDurationSec: 300, compressible: true, minDurationSec: 100 }),
      seg({ name: '缓冲', kind: 'buffer', plannedDurationSec: 120, compressible: true, minDurationSec: 0 }),
      seg({ name: '连线', plannedDurationSec: 300, pinnedStartSec: 600 }),
    ];
    base[0] = { ...base[0], plannedDurationSec: 270 };
    const r = computeSchedule(base);
    assertNoOverlapAndPinsHonored(r);
    expect(r.conflicts).toHaveLength(0);
    expect(r.bufferRemainingSec).toBe(30);
    expect(r.segments[1].durationSec).toBe(300); // 采访未被压缩
  });

  it('多个缓冲段 / 多个可压缩环节：靠近固定点者先承担', () => {
    const segs = [
      seg({ name: '新闻', plannedDurationSec: 300 }),
      seg({ name: '缓冲A', kind: 'buffer', plannedDurationSec: 120, compressible: true, minDurationSec: 0 }),
      seg({ name: '采访', plannedDurationSec: 360, compressible: true, minDurationSec: 180 }),
      seg({ name: '缓冲B', kind: 'buffer', plannedDurationSec: 120, compressible: true, minDurationSec: 0 }),
      seg({ name: '连线', plannedDurationSec: 300, pinnedStartSec: 900 }),
    ];
    // 计划正好 900；新闻延长 120 -> 超时 120，应只吃掉最近的缓冲B
    segs[0] = { ...segs[0], plannedDurationSec: 420 };
    const r = computeSchedule(segs);
    assertNoOverlapAndPinsHonored(r);
    const byName = Object.fromEntries(r.segments.map((s) => [s.name, s]));
    expect(byName['缓冲B'].durationSec).toBe(0);
    expect(byName['缓冲A'].durationSec).toBe(120);
    expect(byName['采访'].durationSec).toBe(360);
  });

  it('两个可压缩环节超量需要同时动用时，靠近固定点者先压到下限', () => {
    const segs = [
      seg({ name: '新闻', plannedDurationSec: 200 }),
      seg({ name: '采访A', plannedDurationSec: 300, compressible: true, minDurationSec: 100 }),
      seg({ name: '采访B', plannedDurationSec: 300, compressible: true, minDurationSec: 100 }),
      seg({ name: '连线', plannedDurationSec: 300, pinnedStartSec: 700 }),
    ];
    // 计划 800，窗口 700，超时 100，无缓冲 -> 采访B 先让 100
    const r = computeSchedule(segs);
    assertNoOverlapAndPinsHonored(r);
    expect(r.segments[2].durationSec).toBe(200);
    expect(r.segments[1].durationSec).toBe(300);
    expect(r.conflicts).toHaveLength(0);
  });

  it('压缩不会低于时长下限', () => {
    const segs = [
      seg({ name: '新闻', plannedDurationSec: 300 }),
      seg({ name: '采访', plannedDurationSec: 360, compressible: true, minDurationSec: 180 }),
      seg({ name: '连线', plannedDurationSec: 300, pinnedStartSec: 660 }),
    ];
    // 计划 660 恰好等宽；新闻 +120 -> 超时 120，采访最多让 180，足以消化
    segs[0] = { ...segs[0], plannedDurationSec: 420 };
    const r = computeSchedule(segs);
    expect(r.conflicts).toHaveLength(0);
    expect(r.segments[1].durationSec).toBe(240);
    expect(r.segments[1].durationSec).toBeGreaterThanOrEqual(180);
  });
});

describe('computeSchedule — 固定点冲突', () => {
  it('缓冲与所有下限耗尽后仍放不下：报冲突、给出未解决量、固定点不移动、环节不重叠', () => {
    const seed = createSeedSegments();
    // 新闻（不可压缩）延长 7 分钟（+420）：缓冲 120 + 采访下限空间 180 = 300，仍欠 120
    const list = seed.map((s) =>
      s.id === 'seg-news' ? { ...s, plannedDurationSec: 720 } : s,
    );
    const r = computeSchedule(list);
    assertNoOverlapAndPinsHonored(r);
    expect(r.conflicts).toHaveLength(1);
    const c = r.conflicts[0];
    expect(c.anchorId).toBe('seg-live-link');
    expect(c.pinSec).toBe(900);
    expect(c.overflowSec).toBe(420);
    expect(c.consumedSec).toBe(300);
    expect(c.unresolvedSec).toBe(120);
    expect(c.message).toContain('固定点');
    expect(c.consumed).toEqual([
      expect.objectContaining({ id: 'seg-buffer', via: 'buffer', providedSec: 120 }),
      expect.objectContaining({ id: 'seg-interview', via: 'compress', providedSec: 180 }),
    ]);
    // 固定环节本身纹丝不动
    const link = r.segments.find((s) => s.id === 'seg-live-link')!;
    expect(link.startSec).toBe(900);
    // 被迫低于下限的环节（采访 180 下限被继续压到 60）标红
    const interview = r.segments.find((s) => s.id === 'seg-interview')!;
    expect(interview.durationSec).toBe(60);
    expect(interview.status).toBe('conflict');
  });

  it('采访不可压缩时延长 4 分钟：缓冲只够 2 分钟，明确报出 2 分钟冲突', () => {
    const seed = createSeedSegments();
    const list = seed.map((s) =>
      s.id === 'seg-interview' ? { ...s, plannedDurationSec: 600, compressible: false, minDurationSec: 600 } : s,
    );
    const r = computeSchedule(list);
    assertNoOverlapAndPinsHonored(r);
    expect(r.conflicts).toHaveLength(1);
    expect(r.conflicts[0].unresolvedSec).toBe(120);
    expect(r.bufferRemainingSec).toBe(0);
  });

  it('极端超时下固定点依然准点（绝不悄悄越过）', () => {
    const seed = createSeedSegments();
    // 新闻延长 35 分钟：无论怎么砍，连线都必须 10:15 开始
    const list = seed.map((s) =>
      s.id === 'seg-news' ? { ...s, plannedDurationSec: 2400 } : s,
    );
    const r = computeSchedule(list);
    assertNoOverlapAndPinsHonored(r);
    expect(r.conflicts.length).toBeGreaterThanOrEqual(1);
    expect(r.segments.find((s) => s.id === 'seg-live-link')!.startSec).toBe(900);
  });

  it('两个固定点各自独立结算', () => {
    const segs = [
      seg({ name: '开场', plannedDurationSec: 120 }),
      seg({ name: '连线A', plannedDurationSec: 300, pinnedStartSec: 300 }),
      seg({ name: '采访', plannedDurationSec: 600, compressible: true, minDurationSec: 300 }),
      seg({ name: '连线B', plannedDurationSec: 300, pinnedStartSec: 1200 }),
      seg({ name: '片尾', plannedDurationSec: 120 }),
    ];
    const r = computeSchedule(segs);
    assertNoOverlapAndPinsHonored(r);
    const byName = Object.fromEntries(r.segments.map((s) => [s.name, s]));
    expect(byName['连线A'].startSec).toBe(300);
    expect(byName['连线B'].startSec).toBe(1200);
    expect(r.conflicts).toHaveLength(0);

    // 连线A 延长 300（窗口 [300,1200) 内超时 300）-> 采访压到下限 300，刚好消化
    segs[1] = { ...segs[1], plannedDurationSec: 600, pinnedStartSec: 300 };
    const r2 = computeSchedule(segs);
    assertNoOverlapAndPinsHonored(r2);
    expect(r2.conflicts).toHaveLength(0);
    const byName2 = Object.fromEntries(r2.segments.map((s) => [s.name, s]));
    expect(byName2['采访'].durationSec).toBe(300);
    expect(byName2['连线B'].startSec).toBe(1200);
  });
});
