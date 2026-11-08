/** Every server in the app listens only on this computer, on these ports. */
export interface Ports {
  app: number;
  /** "Website" used by the labs (the origin that gets blocked in the CORS lab). */
  site: number;
  /** A different origin: the API the CORS lab calls. */
  corsApi: number;
  /** WebSocket + polling lab. */
  live: number;
  /** A small practice API used by HTTP lessons and Python tasks. */
  http: number;
  /** Practice DNS server (UDP). 53 is the standard port, which Windows's nslookup insists on. */
  dns: number;
  /** Used only if something else already holds port 53. */
  dnsFallback: number;
}

export const PORTS: Ports = { app: 4310, site: 4311, corsApi: 4312, live: 4313, http: 4314, dns: 53, dnsFallback: 4315 };
export const DEV_PORT = 5173;
