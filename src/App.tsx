import { useEffect, useMemo } from 'react';
import { useRundown } from './state/useRundown';
import { usePlayback } from './state/usePlayback';
import { createSeedSegments } from './lib/seed';
import { StatsBar } from './components/StatsBar';
import { Timeline } from './components/Timeline';
import { ConflictPanel } from './components/ConflictPanel';
import { SegmentList } from './components/SegmentList';
import { Transport } from './components/Transport';

export default function App() {
  const { schedule, canUndo, canRedo, dispatch } = useRundown();
  const playback = usePlayback(schedule.spanSec);

  // 当前正在播出的环节
  const nowSegmentId = useMemo(() => {
    const hit = schedule.segments.find(
      (s) => playback.playheadSec >= s.startSec && playback.playheadSec < s.endSec,
    );
    return hit ? hit.id : null;
  }, [schedule.segments, playback.playheadSec]);

  // 撤销/重做快捷键：Ctrl/⌘+Z、Ctrl/⌘+Shift+Z 或 Ctrl+Y
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const mod = e.ctrlKey || e.metaKey;
      if (!mod) return;
      const target = e.target as HTMLElement | null;
      if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA')) return;
      if (e.key.toLowerCase() === 'z') {
        e.preventDefault();
        if (e.shiftKey) dispatch({ type: 'redo' });
        else dispatch({ type: 'undo' });
      } else if (e.key.toLowerCase() === 'y') {
        e.preventDefault();
        dispatch({ type: 'redo' });
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [dispatch]);

  return (
    <div className="app">
      <header className="topbar">
        <h1>
          <span className="live-dot" />
          直播导播流程单 · LIVE RUNDOWN
        </h1>
        <span className="saved-hint">自动保存于本机浏览器</span>
        <span className="spacer" />
        <button className="toolbtn" disabled={!canUndo} onClick={() => dispatch({ type: 'undo' })}>
          ↶ 撤销
        </button>
        <button className="toolbtn" disabled={!canRedo} onClick={() => dispatch({ type: 'redo' })}>
          ↷ 重做
        </button>
        <button
          onClick={() => {
            if (window.confirm('恢复为内置的 30 分钟直播样例？当前编排会被覆盖（仍可用撤销找回）。')) {
              dispatch({ type: 'reset', segments: createSeedSegments() });
            }
          }}
        >
          重置样例
        </button>
      </header>

      <StatsBar schedule={schedule} />

      <section className="panel" aria-label="时间轴">
        <p className="panel-title">时间轴（点击轨道可定位播放头）</p>
        <Timeline schedule={schedule} playheadSec={playback.playheadSec} onSeek={playback.seek} />
        <div className="legend">
          <span className="legend-item">
            <span className="legend-line" /> 固定开播点
          </span>
          <span className="legend-item">
            <span className="legend-line solid" /> 播放头
          </span>
          <span className="legend-item">
            <span
              className="legend-swatch"
              style={{ background: 'repeating-linear-gradient(45deg,#89878129,#89878129 4px,#8987810d 4px,#8987810d 8px)' }}
            />
            空闲等待
          </span>
          <span className="legend-item">
            <span
              className="legend-swatch"
              style={{ background: 'repeating-linear-gradient(-45deg,#d03b3b52,#d03b3b52 4px,#d03b3b24 4px,#d03b3b24 8px)' }}
            />
            低于下限（冲突）
          </span>
          <span className="legend-item">
            <span className="legend-swatch" style={{ background: '#6f7a88' }} /> 缓冲
          </span>
          <span className="legend-item">虚线左边框 = 已被压缩</span>
        </div>
      </section>

      <ConflictPanel schedule={schedule} />

      <Transport playback={playback} endSec={schedule.spanSec} segments={schedule.segments} />

      <SegmentList
        plan={schedule.segments}
        timed={schedule.segments}
        nowSegmentId={nowSegmentId}
        dispatch={dispatch}
      />

      <footer className="readme-hint">
        规则：普通调整整体顺延；固定点前先消耗缓冲，再压缩“可压缩”环节（均不低于下限，靠近固定点者优先）；仍放不下则明确报冲突——
        固定点不移动、环节不重叠。所有修改可撤销/重做（Ctrl/⌘+Z、Ctrl/⌘+Shift+Z）。
      </footer>
    </div>
  );
}
