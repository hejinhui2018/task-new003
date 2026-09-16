import type { ScheduleResult } from '../types';
import { formatClock, formatDuration } from '../lib/format';

export function ConflictPanel({ schedule }: { schedule: ScheduleResult }) {
  const resolved = schedule.adjustments.filter((a) => a.resolved);
  const conflicts = schedule.conflicts;

  if (resolved.length === 0 && conflicts.length === 0) {
    return (
      <section className="panel" aria-label="调度状态">
        <p className="panel-title">固定点调度</p>
        <div style={{ color: 'var(--ink-2)' }}>
          <span style={{ color: '#6fd06f', fontWeight: 650 }}>● 各固定点均可准点开播</span>
          ，暂无超时需要消化。延长前方环节时，系统会先消耗缓冲、再压缩可压缩环节。
        </div>
      </section>
    );
  }

  return (
    <section className="panel" aria-label="调度状态">
      <p className="panel-title">固定点调度</p>

      {resolved.map((a) => (
        <div className="conflict-card resolved" key={`adj-${a.anchorId}`} data-testid="adjustment">
          <div className="cc-title">
            <span>✓ 已消化，固定点「{a.anchorName}」{formatClock(a.pinSec)} 准点不受影响</span>
          </div>
          <div style={{ color: 'var(--ink-2)' }}>
            前方超时 {formatDuration(a.overflowSec)}，按“先缓冲、后压缩（靠近固定点优先）”消化：
          </div>
          <ul>
            {a.consumed.map((c) => (
              <li key={c.id}>
                <span className={`tag ${c.via === 'buffer' ? 'buffer' : 'compress'}`}>
                  {c.via === 'buffer' ? '缓冲' : '压缩'}
                </span>{' '}
                {c.name} 消化 {formatDuration(c.providedSec)}
                {c.via === 'compress' ? `（压至下限保护内）` : '（缓冲段缩短）'}
              </li>
            ))}
          </ul>
          {schedule.gaps.length > 0 && (
            <div style={{ color: 'var(--ink-2)', marginTop: 4 }}>
              消化后固定点前出现
              {schedule.gaps.map((g, i) => (
                <span key={i}> {formatDuration(g.endSec - g.startSec)} 空闲（{formatClock(g.startSec)}–
                {formatClock(g.endSec)}）</span>
              ))}
              ，后续环节整体顺延不越过固定点。
            </div>
          )}
        </div>
      ))}

      {conflicts.map((c) => (
        <div className="conflict-card critical" key={`conf-${c.anchorId}`} data-testid="conflict">
          <div className="cc-title">
            <span>⚠ 冲突：{c.message}</span>
          </div>
          <ul>
            <li>
              固定开播点 {formatClock(c.pinSec)}：前方内容按计划排到 {formatClock(c.requiredSec)}，
              可用窗口仅到 {formatClock(c.availableSec)}。
            </li>
            {c.consumed.length > 0 && (
              <>
                <li>已消化 {formatDuration(c.consumedSec)}：</li>
                {c.consumed.map((cc) => (
                  <li key={cc.id} style={{ paddingLeft: 12 }}>
                    <span className={`tag ${cc.via === 'buffer' ? 'buffer' : 'compress'}`}>
                      {cc.via === 'buffer' ? '缓冲' : '压缩'}
                    </span>{' '}
                    {cc.name} −{formatDuration(cc.providedSec)}
                  </li>
                ))}
              </>
            )}
            <li style={{ color: '#ff9b9b', fontWeight: 600 }}>
              仍有 {formatDuration(c.unresolvedSec)} 无法安放（红色斜纹环节已被迫低于时长下限）。
              处置建议：删减前方内容、提前结束采访，或后移「{c.anchorName}」固定点——系统不会让环节重叠，也不会悄悄移动固定点。
            </li>
          </ul>
        </div>
      ))}
    </section>
  );
}
