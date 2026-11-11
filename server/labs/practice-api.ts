import { createHmac, randomBytes } from 'node:crypto';
import type { Context, Hono } from 'hono';
import { STARTERS } from './starters.ts';

/**
 * More of the practice API on port 4314, used by the Stage 2 lessons: cookies and
 * sessions, caching, tokens and OAuth, rate limits, pagination, API versions, GraphQL,
 * webhooks and a message queue. Everything is real HTTP with real headers and status
 * codes, holds no real data, and resets whenever the app restarts.
 *
 * Shared state is keyed by something the caller picks (a client id, a queue name), so
 * two runs of the same exercise never trip over each other.
 */

export const PRACTICE = {
  user: 'ada',
  password: 'practice-password',
  clientId: 'reports-app',
  clientSecret: 'practice-secret',
  authCode: 'practice-auth-code',
  redirectUri: 'http://localhost:4399/callback',
  expiredToken: 'practice-expired-token',
  webhookSecret: 'whsec_practice',
  catalogEtag: 'catalog-v1',
  rateLimit: 5,
  rateWindowSeconds: 60,
};

const PRODUCT_NAMES = [
  'Desk lamp', 'Notebook', 'Fountain pen', 'Stapler', 'Sticky notes', 'Paper clips', 'Desk mat', 'Monitor stand',
  'Cable ties', 'Webcam cover', 'Mouse pad', 'Highlighters', 'Whiteboard', 'Markers', 'Eraser', 'Ruler',
  'Scissors', 'Tape', 'Envelopes', 'Folder', 'Binder', 'Hole punch', 'Calculator',
];
export const PRODUCTS = PRODUCT_NAMES.map((name, i) => ({ id: i + 1, name, price: 2 + ((i * 7) % 30) }));

export const CUSTOMERS = [
  { id: 1, first: 'Ada', last: 'Lovelace', city: 'London' },
  { id: 2, first: 'Grace', last: 'Hopper', city: 'New York' },
  { id: 3, first: 'Lin', last: 'Chen', city: 'Toronto' },
  { id: 4, first: 'Sam', last: 'Okafor', city: 'Austin' },
];

interface QueueMessage {
  id: string;
  body: unknown;
  receiveCount: number;
  hiddenUntil: number;
}
interface Queue {
  waiting: QueueMessage[];
  done: number;
  dead: QueueMessage[];
  next: number;
}

type Order = { id: number; customer: string; item: string; total: number; status: string };

const VISIBILITY_SECONDS = 30;
const MAX_RECEIVES = 3;

export class PracticeApi {
  sessions = new Map<string, string>();
  tokens = new Map<string, { scopes: string[]; expires: number }>();
  refreshTokens = new Set<string>();
  limits = new Map<string, { start: number; count: number }>();
  queues = new Map<string, Queue>();
  webhooksSent = 0;
  nextEvent = 1;

  reset() {
    this.sessions.clear();
    this.tokens.clear();
    this.refreshTokens.clear();
    this.limits.clear();
    this.queues.clear();
    this.webhooksSent = 0;
  }

  /**
   * @param orders the base orders plus any the learner created, read fresh each time
   * @param create adds an order the way POST /orders does, for the GraphQL mutation
   * @param blockedPorts ports a webhook must never be sent to (the app itself)
   */
  register(app: Hono, orders: () => Order[], create: (o: Omit<Order, 'id' | 'status'>) => Order, blockedPorts: number[]) {
    // ---- Starter files for the milestone ------------------------------------------
    app.get('/starter/:name', (c) => {
      const text = STARTERS[c.req.param('name')];
      if (!text) return c.text(`No starter file by that name. Try: ${Object.keys(STARTERS).join(', ')}
`, 404);
      c.header('Content-Type', 'text/javascript; charset=utf-8');
      return c.body(text);
    });

    // ---- Cookies and sessions --------------------------------------------------
    app.post('/login', async (c) => {
      const body = await readBody(c);
      if (body.username !== PRACTICE.user || body.password !== PRACTICE.password) {
        return c.json({ error: `Wrong username or password. Use username=${PRACTICE.user} and password=${PRACTICE.password}` }, 401);
      }
      const id = randomBytes(12).toString('hex');
      this.sessions.set(id, PRACTICE.user);
      trim(this.sessions, 200);
      c.header('Set-Cookie', `session=${id}; Path=/; HttpOnly; SameSite=Lax; Max-Age=3600`);
      return c.json({ ok: true, message: `Logged in as ${PRACTICE.user}. Your browser (or curl) now holds a session cookie.` });
    });
    app.get('/me', (c) => {
      const user = this.sessions.get(cookie(c, 'session') ?? '');
      if (!user) return c.json({ error: 'Not logged in. No valid session cookie came with this request.' }, 401);
      return c.json({ user, message: `Hello ${user}. The server recognized your session cookie.` });
    });
    app.post('/logout', (c) => {
      this.sessions.delete(cookie(c, 'session') ?? '');
      c.header('Set-Cookie', 'session=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0');
      return c.json({ ok: true, message: 'Logged out. The session is gone on the server, and the cookie is cleared.' });
    });

    // ---- Caching -----------------------------------------------------------------
    app.get('/catalog', (c) => {
      const etag = `"${PRACTICE.catalogEtag}"`;
      c.header('ETag', etag);
      c.header('Cache-Control', 'public, max-age=60');
      const sent = (c.req.header('if-none-match') ?? '').split(',').map((t) => t.trim().replace(/^W\//, '').replace(/"/g, ''));
      if (sent.includes(PRACTICE.catalogEtag)) return c.body(null, 304);
      return c.json({ products: PRODUCTS.slice(0, 5), note: 'This answer has an ETag. Send it back in If-None-Match to get a 304.' });
    });

    // ---- Status codes on demand -------------------------------------------------------
    app.get('/status/:code', (c) => {
      const code = Number(c.req.param('code'));
      const message = STATUS_MESSAGES[code];
      if (!message) return c.json({ error: { code: 400, message: `Pick one of: ${Object.keys(STATUS_MESSAGES).join(', ')}` } }, 400);
      if (code === 429) c.header('Retry-After', '2');
      if (code === 503) c.header('Retry-After', '5');
      if (code === 200) return c.json({ ok: true, message });
      return c.json({ error: { code, message } }, code as any);
    });
    app.get('/slow', async (c) => {
      const seconds = Math.min(Math.max(Number(c.req.query('seconds') ?? 3) || 3, 0), 10);
      await new Promise((r) => setTimeout(r, seconds * 1000));
      return c.json({ ok: true, waited: seconds });
    });

    // ---- Tokens and OAuth --------------------------------------------------------------
    app.post('/oauth/token', async (c) => {
      const body = await readBody(c);
      const grant = body.grant_type;
      const issue = (scopes: string[], withRefresh: boolean) => {
        const token = `at_${randomBytes(10).toString('hex')}`;
        this.tokens.set(token, { scopes, expires: Date.now() + 3600_000 });
        trim(this.tokens, 500);
        const out: Record<string, unknown> = { access_token: token, token_type: 'Bearer', expires_in: 3600, scope: scopes.join(' ') };
        if (withRefresh) {
          const refresh = `rt_${randomBytes(10).toString('hex')}`;
          this.refreshTokens.add(refresh);
          out.refresh_token = refresh;
        }
        return c.json(out);
      };
      const scopes = String(body.scope ?? 'orders:read').split(/\s+/).filter(Boolean);
      const unknown = scopes.filter((s) => !['orders:read', 'reports:read'].includes(s));
      if (unknown.length) return c.json({ error: 'invalid_scope', error_description: `Unknown scope: ${unknown.join(', ')}. Use orders:read or reports:read.` }, 400);
      if (grant === 'client_credentials') {
        if (body.client_id !== PRACTICE.clientId || body.client_secret !== PRACTICE.clientSecret) {
          return c.json({ error: 'invalid_client', error_description: 'Wrong client_id or client_secret.' }, 401);
        }
        return issue(scopes, false);
      }
      if (grant === 'authorization_code') {
        if (body.client_id !== PRACTICE.clientId || body.client_secret !== PRACTICE.clientSecret) {
          return c.json({ error: 'invalid_client', error_description: 'Wrong client_id or client_secret.' }, 401);
        }
        if (body.code !== PRACTICE.authCode) return c.json({ error: 'invalid_grant', error_description: 'That authorization code is not valid.' }, 400);
        if (body.redirect_uri !== PRACTICE.redirectUri) return c.json({ error: 'invalid_grant', error_description: 'redirect_uri must match the one used to get the code.' }, 400);
        return issue(['orders:read', 'reports:read'], true);
      }
      if (grant === 'refresh_token') {
        if (!this.refreshTokens.has(String(body.refresh_token ?? ''))) return c.json({ error: 'invalid_grant', error_description: 'That refresh token is not valid.' }, 400);
        return issue(['orders:read', 'reports:read'], false);
      }
      return c.json({ error: 'unsupported_grant_type', error_description: 'Use grant_type=client_credentials, authorization_code or refresh_token.' }, 400);
    });
    app.get('/reports/sales', (c) => {
      const auth = c.req.header('authorization') ?? '';
      const match = /^Bearer\s+(\S+)$/i.exec(auth);
      if (!match) {
        c.header('WWW-Authenticate', 'Bearer realm="practice"');
        return c.json({ error: 'Missing token. Send the header Authorization: Bearer <access_token>' }, 401);
      }
      if (match[1] === PRACTICE.expiredToken) {
        c.header('WWW-Authenticate', 'Bearer error="invalid_token", error_description="The access token expired"');
        return c.json({ error: 'invalid_token', error_description: 'The access token expired. Get a new one.' }, 401);
      }
      const token = this.tokens.get(match[1]);
      if (!token || token.expires < Date.now()) {
        c.header('WWW-Authenticate', 'Bearer error="invalid_token"');
        return c.json({ error: 'invalid_token', error_description: 'That token is not valid.' }, 401);
      }
      if (!token.scopes.includes('reports:read')) {
        return c.json({ error: 'insufficient_scope', error_description: 'This token is valid, but it lacks the reports:read scope.' }, 403);
      }
      const all = orders();
      return c.json({ orders: all.length, revenue: all.reduce((s, o) => s + o.total, 0) });
    });

    // ---- Rate limits -------------------------------------------------------------------
    app.get('/limited', (c) => {
      const client = (c.req.header('x-client-id') ?? 'anonymous').slice(0, 80);
      const now = Date.now();
      let entry = this.limits.get(client);
      if (!entry || now - entry.start >= PRACTICE.rateWindowSeconds * 1000) {
        entry = { start: now, count: 0 };
        this.limits.set(client, entry);
        trim(this.limits, 1000);
      }
      const reset = Math.max(1, Math.ceil((entry.start + PRACTICE.rateWindowSeconds * 1000 - now) / 1000));
      c.header('X-RateLimit-Limit', String(PRACTICE.rateLimit));
      c.header('X-RateLimit-Reset', String(reset));
      if (entry.count >= PRACTICE.rateLimit) {
        c.header('X-RateLimit-Remaining', '0');
        c.header('Retry-After', String(reset));
        return c.json({ error: `Too many requests. The limit is ${PRACTICE.rateLimit} per ${PRACTICE.rateWindowSeconds} seconds. Try again in ${reset} seconds.` }, 429);
      }
      entry.count++;
      c.header('X-RateLimit-Remaining', String(PRACTICE.rateLimit - entry.count));
      return c.json({ ok: true, request: entry.count });
    });

    // ---- Pagination --------------------------------------------------------------------
    app.get('/products', (c) => {
      const perPage = Math.min(Math.max(Math.floor(Number(c.req.query('per_page') ?? 5)) || 5, 1), 20);
      const totalPages = Math.ceil(PRODUCTS.length / perPage);
      const page = Math.max(Math.floor(Number(c.req.query('page') ?? 1)) || 1, 1);
      const items = PRODUCTS.slice((page - 1) * perPage, page * perPage);
      return c.json({
        items,
        page,
        per_page: perPage,
        total: PRODUCTS.length,
        total_pages: totalPages,
        next: page < totalPages ? `/products?page=${page + 1}&per_page=${perPage}` : null,
      });
    });

    // ---- Versions ----------------------------------------------------------------------
    app.get('/v1/customers/:id', (c) => {
      c.header('Deprecation', 'true');
      c.header('Sunset', 'Thu, 31 Dec 2026 23:59:59 GMT');
      c.header('Link', `</v2/customers/${c.req.param('id')}>; rel="successor-version"`);
      const cu = CUSTOMERS.find((x) => String(x.id) === c.req.param('id'));
      if (!cu) return c.json({ error: 'No customer with that id' }, 404);
      return c.json({ id: cu.id, name: `${cu.first} ${cu.last}`, city: cu.city });
    });
    const v2 = (cu: (typeof CUSTOMERS)[number]) => ({
      id: cu.id,
      first_name: cu.first,
      last_name: cu.last,
      email: `${cu.first}.${cu.last}@example.com`.toLowerCase(),
      address: { city: cu.city },
    });
    app.get('/v2/customers', (c) => c.json({ data: CUSTOMERS.map(v2) }));
    app.get('/v2/customers/:id', (c) => {
      const cu = CUSTOMERS.find((x) => String(x.id) === c.req.param('id'));
      if (!cu) return c.json({ errors: [{ code: 'not_found', message: 'No customer with that id' }] }, 404);
      return c.json({ data: v2(cu) });
    });

    // ---- GraphQL -------------------------------------------------------------------------
    app.get('/graphql', (c) => c.json({ errors: [{ message: 'Send GraphQL as a POST with a JSON body like {"query": "{ orders { id } }"}' }] }, 405));
    app.post('/graphql', async (c) => {
      let body: any;
      try {
        body = await c.req.json();
      } catch {
        return c.json({ errors: [{ message: 'The body must be JSON, like {"query": "{ orders { id } }"}' }] }, 400);
      }
      if (typeof body?.query !== 'string') return c.json({ errors: [{ message: 'The JSON body needs a "query" string.' }] }, 400);
      let doc: Operation;
      try {
        doc = parseGraphql(body.query.slice(0, 5000));
      } catch (e) {
        return c.json({ errors: [{ message: `Syntax error: ${(e as Error).message}` }] }, 400);
      }
      const errors: { message: string }[] = [];
      const ctx: Resolve = { orders: orders(), vars: body.variables ?? {}, errors, create };
      const root = doc.kind === 'mutation' ? MUTATION : QUERY;
      const data = resolveSelection(root, null, doc.selection, ctx, doc.kind === 'mutation' ? 'Mutation' : 'Query');
      return c.json(errors.length ? { data: null, errors } : { data });
    });

    // ---- Webhooks ------------------------------------------------------------------------
    app.post('/webhooks/test', async (c) => {
      const body = await readBody(c);
      let target: URL;
      try {
        target = new URL(String(body.url ?? ''));
      } catch {
        return c.json({ error: 'Send url=http://localhost:PORT/path, the address of your webhook receiver.' }, 400);
      }
      const port = Number(target.port || 80);
      if (target.protocol !== 'http:' || !['localhost', '127.0.0.1'].includes(target.hostname) || port < 1024 || blockedPorts.includes(port)) {
        return c.json({ error: 'For safety, the practice API only sends webhooks to http://localhost on a port from 1024 up, and not to Groundwork itself.' }, 400);
      }
      const repeat = Math.min(Math.max(Math.floor(Number(body.repeat ?? 1)) || 1, 1), 3);
      const event = {
        id: `evt_${String(this.nextEvent++).padStart(4, '0')}`,
        type: 'order.created',
        created: new Date().toISOString(),
        data: { order: { id: 900 + (this.nextEvent % 100), customer: 'Ada', item: 'Desk lamp', total: 35 } },
      };
      const payload = JSON.stringify(event);
      const signature = `sha256=${createHmac('sha256', PRACTICE.webhookSecret).update(payload).digest('hex')}`;
      const statuses: number[] = [];
      for (let i = 0; i < repeat; i++) {
        try {
          const res = await fetch(target, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'X-Groundwork-Signature': signature, 'X-Groundwork-Event': event.type, 'X-Groundwork-Delivery': String(i + 1) },
            body: payload,
            redirect: 'manual',
            signal: AbortSignal.timeout(5000),
          });
          statuses.push(res.status);
          this.webhooksSent++;
        } catch {
          return c.json({ error: `Couldn't reach your receiver at ${target.href}. Is it running, on that port?` }, 502);
        }
      }
      return c.json({ sent: repeat, event_id: event.id, receiver_answered: statuses });
    });

    // ---- A message queue -------------------------------------------------------------------
    const queueOf = (c: Context, create = true): Queue | null => {
      const name = c.req.param('name') ?? '';
      if (!/^[a-z0-9-]{1,40}$/.test(name)) return null;
      let q = this.queues.get(name);
      if (!q && create) {
        q = { waiting: [], done: 0, dead: [], next: 1 };
        this.queues.set(name, q);
        trim(this.queues, 200);
      }
      return q ?? null;
    };
    const badName = (c: Context) => c.json({ error: 'Queue names use lowercase letters, numbers and dashes, like my-jobs.' }, 400);
    app.post('/queues/:name/messages', async (c) => {
      const q = queueOf(c);
      if (!q) return badName(c);
      let body: unknown;
      try {
        body = await c.req.json();
      } catch {
        return c.json({ error: 'Send the message as JSON.' }, 400);
      }
      if (q.waiting.length >= 200) return c.json({ error: 'This practice queue is full (200 messages).' }, 507);
      const msg: QueueMessage = { id: `m${q.next++}`, body, receiveCount: 0, hiddenUntil: 0 };
      q.waiting.push(msg);
      return c.json({ id: msg.id }, 201);
    });
    app.get('/queues/:name/messages/next', (c) => {
      const q = queueOf(c);
      if (!q) return badName(c);
      const now = Date.now();
      const msg = q.waiting.find((m) => m.hiddenUntil <= now);
      if (!msg) return c.body(null, 204);
      msg.receiveCount++;
      msg.hiddenUntil = now + VISIBILITY_SECONDS * 1000;
      return c.json({ id: msg.id, body: msg.body, receive_count: msg.receiveCount });
    });
    app.post('/queues/:name/messages/:id/ack', (c) => {
      const q = queueOf(c, false);
      const at = q?.waiting.findIndex((m) => m.id === c.req.param('id')) ?? -1;
      if (!q || at < 0) return c.json({ error: 'No message with that id is waiting. Was it already acknowledged?' }, 404);
      q.waiting.splice(at, 1);
      q.done++;
      return c.body(null, 204);
    });
    app.post('/queues/:name/messages/:id/release', (c) => {
      const q = queueOf(c, false);
      const at = q?.waiting.findIndex((m) => m.id === c.req.param('id')) ?? -1;
      if (!q || at < 0) return c.json({ error: 'No message with that id is waiting.' }, 404);
      const msg = q.waiting[at];
      if (msg.receiveCount >= MAX_RECEIVES) {
        q.waiting.splice(at, 1);
        q.dead.push(msg);
        return c.json({ moved_to: 'dead-letter', reason: `Received ${msg.receiveCount} times without success.` });
      }
      msg.hiddenUntil = 0;
      return c.json({ moved_to: 'queue', receive_count: msg.receiveCount });
    });
    app.get('/queues/:name', (c) => {
      const q = queueOf(c);
      if (!q) return badName(c);
      const now = Date.now();
      return c.json({
        waiting: q.waiting.filter((m) => m.hiddenUntil <= now).length,
        in_flight: q.waiting.filter((m) => m.hiddenUntil > now).length,
        done: q.done,
        dead_letter: q.dead.length,
      });
    });
    app.get('/queues/:name/dead', (c) => {
      const q = queueOf(c);
      if (!q) return badName(c);
      return c.json(q.dead.map((m) => ({ id: m.id, body: m.body, receive_count: m.receiveCount })));
    });
  }
}

const STATUS_MESSAGES: Record<number, string> = {
  200: 'Everything worked.',
  400: 'The request was malformed: something in it could not be understood.',
  401: 'You need to prove who you are first.',
  403: 'We know who you are, but you are not allowed to do this.',
  404: 'There is nothing at this address.',
  405: 'This address exists, but not for that method.',
  409: 'This conflicts with the current state, for example a duplicate.',
  415: 'The body is in a format this endpoint does not accept.',
  422: 'The request was understood, but the data in it is not valid.',
  429: 'Too many requests. Slow down and try again later.',
  500: 'Something went wrong inside the server.',
  502: 'A server in the middle got a bad answer from the server behind it.',
  503: 'The server is overloaded or down for maintenance. Try again later.',
  504: 'A server in the middle gave up waiting for the server behind it.',
};

function trim<K, V>(map: Map<K, V>, max: number) {
  while (map.size > max) map.delete(map.keys().next().value as K);
}

function cookie(c: Context, name: string): string | undefined {
  for (const part of (c.req.header('cookie') ?? '').split(';')) {
    const [k, ...v] = part.trim().split('=');
    if (k === name) return v.join('=');
  }
  return undefined;
}

/** Form fields (as curl -d sends) or JSON, so lessons can avoid PowerShell's quoting traps. */
async function readBody(c: Context): Promise<Record<string, any>> {
  const type = c.req.header('content-type') ?? '';
  try {
    if (type.includes('application/json')) return ((await c.req.json()) ?? {}) as Record<string, any>;
    const text = await c.req.text();
    return Object.fromEntries(new URLSearchParams(text));
  } catch {
    return {};
  }
}

// ---- A very small GraphQL: enough to feel the real thing ------------------------------

interface Field {
  name: string;
  args: Record<string, unknown>;
  selection: Field[] | null;
}
interface Operation {
  kind: 'query' | 'mutation';
  selection: Field[];
}
type Var = { variable: string };

export function parseGraphql(src: string): Operation {
  const tokens = src.match(/"(?:[^"\\]|\\.)*"|\$?[A-Za-z_][A-Za-z0-9_]*|-?\d+(?:\.\d+)?|[{}():,!\[\]]|\S/g) ?? [];
  let i = 0;
  const peek = () => tokens[i];
  const take = (expected?: string) => {
    const t = tokens[i++];
    if (t === undefined) throw new Error(expected ? `expected "${expected}" but the query ended` : 'the query ended too soon');
    if (expected && t !== expected) throw new Error(`expected "${expected}" but found "${t}"`);
    return t;
  };
  const name = () => {
    const t = take();
    if (!/^[A-Za-z_]/.test(t)) throw new Error(`expected a field name but found "${t}"`);
    return t;
  };
  const value = (): unknown => {
    const t = take();
    if (t.startsWith('"')) return JSON.parse(t);
    if (t.startsWith('$')) return { variable: t.slice(1) } satisfies Var;
    if (/^-?\d/.test(t)) return Number(t);
    if (t === 'true' || t === 'false') return t === 'true';
    if (t === 'null') return null;
    throw new Error(`"${t}" is not a value. Text needs double quotes, like "Ada".`);
  };
  const selection = (): Field[] => {
    take('{');
    const fields: Field[] = [];
    while (peek() !== '}') {
      if (peek() === undefined) throw new Error('a "{" was never closed with "}"');
      const field: Field = { name: name(), args: {}, selection: null };
      if (peek() === '(') {
        take('(');
        while (peek() !== ')') {
          const arg = name();
          take(':');
          field.args[arg] = value();
          if (peek() === ',') take(',');
        }
        take(')');
      }
      if (peek() === '{') field.selection = selection();
      fields.push(field);
      if (peek() === ',') take(',');
    }
    take('}');
    return fields;
  };
  let kind: Operation['kind'] = 'query';
  if (peek() === 'query' || peek() === 'mutation') {
    kind = take() as Operation['kind'];
    if (peek() && /^[A-Za-z_]/.test(peek())) name();
    if (peek() === '(') {
      // Variable definitions, like ($id: Int!). Their types aren't checked here.
      while (peek() !== ')' && peek() !== undefined) take();
      take(')');
    }
  }
  const sel = selection();
  if (i < tokens.length) throw new Error(`unexpected "${tokens[i]}" after the end of the query`);
  return { kind, selection: sel };
}

interface Resolve {
  orders: Order[];
  vars: Record<string, unknown>;
  errors: { message: string }[];
  create: (o: Omit<Order, 'id' | 'status'>) => Order;
}
type Resolver = (parent: any, args: Record<string, unknown>, ctx: Resolve) => unknown;
interface TypeDef {
  fields: Record<string, { type: string; list?: boolean; resolve?: Resolver }>;
}

const customerByName = (name: string) => CUSTOMERS.find((c) => c.first === name);
const customerOut = (c: (typeof CUSTOMERS)[number]) => ({ id: c.id, name: `${c.first} ${c.last}`, city: c.city, first: c.first });

const TYPES: Record<string, TypeDef> = {
  Query: {
    fields: {
      orders: {
        type: 'Order',
        list: true,
        resolve: (_p, a, ctx) => ctx.orders.filter((o) => (a.status === undefined || o.status === a.status) && (a.customer === undefined || o.customer === a.customer)),
      },
      order: { type: 'Order', resolve: (_p, a, ctx) => ctx.orders.find((o) => o.id === Number(a.id)) ?? null },
      customers: { type: 'Customer', list: true, resolve: () => CUSTOMERS.map(customerOut) },
      customer: { type: 'Customer', resolve: (_p, a) => (CUSTOMERS.find((c) => c.id === Number(a.id)) ? customerOut(CUSTOMERS.find((c) => c.id === Number(a.id))!) : null) },
    },
  },
  Mutation: {
    fields: {
      createOrder: {
        type: 'Order',
        resolve: (_p, a, ctx) => {
          if (typeof a.customer !== 'string' || typeof a.item !== 'string') {
            addError(ctx, { message: 'createOrder needs customer and item, as text in double quotes.' });
            return null;
          }
          return ctx.create({ customer: a.customer, item: a.item, total: Number(a.total) || 0 });
        },
      },
    },
  },
  Order: {
    fields: {
      id: { type: 'Int' },
      item: { type: 'String' },
      total: { type: 'Float' },
      status: { type: 'String' },
      customer: { type: 'Customer', resolve: (o: Order) => (customerByName(o.customer) ? customerOut(customerByName(o.customer)!) : null) },
    },
  },
  Customer: {
    fields: {
      id: { type: 'Int' },
      name: { type: 'String' },
      city: { type: 'String' },
      orders: { type: 'Order', list: true, resolve: (c: { first: string }, _a, ctx) => ctx.orders.filter((o) => o.customer === c.first) },
    },
  },
};
const QUERY = TYPES.Query;
const MUTATION = TYPES.Mutation;
const SCALARS = new Set(['Int', 'Float', 'String']);

function addError(ctx: Resolve, e: { message: string }) {
  if (!ctx.errors.some((x) => x.message === e.message)) ctx.errors.push(e);
}

function resolveSelection(type: TypeDef, parent: any, fields: Field[], ctx: Resolve, typeName: string): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const f of fields) {
    const def = type.fields[f.name];
    if (!def) {
      addError(ctx, { message: `Cannot query field "${f.name}" on type "${typeName}". It has: ${Object.keys(type.fields).join(', ')}.` });
      continue;
    }
    const args = Object.fromEntries(
      Object.entries(f.args).map(([k, v]) => [k, v && typeof v === 'object' && 'variable' in (v as Var) ? ctx.vars[(v as Var).variable] : v]),
    );
    const raw = def.resolve ? def.resolve(parent, args, ctx) : parent?.[f.name];
    if (SCALARS.has(def.type)) {
      if (f.selection) addError(ctx, { message: `Field "${f.name}" is a ${def.type}, so it can't have { } after it.` });
      out[f.name] = raw ?? null;
      continue;
    }
    if (!f.selection) {
      addError(ctx, { message: `Field "${f.name}" is a ${def.type}${def.list ? ' list' : ''}, so say which of its fields you want, like ${f.name} { id }.` });
      continue;
    }
    const sub = TYPES[def.type];
    if (raw === null || raw === undefined) out[f.name] = null;
    else if (def.list) out[f.name] = (raw as unknown[]).map((r) => resolveSelection(sub, r, f.selection!, ctx, def.type));
    else out[f.name] = resolveSelection(sub, raw, f.selection, ctx, def.type);
  }
  return out;
}
