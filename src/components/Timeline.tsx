import { useMemo, useRef } from 'react';
import type { ScheduleResult, TimedSegment } from '../types';
import { formatClock, formatDelta, formatDuration } from '../lib/format';
import { kindStyle, theme } from '../lib/theme';

interface TimelineProps {
  schedule: ScheduleResult;
  playheadSec: number;
  onSeek: (sec: number) => void;
}

const MAJOR_TICK = 300; // 5 分钟
const MINOR_TICK = 60; // 1 分钟

export function Timeline({ schedule, playheadSec, onSeek }: TimelineProps) {
  const scrollRef = useRef<HTMLDivElement>(null);

  const domainSec = useMemo(() => {
    const maxNeeded = Math.max(schedule.spanSec, schedule.totalPlannedSec, 1800);
    return Math.ceil(maxNeeded / MAJOR_TICK) * MAJOR_TICK;
  }, [schedule.spanSec, schedule.totalPlannedSec]);

  const pct = (sec: number) => `${(Math.max(0, sec) / domainSec) * 100}%`;

  const ticks = useMemo(() => {
    const list: { sec: number; major: boolean }[] = [];
    for (let t = 0; t <= domainSec; t += MINOR_TICK) {
      list.push({ sec: t, major: t % MAJOR_TICK === 0 });
    }
    return list;
  }, [domainSec]);

  const pinSecs = new Set(schedule.pinnedPoints.map((p) => p.startSec));

  const seekFromEvent = (e: React.MouseEvent) => {
    const el = scrollRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const ratio = Math.min(1, Math.max(0, (e.clientX - rect.left) / rect.width));
    onSeek(ratio * domainSec);
  };

  return (
    <div className="timeline-scroll" ref={scrollRef} style={{ overflowX: 'auto' }}>
      <div style={{ minWidth: 760, position: 'relative' }}>
        <div className="timeline-wrap">
          {/* 刻度 */}
          <div className="timeline-ruler">
            {ticks.map(({ sec, major }) => (
              <div key={sec}>
                <span className={`tick ${major ? 'major' : ''}`} style={{ left: pct(sec) }} />
                {major && !pinSecs.has(sec) && (
                  <span className="tick-label" style={{ left: pct(sec) }}>
                    {formatClock(sec)}
                  </span>
                )}
              </div>
            ))}
          </div>

          {/* 轨道 */}
          <div className="timeline-track" onClick={seekFromEvent} role="presentation">
            {schedule.gaps.map((gap, i) => (
              <div
                key={`gap-${i}`}
                className="tl-gap"
                style={{ left: pct(gap.startSec), width: pct(gap.endSec - gap.startSec) }}
                title={`空闲 ${formatDuration(gap.endSec - gap.startSec)}（固定点前等待）`}
              >
                空闲 {formatDuration(gap.endSec - gap.startSec)}
              </div>
            ))}

            {schedule.segments.map((seg) => (
              <TimelineBlock key={seg.id} seg={seg} pct={pct} />
            ))}
          </div>

          {/* 固定点标记线 + 旗帜 */}
          {schedule.pinnedPoints.map((pin) => (
            <div key={`pin-${pin.id}`} className="pin-line" style={{ left: pct(pin.startSec) }}>
              <span className="pin-flag">{formatClock(pin.startSec)} 固定开播</span>
            </div>
          ))}

          {/* 播放头 */}
          <div className="playhead" style={{ left: pct(playheadSec) }} data-testid="playhead" />
        </div>
      </div>
    </div>
  );
}

function TimelineBlock({
  seg,
  pct,
}: {
  seg: TimedSegment;
  pct: (sec: number) => string;
}) {
  const color = seg.status === 'conflict' ? theme.critical : kindStyle(seg.kind).color;
  const cls = [
    'tl-block',
    seg.status === 'conflict' ? 'is-conflict' : '',
    seg.status === 'compressed' ? 'compressed' : '',
    seg.durationSec >= 240 ? 'wide' : '',
  ]
    .filter(Boolean)
    .join(' ');

  const deltaColor =
    seg.deltaSec > 0 ? '#7bb8f5' : seg.deltaSec < 0 ? '#f3a382' : theme.inkSecondary;

  // 被压到 0 秒的环节（通常是缓冲耗尽）：渲染一条细标记，而不是负宽块
  if (seg.durationSec <= 0) {
    return (
      <div
        className={cls}
        style={{
          left: `calc(${pct(seg.startSec)} - 1px)`,
          width: 3,
          ['--block-color' as string]: color,
        } as React.CSSProperties}
        title={`${seg.name}（${formatDuration(seg.durationSec)}，计划 ${formatDuration(
          seg.plannedDurationSec,
        )} 已全部消化）`}
      />
    );
  }

  return (
    <div
      className={cls}
      style={
        {
          left: `calc(${pct(seg.startSec)} + 2px)`,
          width: `calc(${pct(seg.durationSec)} - 4px)`,
          ['--block-color' as string]: color,
        } as React.CSSProperties
      }
      title={`${seg.name}\n${formatClock(seg.startSec)}–${formatClock(seg.endSec)}（${formatDuration(
        seg.durationSec,
      )}）${seg.compressedSec > 0 ? `\n已压缩 ${formatDuration(seg.compressedSec)}` : ''}`}
    >
      <div className="tl-name">{seg.name}</div>
      <div className="tl-time">
        {formatClock(seg.startSec)}–{formatClock(seg.endSec)} · {formatDuration(seg.durationSec)}
      </div>
      {seg.deltaSec !== 0 && (
        <div className="tl-delta" style={{ color: deltaColor }}>
          {formatDelta(seg.deltaSec)}
        </div>
      )}
    </div>
  );
}
