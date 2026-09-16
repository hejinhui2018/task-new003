import type { Segment, SegmentKind } from '../types';
import { newSegmentId } from '../lib/seed';
import { plannedStartOf } from '../lib/schedule';

/** 历史状态：past / present / future 三段式，每段都是一次环节快照 */
export interface HistoryState {
  past: Segment[][];
  present: Segment[];
  future: Segment[][];
}

const HISTORY_LIMIT = 100;

export type RundownAction =
  | { type: 'set-duration'; id: string; sec: number }
  | { type: 'rename'; id: string; name: string }
  | { type: 'toggle-pin'; id: string }
  | { type: 'set-pin-time'; id: string; sec: number }
  | { type: 'toggle-compressible'; id: string }
  | { type: 'set-min-duration'; id: string; sec: number }
  | { type: 'reorder'; activeId: string; overId: string }
  | { type: 'add-segment'; name?: string; kind?: SegmentKind }
  | { type: 'remove-segment'; id: string }
  | { type: 'reset'; segments: Segment[] }
  | { type: 'undo' }
  | { type: 'redo' };

function mapSegment(segments: Segment[], id: string, fn: (s: Segment) => Segment): Segment[] {
  return segments.map((s) => (s.id === id ? fn(s) : s));
}

/** 压入历史：变更前的 present 进 past，清空 future */
function commit(history: HistoryState, next: Segment[]): HistoryState {
  return {
    past: [...history.past, history.present].slice(-HISTORY_LIMIT),
    present: next,
    future: [],
  };
}

export function rundownReducer(history: HistoryState, action: RundownAction): HistoryState {
  const segments = history.present;

  switch (action.type) {
    case 'undo': {
      if (history.past.length === 0) return history;
      const previous = history.past[history.past.length - 1];
      return {
        past: history.past.slice(0, -1),
        present: previous,
        future: [history.present, ...history.future],
      };
    }
    case 'redo': {
      if (history.future.length === 0) return history;
      const [next, ...rest] = history.future;
      return {
        past: [...history.past, history.present].slice(-HISTORY_LIMIT),
        present: next,
        future: rest,
      };
    }
    case 'reset':
      return commit(history, action.segments);

    case 'set-duration': {
      const sec = Math.max(0, Math.round(action.sec));
      return commit(
        history,
        mapSegment(segments, action.id, (s) => ({
          ...s,
          plannedDurationSec: Math.max(sec, s.kind === 'buffer' ? 0 : s.minDurationSec),
        })),
      );
    }
    case 'rename':
      return commit(history, mapSegment(segments, action.id, (s) => ({ ...s, name: action.name })));

    case 'toggle-pin': {
      const target = segments.find((s) => s.id === action.id);
      if (!target) return history;
      if (target.pinnedStartSec !== null) {
        return commit(history, mapSegment(segments, action.id, (s) => ({ ...s, pinnedStartSec: null })));
      }
      // 固定时默认钉在“按计划它应该开始的时刻”
      const pinSec = plannedStartOf(segments, action.id) ?? 0;
      return commit(history, mapSegment(segments, action.id, (s) => ({ ...s, pinnedStartSec: Math.max(0, pinSec) })));
    }
    case 'set-pin-time':
      return commit(
        history,
        mapSegment(segments, action.id, (s) => ({ ...s, pinnedStartSec: Math.max(0, Math.round(action.sec)) })),
      );

    case 'toggle-compressible':
      return commit(history, mapSegment(segments, action.id, (s) => ({ ...s, compressible: !s.compressible })));

    case 'set-min-duration': {
      const sec = Math.max(0, Math.round(action.sec));
      return commit(
        history,
        mapSegment(segments, action.id, (s) => ({
          ...s,
          minDurationSec: Math.min(sec, s.plannedDurationSec),
        })),
      );
    }

    case 'reorder': {
      const from = segments.findIndex((s) => s.id === action.activeId);
      const to = segments.findIndex((s) => s.id === action.overId);
      if (from < 0 || to < 0 || from === to) return history;
      const next = [...segments];
      const [moved] = next.splice(from, 1);
      next.splice(to, 0, moved);
      return commit(history, next);
    }

    case 'add-segment': {
      const seg: Segment = {
        id: newSegmentId(),
        name: action.name ?? '新环节',
        kind: action.kind ?? 'segment',
        plannedDurationSec: 60,
        compressible: false,
        minDurationSec: 60,
        pinnedStartSec: null,
      };
      return commit(history, [...segments, seg]);
    }

    case 'remove-segment':
      return commit(history, segments.filter((s) => s.id !== action.id));

    default:
      return history;
  }
}

export function createHistory(segments: Segment[]): HistoryState {
  return { past: [], present: segments, future: [] };
}
