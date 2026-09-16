import { useEffect, useMemo, useReducer } from 'react';
import type { ScheduleResult } from '../types';
import { computeSchedule } from '../lib/schedule';
import { loadSegments, saveSegments } from './storage';
import { createHistory, rundownReducer, type RundownAction } from './reducer';

export interface RundownStore {
  schedule: ScheduleResult;
  canUndo: boolean;
  canRedo: boolean;
  dispatch: React.Dispatch<RundownAction>;
}

export function useRundown(): RundownStore {
  const [history, dispatch] = useReducer(
    rundownReducer,
    undefined,
    () => createHistory(loadSegments()),
  );

  // present 变化即落盘；撤销/重做也会随之恢复
  useEffect(() => {
    saveSegments(history.present);
  }, [history.present]);

  const schedule = useMemo(() => computeSchedule(history.present, 0), [history.present]);

  return {
    schedule,
    canUndo: history.past.length > 0,
    canRedo: history.future.length > 0,
    dispatch,
  };
}
