import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';
import { api } from './api.ts';

interface OnlineState {
  /** null until the first check finishes. */
  online: boolean | null;
  recheck: () => Promise<void>;
}

const Ctx = createContext<OnlineState>({ online: null, recheck: async () => {} });

export function OnlineProvider({ children }: { children: ReactNode }) {
  const [online, setOnline] = useState<boolean | null>(null);

  const check = useCallback(async (force = false) => {
    try {
      const r = await api<{ online: boolean }>(`/connectivity${force ? '?force=1' : ''}`);
      setOnline(r.online);
    } catch {
      setOnline(false);
    }
  }, []);

  useEffect(() => {
    void check();
    const timer = setInterval(() => void check(), 20000);
    const onChange = () => void check(true);
    window.addEventListener('online', onChange);
    window.addEventListener('offline', onChange);
    return () => {
      clearInterval(timer);
      window.removeEventListener('online', onChange);
      window.removeEventListener('offline', onChange);
    };
  }, [check]);

  return <Ctx.Provider value={{ online, recheck: () => check(true) }}>{children}</Ctx.Provider>;
}

export const useOnline = () => useContext(Ctx);

/**
 * Wraps anything that needs the internet. Offline it explains what to do instead
 * of failing, and it switches over by itself once a connection returns.
 */
export function NeedsInternet({ what, children, canContinue = true }: { what: string; children: ReactNode; canContinue?: boolean }) {
  const { online, recheck } = useOnline();
  const [checking, setChecking] = useState(false);
  if (online) return <>{children}</>;
  if (online === null) return <p className="muted">Checking your connection…</p>;
  return (
    <div className="offline-box" role="status">
      <strong>You're offline.</strong> Connect to the internet to {what}.
      {canContinue && <> You can keep going with everything else and come back to this later.</>}
      <div>
        <button
          className="btn small"
          disabled={checking}
          onClick={async () => {
            setChecking(true);
            await recheck();
            setChecking(false);
          }}
        >
          {checking ? 'Checking…' : 'Check again'}
        </button>
      </div>
    </div>
  );
}

/** A link to an outside site. Offline, it stays readable but says it needs the internet. */
export function ExternalLink({ href, children }: { href: string; children: ReactNode }) {
  const { online } = useOnline();
  if (online === false) {
    return (
      <span className="link-offline" title="Connect to the internet to open this link">
        {children} <span className="tag tag-net">needs internet</span>
      </span>
    );
  }
  return (
    <a href={href} target="_blank" rel="noreferrer">
      {children} <span aria-hidden="true">↗</span>
    </a>
  );
}

export function ConnectionPill() {
  const { online } = useOnline();
  if (online === null) return null;
  return (
    <span
      className={`pill ${online ? 'pill-on' : 'pill-off'}`}
      title={online ? 'Connected. Videos and internet tasks are available.' : 'Not connected. Everything marked "offline" still works.'}
    >
      <span className="dot" /> {online ? 'Online' : 'Offline'}
    </span>
  );
}
