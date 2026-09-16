import { useCallback, useEffect, useRef, useState } from 'react';

export const PLAYBACK_SPEEDS = [1, 2, 4, 8] as const;

export interface Playback {
  playing: boolean;
  playheadSec: number;
  speed: number;
  play: () => void;
  pause: () => void;
  toggle: () => void;
  stop: () => void;
  seek: (sec: number) => void;
  cycleSpeed: () => void;
}

/**
 * 播放头预演：用 requestAnimationFrame 按真实时间推进（倍速可加速），
 * 走到节目结尾自动暂停。
 */
export function usePlayback(endSec: number): Playback {
  const [playing, setPlaying] = useState(false);
  const [playheadSec, setPlayhead] = useState(0);
  const [speed, setSpeed] = useState<number>(1);

  const posRef = useRef(0);
  const lastTsRef = useRef<number | null>(null);
  const speedRef = useRef(speed);
  const endRef = useRef(endSec);
  speedRef.current = speed;
  endRef.current = endSec;

  useEffect(() => {
    if (!playing) return;
    lastTsRef.current = null;
    let raf = 0;
    const tick = (ts: number) => {
      if (lastTsRef.current === null) lastTsRef.current = ts;
      const dtSec = (ts - lastTsRef.current) / 1000;
      lastTsRef.current = ts;
      const next = Math.min(endRef.current, posRef.current + dtSec * speedRef.current);
      posRef.current = next;
      setPlayhead(next);
      if (next >= endRef.current) {
        setPlaying(false);
        return;
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [playing]);

  const seek = useCallback((sec: number) => {
    const clamped = Math.max(0, Math.min(endRef.current, sec));
    posRef.current = clamped;
    setPlayhead(clamped);
  }, []);

  const play = useCallback(() => {
    if (posRef.current >= endRef.current) posRef.current = 0;
    setPlaying(true);
  }, []);
  const pause = useCallback(() => setPlaying(false), []);
  const toggle = useCallback(() => {
    setPlaying((p) => {
      if (!p && posRef.current >= endRef.current) posRef.current = 0;
      return !p;
    });
  }, []);
  const stop = useCallback(() => {
    setPlaying(false);
    posRef.current = 0;
    setPlayhead(0);
  }, []);
  const cycleSpeed = useCallback(() => {
    setSpeed((s) => {
      const i = PLAYBACK_SPEEDS.indexOf(s as (typeof PLAYBACK_SPEEDS)[number]);
      return PLAYBACK_SPEEDS[(i + 1) % PLAYBACK_SPEEDS.length];
    });
  }, []);

  return { playing, playheadSec, speed, play, pause, toggle, stop, seek, cycleSpeed };
}
