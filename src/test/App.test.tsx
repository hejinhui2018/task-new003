import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import App from '../App';
import { STORAGE_KEYS } from '../state/storage';

afterEach(cleanup);

describe('导播台端到端场景', () => {
  beforeEach(() => localStorage.clear());

  it('初始为 30 分钟节目：10:00 开播、连线固定 10:15、10:30 结束、无冲突', () => {
    render(<App />);
    expect(screen.getByText('计划总时长')).toBeInTheDocument();
    // 实际总跨度 30:00，预计结束 10:30
    const stats = screen.getAllByText('30:00');
    expect(stats.length).toBeGreaterThan(0);
    const endCard = screen.getByText('预计结束 / 片尾').closest('.stat') as HTMLElement;
    expect(endCard).toHaveTextContent('10:30');
    expect(screen.getByText(/全部固定点可准点/)).toBeInTheDocument();
    // 固定点旗帜
    expect(screen.getByText(/10:15 固定开播/)).toBeInTheDocument();
  });

  it('采访延长 4 分钟：看到缓冲被吃光、采访被压缩 2 分钟，片尾仍是 10:30；撤销/重做随之恢复', () => {
    render(<App />);

    const interviewInput = screen.getByLabelText('嘉宾采访（可压缩） 计划时长') as HTMLInputElement;
    fireEvent.change(interviewInput, { target: { value: '10' } });
    fireEvent.keyDown(interviewInput, { key: 'Enter' });

    // 消化明细：缓冲 −2:00、采访压缩 −2:00
    const adj = screen.getByTestId('adjustment');
    expect(within(adj).getByText(/已消化.*现场连线.*10:15/)).toBeInTheDocument();
    expect(adj.textContent).toMatch(/缓冲段[\s\S]*2:00/);
    expect(adj.textContent).toMatch(/嘉宾采访（可压缩）[\s\S]*2:00/);

    // 缓冲余量卡：0:00 / 2:00
    const bufferCard = screen.getByText('缓冲余量').closest('.stat') as HTMLElement;
    expect(bufferCard.textContent).toMatch(/0:00\s*\/\s*2:00/);

    // 固定点仍准点、片尾仍是 10:30，无冲突卡
    expect(screen.queryByTestId('conflict')).toBeNull();
    const endCard = screen.getByText('预计结束 / 片尾').closest('.stat') as HTMLElement;
    expect(endCard.textContent).toContain('10:30');

    // 缓冲段在时间轴上的实际时长已为 0:00（行内“实际时长”列）
    const bufferRow = screen.getByLabelText('拖动排序：缓冲段').closest('.seg-row') as HTMLElement;
    expect(within(bufferRow).getByText(/^0:00/)).toBeInTheDocument();

    // 已落盘
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEYS.segments)!);
    expect(saved.find((s: { id: string }) => s.id === 'seg-interview').plannedDurationSec).toBe(600);

    // 撤销：缓冲恢复、消化卡消失
    fireEvent.click(screen.getByRole('button', { name: '↶ 撤销' }));
    expect(screen.queryByTestId('adjustment')).toBeNull();
    expect(screen.getByText(/全部固定点可准点/)).toBeInTheDocument();
    const bufferCard2 = screen.getByText('缓冲余量').closest('.stat') as HTMLElement;
    expect(bufferCard2.textContent).toMatch(/2:00\s*\/\s*2:00/);
    const endCard2 = screen.getByText('预计结束 / 片尾').closest('.stat') as HTMLElement;
    expect(endCard2).toHaveTextContent('10:30');
    const saved2 = JSON.parse(localStorage.getItem(STORAGE_KEYS.segments)!);
    expect(saved2.find((s: { id: string }) => s.id === 'seg-interview').plannedDurationSec).toBe(360);

    // 重做：消化状态原样回来
    fireEvent.click(screen.getByRole('button', { name: '↷ 重做' }));
    expect(screen.getByTestId('adjustment')).toBeInTheDocument();
    const bufferCard3 = screen.getByText('缓冲余量').closest('.stat') as HTMLElement;
    expect(bufferCard3.textContent).toMatch(/0:00\s*\/\s*2:00/);
  });

  it('新闻（不可压缩）延长 7 分钟：明确报出 2 分钟无法安放的冲突，撤销后消失', () => {
    render(<App />);

    const newsInput = screen.getByLabelText('新闻速览 计划时长') as HTMLInputElement;
    fireEvent.change(newsInput, { target: { value: '12' } });
    fireEvent.keyDown(newsInput, { key: 'Enter' });

    const conflict = screen.getByTestId('conflict');
    expect(conflict.textContent).toContain('固定点');
    expect(conflict.textContent).toMatch(/仍有\s*2:00\s*无法安放/);
    // 固定点旗帜仍在 10:15
    expect(screen.getByText(/10:15 固定开播/)).toBeInTheDocument();
    // 统计卡显示 1 个冲突
    const pinCard = screen.getByText('固定点 / 冲突').closest('.stat') as HTMLElement;
    expect(pinCard.textContent).toContain('1 冲突');

    fireEvent.click(screen.getByRole('button', { name: '↶ 撤销' }));
    expect(screen.queryByTestId('conflict')).toBeNull();
  });

  it('刷新页面后从 localStorage 恢复编排', () => {
    localStorage.setItem(
      STORAGE_KEYS.segments,
      JSON.stringify([
        {
          id: 'seg-intro',
          name: '开场',
          kind: 'intro',
          plannedDurationSec: 120,
          compressible: false,
          minDurationSec: 120,
          pinnedStartSec: null,
        },
        {
          id: 'seg-live-link',
          name: '现场连线',
          kind: 'live-link',
          plannedDurationSec: 300,
          compressible: false,
          minDurationSec: 300,
          pinnedStartSec: 300,
        },
      ]),
    );
    render(<App />);
    // 自定义数据：连线固定在相对 5:00（挂钟 10:05）
    expect(screen.getByText(/10:05 固定开播/)).toBeInTheDocument();
    expect(screen.queryByText('新闻速览')).toBeNull();
  });
});
