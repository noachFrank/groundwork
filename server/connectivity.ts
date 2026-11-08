/**
 * Is the internet actually usable? The browser's `navigator.onLine` only knows
 * whether a network is attached, so it says "online" on a dead Wi-Fi or a hotel
 * login page. Instead the server makes a tiny request and watches for a response.
 */
const PROBES = ['https://www.gstatic.com/generate_204', 'https://www.cloudflare.com/cdn-cgi/trace'];
const TIMEOUT_MS = 4000;
const CACHE_MS = 15000;

export type Probe = (url: string, signal: AbortSignal) => Promise<boolean>;

const defaultProbe: Probe = async (url, signal) => {
  const res = await fetch(url, { method: 'GET', redirect: 'manual', signal, cache: 'no-store' });
  // A login page on hotel Wi-Fi answers with a redirect, which isn't real internet.
  return res.status >= 200 && res.status < 300;
};

export class Connectivity {
  private probe: Probe;
  private cached: { online: boolean; at: number } | null = null;
  private inFlight: Promise<boolean> | null = null;
  private forceOffline: boolean;

  constructor(probe: Probe = defaultProbe, forceOffline = process.env.GROUNDWORK_FORCE_OFFLINE === '1') {
    this.probe = probe;
    this.forceOffline = forceOffline;
  }

  async check(force = false): Promise<boolean> {
    if (this.forceOffline) return false;
    if (!force && this.cached && Date.now() - this.cached.at < CACHE_MS) return this.cached.online;
    this.inFlight ??= this.run().finally(() => {
      this.inFlight = null;
    });
    return this.inFlight;
  }

  private async run(): Promise<boolean> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
    try {
      const online = await Promise.any(
        PROBES.map(async (url) => {
          if (await this.probe(url, controller.signal)) return true;
          throw new Error('no response');
        }),
      ).catch(() => false);
      this.cached = { online, at: Date.now() };
      return online;
    } finally {
      clearTimeout(timer);
      controller.abort();
    }
  }
}
