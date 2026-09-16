import { useEffect, useState } from 'react';
import {
  DndContext,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core';
import {
  SortableContext,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import type { Segment, TimedSegment } from '../types';
import type { RundownAction } from '../state/reducer';
import { formatClock, formatDelta, formatDuration, parseDuration } from '../lib/format';
import { kindStyle } from '../lib/theme';

interface SegmentListProps {
  plan: Segment[];
  timed: TimedSegment[];
  nowSegmentId: string | null;
  dispatch: React.Dispatch<RundownAction>;
}

export function SegmentList({ plan, timed, nowSegmentId, dispatch }: SegmentListProps) {
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 4 } }));

  const onDragEnd = (e: DragEndEvent) => {
    const { active, over } = e;
    if (over && active.id !== over.id) {
      dispatch({ type: 'reorder', activeId: String(active.id), overId: String(over.id) });
    }
  };

  return (
    <section className="panel" aria-label="环节列表">
      <p className="panel-title">环节编排（拖动 ⠿ 排序 · 时长支持 m:ss 或纯分钟数）</p>
      <div className="seg-header">
        <span />
        <span />
        <span>环节</span>
        <span>实际时段</span>
        <span>计划时长</span>
        <span>实际时长 / 变化</span>
        <span>压缩下限</span>
        <span>开关</span>
        <span />
      </div>
      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
        <SortableContext items={plan.map((s) => s.id)} strategy={verticalListSortingStrategy}>
          <div className="seg-list" style={{ marginTop: 6 }}>
            {timed.map((seg) => (
              <SortableRow
                key={seg.id}
                plan={plan.find((p) => p.id === seg.id) ?? seg}
                timed={seg}
                isNow={nowSegmentId === seg.id}
                dispatch={dispatch}
              />
            ))}
          </div>
        </SortableContext>
      </DndContext>
      <button
        className="add-row"
        style={{ marginTop: 10 }}
        onClick={() => dispatch({ type: 'add-segment' })}
      >
        + 添加环节
      </button>
    </section>
  );
}

function SortableRow({
  plan,
  timed,
  isNow,
  dispatch,
}: {
  plan: Segment;
  timed: TimedSegment;
  isNow: boolean;
  dispatch: React.Dispatch<RundownAction>;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: plan.id,
  });

  const [durText, setDurText] = useState(formatDuration(plan.plannedDurationSec));
  const [minText, setMinText] = useState(formatDuration(plan.minDurationSec));
  const [nameText, setNameText] = useState(plan.name);
  const [durBad, setDurBad] = useState(false);
  const [minBad, setMinBad] = useState(false);

  // 外部变化（撤销/重做/重置）时，若输入框未处于非法状态，同步回显
  useEffect(() => {
    const plannedDur = Math.max(plan.plannedDurationSec, plan.kind === 'buffer' ? 0 : plan.minDurationSec);
    if (!durBad && parseDuration(durText) !== plannedDur) setDurText(formatDuration(plannedDur));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [plan.plannedDurationSec, plan.minDurationSec, plan.kind]);
  useEffect(() => {
    if (!minBad) setMinText(formatDuration(plan.minDurationSec));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [plan.minDurationSec]);
  useEffect(() => setNameText(plan.name), [plan.name]);

  const commitName = () => {
    const name = nameText.trim();
    if (name && name !== plan.name) dispatch({ type: 'rename', id: plan.id, name });
    else setNameText(plan.name);
  };

  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.6 : 1,
    zIndex: isDragging ? 10 : undefined,
  };

  const commitDuration = () => {
    const sec = parseDuration(durText);
    if (sec === null) {
      setDurBad(true);
      return;
    }
    setDurBad(false);
    dispatch({ type: 'set-duration', id: plan.id, sec });
    setDurText(formatDuration(Math.max(sec, plan.kind === 'buffer' ? 0 : plan.minDurationSec)));
  };

  const commitMin = () => {
    const sec = parseDuration(minText);
    if (sec === null) {
      setMinBad(true);
      return;
    }
    setMinBad(false);
    dispatch({ type: 'set-min-duration', id: plan.id, sec });
  };

  const rowCls = [
    'seg-row',
    timed.status === 'conflict' ? 'is-conflict' : '',
    timed.status === 'compressed' ? 'compressed' : '',
    isNow ? 'now' : '',
  ]
    .filter(Boolean)
    .join(' ');

  const deltaCls = timed.deltaSec === 0 ? 'delta-zero' : timed.deltaSec > 0 ? 'delta-pos' : 'delta-neg';

  return (
    <div ref={setNodeRef} style={style} className={rowCls} data-testid="seg-row">
      <button
        type="button"
        className="drag-handle"
        aria-label={`拖动排序：${plan.name}`}
        {...attributes}
        {...listeners}
      >
        ⠿
      </button>
      <span className="kind-chip" style={{ background: kindStyle(plan.kind).color }} title={kindStyle(plan.kind).label} />

      <div className="seg-name">
        <input
          aria-label={`${plan.name} 名称`}
          value={nameText}
          onChange={(e) => setNameText(e.target.value)}
          onBlur={commitName}
          onKeyDown={(e) => e.key === 'Enter' && e.currentTarget.blur()}
        />
        <span className="seg-kind-label">
          {kindStyle(plan.kind).label}
          {timed.status === 'conflict' ? ' · 已低于下限' : timed.compressedSec > 0 ? ` · 已压缩 ${formatDuration(timed.compressedSec)}` : ''}
        </span>
      </div>

      <div className="seg-time">
        {formatClock(timed.startSec)}
        <br />– {formatClock(timed.endSec)}
      </div>

      <div className="seg-dur">
        <input
          aria-label={`${plan.name} 计划时长`}
          value={durText}
          className={durBad ? 'invalid' : ''}
          onChange={(e) => setDurText(e.target.value)}
          onBlur={commitDuration}
          onKeyDown={(e) => e.key === 'Enter' && commitDuration()}
        />
      </div>

      <div className="seg-actual">
        {formatDuration(timed.durationSec)} <span className={deltaCls}>{formatDelta(timed.deltaSec)}</span>
      </div>

      <div className="min-dur">
        {plan.kind === 'buffer' ? (
          '可降至 0:00'
        ) : (
          <>
            下限
            <input
              aria-label={`${plan.name} 压缩下限`}
              value={minText}
              className={minBad ? 'invalid' : ''}
              disabled={!plan.compressible}
              onChange={(e) => setMinText(e.target.value)}
              onBlur={commitMin}
              onKeyDown={(e) => e.key === 'Enter' && commitMin()}
            />
          </>
        )}
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
        <button
          type="button"
          className={`toggle-btn ${plan.pinnedStartSec !== null ? 'on' : ''}`}
          aria-pressed={plan.pinnedStartSec !== null}
          onClick={() => dispatch({ type: 'toggle-pin', id: plan.id })}
          title={plan.pinnedStartSec !== null ? `固定于 ${formatClock(plan.pinnedStartSec)} 开播（点击取消）` : '设为固定开播点'}
        >
          {plan.pinnedStartSec !== null ? `⚑ ${formatClock(plan.pinnedStartSec)}` : '设固定点'}
        </button>
        {plan.pinnedStartSec !== null && (
          <input
            aria-label={`${plan.name} 固定开播时间`}
            defaultValue={formatDuration(plan.pinnedStartSec)}
            key={`pin-${plan.pinnedStartSec}`}
            style={{ fontSize: 11, padding: '2px 6px' }}
            onClick={(e) => e.stopPropagation()}
            onPointerDown={(e) => e.stopPropagation()}
            onBlur={(e) => {
              const sec = parseDuration(e.target.value);
              if (sec !== null) dispatch({ type: 'set-pin-time', id: plan.id, sec });
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter') e.currentTarget.blur();
            }}
          />
        )}
        {plan.kind !== 'buffer' && (
          <button
            type="button"
            className={`toggle-btn compress ${plan.compressible ? 'on' : ''}`}
            aria-pressed={plan.compressible}
            onClick={() => dispatch({ type: 'toggle-compressible', id: plan.id })}
          >
            {plan.compressible ? '可压缩' : '不可压'}
          </button>
        )}
      </div>

      <button
        type="button"
        className="icon-btn"
        aria-label={`删除 ${plan.name}`}
        onClick={() => dispatch({ type: 'remove-segment', id: plan.id })}
      >
        ✕
      </button>
    </div>
  );
}
