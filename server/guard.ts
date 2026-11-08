import type { MiddlewareHandler } from 'hono';

const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1', '[::1]']);

const hostnameOf = (host: string) => host.replace(/:\d+$/, '').toLowerCase();

export const isLocalHost = (host: string | undefined) => !!host && LOCAL_HOSTS.has(hostnameOf(host));

export const isLocalOrigin = (origin: string) => {
  try {
    return LOCAL_HOSTS.has(new URL(origin).hostname.toLowerCase());
  } catch {
    return false;
  }
};

/**
 * Listening only on 127.0.0.1 keeps other computers out, but any website open in
 * the learner's browser can still try to reach localhost. Checking the Host header
 * blocks DNS-rebinding tricks. Used by every server, including the labs.
 */
export const hostGuard: MiddlewareHandler = async (c, next) => {
  if (!isLocalHost(c.req.header('host'))) return c.text('This server only answers requests from this computer.', 403);
  await next();
};

/** For the app's own API: other websites can't change progress or read data. */
export const sameAppOnly = (allowedOrigins: string[]): MiddlewareHandler => async (c, next) => {
  const origin = c.req.header('origin');
  if (origin && !allowedOrigins.includes(origin)) return c.json({ error: 'Not allowed from this website.' }, 403);
  const site = c.req.header('sec-fetch-site');
  if (site === 'cross-site') return c.json({ error: 'Not allowed from this website.' }, 403);
  await next();
};
