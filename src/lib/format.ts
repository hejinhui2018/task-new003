/** 时间格式化工具：内部一律使用“相对节目开播的秒数” */

export function pad2(n: number): string {
  return n < 10 ? `0${n}` : `${n}`;
}

/** 秒 -> m:ss（超过 1 小时为 h:mm:ss） */
export function formatDuration(totalSec: number): string {
  const s = Math.round(totalSec);
  const h = Math.floor(Math.abs(s) / 3600);
  const m = Math.floor((Math.abs(s) % 3600) / 60);
  const sec = Math.abs(s) % 60;
  const body = h > 0 ? `${h}:${pad2(m)}:${pad2(sec)}` : `${m}:${pad2(sec)}`;
  return s < 0 ? `-${body}` : body;
}

/** 相对秒 + 当天基准 -> 挂钟时间 HH:MM */
export function formatClock(relSec: number, baseSec = 10 * 3600): string {
  const t = baseSec + Math.round(relSec);
  return `${pad2(Math.floor(t / 3600) % 24)}:${pad2(Math.floor((t % 3600) / 60))}`;
}

/** 相对秒 -> HH:MM:SS（播放头用） */
export function formatClockFull(relSec: number, baseSec = 10 * 3600): string {
  const t = baseSec + Math.max(0, Math.round(relSec));
  return `${pad2(Math.floor(t / 3600) % 24)}:${pad2(Math.floor((t % 3600) / 60))}:${pad2(t % 60)}`;
}

/** 带符号的时长变化，如 +4:00 / -1:45 */
export function formatDelta(sec: number): string {
  if (sec === 0) return '0:00';
  return `${sec > 0 ? '+' : '−'}${formatDuration(Math.abs(sec))}`;
}

/**
 * 解析时长输入：支持 "m:ss"、"h:mm:ss"、纯数字（视为分钟）。
 * 返回秒；无法解析返回 null。
 */
export function parseDuration(input: string): number | null {
  const trimmed = input.trim();
  if (!trimmed) return null;
  if (/^\d+$/.test(trimmed)) return Number(trimmed) * 60;
  const parts = trimmed.split(':').map((p) => p.trim());
  if (parts.length < 2 || parts.length > 3 || parts.some((p) => !/^\d+$/.test(p))) return null;
  const nums = parts.map(Number);
  if (parts.length === 2) {
    const [m, s] = nums;
    if (s >= 60) return null;
    return m * 60 + s;
  }
  const [h, m, s] = nums;
  if (m >= 60 || s >= 60) return null;
  return h * 3600 + m * 60 + s;
}
