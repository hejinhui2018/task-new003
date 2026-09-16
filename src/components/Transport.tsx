import type { Playback } from '../state/usePlayback';
import type { TimedSegment } from '../types';
import { formatClockFull, formatDuration } from '../lib/format';

interface TransportProps {
  playback: Playback;
  endSec: number;
  segments: TimedSegment[];
}

export function Transport({ playback, endSec, segments }: TransportProps) {
  const current =
    segments.find((s) => playback.playheadSec >= s.startSec && playback.playheadSec < s.endSec) ?? null;

  return (
    <section className="panel" aria-label="播放预演">
      <p className="panel-title">播放头预演（按真实时钟推进，可倍速快速走完整档）</p>
      <div className="transport">
        <button onClick={playback.toggle} aria-label={playback.playing ? '暂停' : '播放'}>
          {playback.playing ? '⏸ 暂停' : '▶ 播放'}
        </button>
        <button onClick={playback.stop} aria-label="停止并回到开头">
          ⏹
        </button>
        <button className="speed-btn" onClick={playback.cycleSpeed} aria-label="切换倍速">
          {playback.speed}×
        </button>
        <span className="clock-now">{formatClockFull(playback.playheadSec)}</span>
        <span className="now-name">{current ? `正在播出：${current.name}` : '—'}</span>
        <input
          className="seek"
          type="range"
          min={0}
          max={Math.max(endSec, 1)}
          step={1}
          value={Math.min(playback.playheadSec, endSec)}
          aria-label="播放头位置"
          onChange={(e) => playback.seek(Number(e.target.value))}
        />
        <span style={{ color: 'var(--muted)', fontSize: 12, fontVariantNumeric: 'tabular-nums' }}>
          {formatDuration(playback.playheadSec)} / {formatDuration(endSec)}
        </span>
      </div>
    </section>
  );
}
