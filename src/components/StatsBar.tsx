import type { ScheduleResult } from '../types';
import { formatClock, formatDuration } from '../lib/format';

interface StatsBarProps {
  schedule: ScheduleResult;
}

export function StatsBar({ schedule }: StatsBarProps) {
  const hasConflict = schedule.conflicts.length > 0;
  const outro = schedule.segments[schedule.segments.length - 1];
  const spanDelta = schedule.spanSec - schedule.totalPlannedSec;
  const bufferPct =
    schedule.bufferPlannedSec > 0
      ? Math.round((schedule.bufferRemainingSec / schedule.bufferPlannedSec) * 100)
      : null;

  return (
    <div className="stats">
      <div className="stat">
        <div className="label">计划总时长</div>
        <div className="value">{formatDuration(schedule.totalPlannedSec)}</div>
        <div className="sub">开播 {formatClock(schedule.showStartSec)}</div>
      </div>

      <div className={`stat ${hasConflict ? 'danger' : spanDelta !== 0 ? 'warn' : 'ok'}`}>
        <div className="label">实际总跨度</div>
        <div className="value">{formatDuration(schedule.spanSec)}</div>
        <div className="sub">
          {spanDelta === 0
            ? '与计划一致'
            : `较计划 ${spanDelta > 0 ? '+' : '−'}${formatDuration(Math.abs(spanDelta))}`}
        </div>
      </div>

      <div className={`stat ${hasConflict ? 'danger' : 'ok'}`}>
        <div className="label">预计结束 / 片尾</div>
        <div className="value">{formatClock(schedule.endSec)}</div>
        <div className="sub">
          {outro
            ? `片尾 ${formatClock(outro.startSec)}–${formatClock(outro.endSec)}${
                hasConflict ? '（受冲突影响）' : ''
              }`
            : '—'}
        </div>
      </div>

      <div
        className={`stat ${
          schedule.bufferPlannedSec === 0
            ? ''
            : schedule.bufferRemainingSec === 0
              ? 'danger'
              : schedule.bufferRemainingSec < schedule.bufferPlannedSec
                ? 'warn'
                : 'ok'
        }`}
      >
        <div className="label">缓冲余量</div>
        <div className="value">
          {formatDuration(schedule.bufferRemainingSec)}
          <span style={{ fontSize: 13, color: 'var(--muted)', fontWeight: 400 }}>
            {' '}
            / {formatDuration(schedule.bufferPlannedSec)}
          </span>
        </div>
        <div className="sub">{bufferPct === null ? '本档无缓冲段' : `剩余 ${bufferPct}%`}</div>
      </div>

      <div className={hasConflict ? 'stat danger' : 'stat'}>
        <div className="label">固定点 / 冲突</div>
        <div className="value">
          {schedule.pinnedPoints.length}
          <span style={{ fontSize: 13, color: 'var(--muted)', fontWeight: 400 }}> 个固定点 </span>
          {hasConflict ? `· ${schedule.conflicts.length} 冲突` : '· 无冲突'}
        </div>
        <div className="sub">{hasConflict ? '需要导播立即处置' : '全部固定点可准点'}</div>
      </div>
    </div>
  );
}
