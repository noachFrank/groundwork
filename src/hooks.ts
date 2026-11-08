import { useCallback, useEffect, useRef, useState } from 'react';
import { api } from './api.ts';

/** Loads API data with loading and error states. `reload` fetches it again. */
export function useApi<T>(path: string | null) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const reload = useCallback(async () => {
    if (!path) return;
    try {
      setData(await api<T>(path));
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not load this.');
    }
  }, [path]);
  useEffect(() => {
    void reload();
  }, [reload]);
  return { data, error, reload, setData };
}

const TICK_SECONDS = 30;
const IDLE_AFTER_MS = 120000;

/**
 * Counts time actually studying. Time stops when this tab is hidden or there's been
 * no mouse or keyboard activity for two minutes, so leaving the app open overnight
 * doesn't turn into eight fake study hours.
 */
export function useStudyTimer(lessonId: string | null) {
  const lastActive = useRef(Date.now());
  useEffect(() => {
    const mark = () => {
      lastActive.current = Date.now();
    };
    const events = ['mousemove', 'keydown', 'click', 'scroll', 'touchstart'];
    events.forEach((e) => window.addEventListener(e, mark, { passive: true }));
    const timer = setInterval(() => {
      if (document.hidden || Date.now() - lastActive.current > IDLE_AFTER_MS) return;
      api('/time', { body: { lessonId, seconds: TICK_SECONDS } }).catch(() => {});
    }, TICK_SECONDS * 1000);
    return () => {
      events.forEach((e) => window.removeEventListener(e, mark));
      clearInterval(timer);
    };
  }, [lessonId]);
}
