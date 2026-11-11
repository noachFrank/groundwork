import { promises as dnsPromises } from 'node:dns';
import type { Server } from 'node:http';
import { createAdaptorServer } from '@hono/node-server';
import { Hono } from 'hono';
import { WebSocket, WebSocketServer } from 'ws';
import { DEV_PORT, PORTS, type Ports } from '../../shared/ports.ts';
import type { LabGoal, LabName, LabState } from '../../shared/types.ts';
import { hostGuard } from '../guard.ts';
import { PracticeDns } from './dns.ts';
import { corsLabPage, siteHomePage } from './pages.ts';
import { PracticeApi } from './practice-api.ts';

const logLimit = 25;

type Log = { at: string; text: string }[];
const stamp = () => new Date().toLocaleTimeString();

/**
 * Real services on separate local ports, so the lessons show real behavior: real
 * browser CORS errors, real WebSocket connections, real DNS packets. They bind to
 * 127.0.0.1 only, hold no real data, and reset whenever the app restarts.
 */
export class Labs {
  readonly ports: Ports;
  readonly appOrigins: string[];
  private servers: Server[] = [];
  private dns: PracticeDns;
  readonly practice = new PracticeApi();
  private ticker: NodeJS.Timeout | null = null;
  private wss: WebSocketServer | null = null;
  unavailable: string[] = [];

  private ports_ = { site: false, http: false, log: [] as Log };
  private http_ = { saw200: false, saw404: false, saw401: false, saw201: false, log: [] as Log, nextOrder: 104, created: [] as any[] };
  private cors = { allowOrigin: '', blocked: false, fixed: false, tooBroad: false, log: [] as Log };
  private dnsState = { queried: false, changed: false, requeried: false, nxdomain: false, log: [] as Log };
  private realDns = { looked: false, answer: null as null | string[], name: '', log: [] as Log };
  private live = { connected: false, sent: false, pushes: 0, polls: 0, wastedPolls: 0, tick: 0, value: 100, log: [] as Log };

  constructor(ports: Ports = PORTS) {
    this.ports = ports;
    this.appOrigins = [`http://localhost:${ports.app}`, `http://127.0.0.1:${ports.app}`, `http://localhost:${DEV_PORT}`];
    this.dns = new PracticeDns(ports.dns, ports.dnsFallback);
    this.dns.onQuery = (e) => {
      if (e.type === 'PTR') return;
      const inZone = e.name.endsWith('groundwork.test');
      if (e.type === 'A' || e.code === 'NXDOMAIN') {
        this.log(this.dnsState.log, `Query for ${e.name} (${e.type}): ${e.code === 'NXDOMAIN' ? 'no such name' : e.answer ?? 'no record of this type'}`);
      }
      if (inZone && e.code === 'NXDOMAIN') this.dnsState.nxdomain = true;
      if (e.type === 'A' && e.answer && inZone) {
        this.dnsState.queried = true;
        if (this.dnsState.changed && e.name === 'shop.groundwork.test') this.dnsState.requeried = true;
      }
    };
  }

  private log(log: Log, text: string) {
    log.unshift({ at: stamp(), text });
    log.length = Math.min(log.length, logLimit);
  }

  private listen(name: string, app: Hono, port: number): Server {
    const server = createAdaptorServer({ fetch: app.fetch, hostname: '127.0.0.1' }) as Server;
    server.on('error', (e: NodeJS.ErrnoException) => {
      this.unavailable.push(name);
      console.error(`  Lab "${name}" could not start on port ${port}: ${e.code ?? e.message}`);
    });
    server.listen(port, '127.0.0.1');
    this.servers.push(server);
    return server;
  }

  private buildSite(): Hono {
    const app = new Hono();
    app.use(hostGuard);
    app.get('/', (c) => c.html(siteHomePage(this.ports)));
    app.get('/whoami', (c) => {
      this.ports_.site = true;
      this.log(this.ports_.log, `Port ${this.ports.site} answered a request`);
      return c.text(`You reached the WEBSITE service, listening on port ${this.ports.site}.\n`);
    });
    app.get('/cors', (c) => c.html(corsLabPage(this.ports)));
    app.post('/report', async (c) => {
      const body = await c.req.json<{ ok: boolean; detail?: string }>();
      const siteOrigin = `http://localhost:${this.ports.site}`;
      if (body.ok) {
        if (this.cors.allowOrigin === siteOrigin) {
          this.cors.fixed = true;
          this.log(this.cors.log, 'Browser: the page was allowed to read the response. Fixed!');
        } else {
          this.cors.tooBroad = true;
          this.log(this.cors.log, `Browser: allowed, because the header is "${this.cors.allowOrigin}". It works, but it lets every website in.`);
        }
      } else {
        this.cors.blocked = true;
        this.log(this.cors.log, 'Browser: BLOCKED. The page was not allowed to read the response.');
      }
      return c.json({ ok: true });
    });
    return app;
  }

  private buildCorsApi(): Hono {
    const app = new Hono();
    app.use(hostGuard);
    const apply = (c: any) => {
      if (this.cors.allowOrigin) c.header('Access-Control-Allow-Origin', this.cors.allowOrigin);
    };
    app.options('/data', (c) => {
      apply(c);
      if (this.cors.allowOrigin) {
        c.header('Access-Control-Allow-Methods', 'GET, POST');
        c.header('Access-Control-Allow-Headers', 'Content-Type');
      }
      this.log(this.cors.log, `API: received a "preflight" (OPTIONS) from ${c.req.header('origin') ?? 'no origin'}`);
      return c.body(null, 204);
    });
    const respond = (c: any) => {
      apply(c);
      const header = this.cors.allowOrigin ? `Access-Control-Allow-Origin: ${this.cors.allowOrigin}` : 'no CORS header';
      this.log(this.cors.log, `API: ${c.req.method} from ${c.req.header('origin') ?? 'no origin'}. Sent 200 OK with ${header}`);
      return c.json({ message: 'Secret recipe: more butter.', servedBy: `port ${this.ports.corsApi}` });
    };
    app.get('/data', respond);
    app.post('/data', respond);
    return app;
  }

  private buildHttp(): Hono {
    const app = new Hono();
    app.use(hostGuard);
    // The practice API allows this app's own pages to call it, as a real API would for its own frontend.
    app.use(async (c, next) => {
      const origin = c.req.header('origin');
      if (origin && this.appOrigins.includes(origin)) {
        c.header('Access-Control-Allow-Origin', origin);
        c.header('Access-Control-Allow-Headers', 'Content-Type, X-API-Key, Authorization, X-Client-Id, If-None-Match');
        c.header('Access-Control-Allow-Methods', 'GET, POST, PUT, PATCH, DELETE, OPTIONS');
        c.header(
          'Access-Control-Expose-Headers',
          'Content-Type, X-Lab, Location, ETag, Cache-Control, Retry-After, X-RateLimit-Limit, X-RateLimit-Remaining, X-RateLimit-Reset, Deprecation, Sunset, Link, WWW-Authenticate',
        );
      }
      if (c.req.method === 'OPTIONS') return c.body(null, 204);
      await next();
      c.header('X-Lab', 'groundwork-practice-api');
      this.log(this.http_.log, `${c.req.method} ${c.req.path} → ${c.res.status}`);
      if (c.res.status === 200) this.http_.saw200 = true;
      if (c.res.status === 404) this.http_.saw404 = true;
      if (c.res.status === 401) this.http_.saw401 = true;
      if (c.res.status === 201) this.http_.saw201 = true;
    });
    // Orders 101 to 103 are read-only, so lessons that change orders can't break the
    // lessons that read them. Learners change the orders they created themselves.
    const orders = [
      { id: 101, customer: 'Ada', item: 'Keyboard', total: 49, status: 'shipped' },
      { id: 102, customer: 'Grace', item: 'Monitor', total: 189, status: 'processing' },
      { id: 103, customer: 'Ada', item: 'USB cable', total: 9, status: 'delivered' },
    ];
    const STATUSES = ['processing', 'shipped', 'delivered', 'cancelled'];
    const all = () => [...orders, ...this.http_.created];
    const create = (o: { customer: string; item: string; total: number }) => {
      const created = { id: this.http_.nextOrder++, customer: o.customer, item: o.item, total: o.total, status: 'processing' };
      this.http_.created.push(created);
      if (this.http_.created.length > 50) this.http_.created.shift();
      return created;
    };
    const needKey = (c: any) =>
      c.req.header('x-api-key') !== 'practice-key' ? c.json({ error: 'Missing or wrong API key. Send the header X-API-Key: practice-key' }, 401) : null;
    const readJson = async (c: any): Promise<any> => {
      try {
        return await c.req.json();
      } catch {
        return undefined;
      }
    };
    app.get('/hello', (c) => c.text('Hello from the Groundwork lab server!\n'));
    app.get('/whoami', (c) => {
      this.ports_.http = true;
      this.log(this.ports_.log, `Port ${this.ports.http} answered a request`);
      return c.text(`You reached the API service, listening on port ${this.ports.http}.\n`);
    });
    app.get('/orders', (c) => {
      const customer = c.req.query('customer');
      const status = c.req.query('status');
      return c.json(
        all().filter(
          (o) => (!customer || o.customer.toLowerCase() === customer.toLowerCase()) && (!status || o.status === status.toLowerCase()),
        ),
      );
    });
    app.get('/orders/:id', (c) => {
      const order = all().find((o) => String(o.id) === c.req.param('id'));
      return order ? c.json(order) : c.json({ error: 'No order with that id' }, 404);
    });
    app.post('/orders', async (c) => {
      const denied = needKey(c);
      if (denied) return denied;
      const body = await readJson(c);
      if (body === undefined) return c.json({ error: 'The body must be valid JSON' }, 400);
      if (!body?.customer || !body?.item) return c.json({ error: 'Both "customer" and "item" are required' }, 400);
      const created = create({ customer: String(body.customer), item: String(body.item), total: Number(body.total) || 0 });
      c.header('Location', `/orders/${created.id}`);
      return c.json(created, 201);
    });
    // Find an order the learner may change, or the response explaining why not.
    const changeable = (c: any) => {
      const id = c.req.param('id');
      if (orders.some((o) => String(o.id) === id)) {
        return { stop: c.json({ error: 'Orders 101 to 103 are read-only in the practice API, so other lessons keep working. Create your own order with POST /orders, then change that one.' }, 403) };
      }
      const order = this.http_.created.find((o) => String(o.id) === id);
      return order ? { order } : { stop: c.json({ error: 'No order with that id' }, 404) };
    };
    const update = async (c: any, full: boolean) => {
      const denied = needKey(c);
      if (denied) return denied;
      const found = changeable(c);
      if (found.stop) return found.stop;
      const body = await readJson(c);
      if (body === undefined || typeof body !== 'object' || body === null) return c.json({ error: 'The body must be a JSON object' }, 400);
      if (full && !(body.customer && body.item && body.total !== undefined && body.status)) {
        return c.json({ error: 'PUT replaces the whole order, so send all four fields: customer, item, total and status. To change just one field, use PATCH.' }, 400);
      }
      if (body.status !== undefined && !STATUSES.includes(body.status)) {
        return c.json({ error: `"${body.status}" isn't a status this API knows. Use one of: ${STATUSES.join(', ')}` }, 422);
      }
      if (body.total !== undefined && typeof body.total !== 'number') return c.json({ error: '"total" must be a number, with no quotes' }, 422);
      const order = found.order!;
      for (const k of ['customer', 'item', 'total', 'status'] as const) if (body[k] !== undefined) (order as any)[k] = k === 'total' ? body[k] : String(body[k]);
      return c.json(order);
    };
    app.patch('/orders/:id', (c) => update(c, false));
    app.put('/orders/:id', (c) => update(c, true));
    app.delete('/orders/:id', (c) => {
      const denied = needKey(c);
      if (denied) return denied;
      const found = changeable(c);
      if (found.stop) return found.stop;
      this.http_.created = this.http_.created.filter((o) => o !== found.order);
      return c.body(null, 204);
    });
    this.practice.register(app, all, create, [this.ports.app, DEV_PORT]);
    app.notFound((c) => c.json({ error: 'Nothing at this address' }, 404));
    return app;
  }

  private buildLive(): Hono {
    const app = new Hono();
    app.use(hostGuard);
    app.use(async (c, next) => {
      const origin = c.req.header('origin');
      if (origin && this.appOrigins.includes(origin)) c.header('Access-Control-Allow-Origin', origin);
      await next();
    });
    app.get('/poll', (c) => {
      const since = Number(c.req.query('since') ?? -1);
      const changed = since !== this.live.tick;
      this.live.polls++;
      if (!changed) this.live.wastedPolls++;
      return c.json({ tick: this.live.tick, value: this.live.value, changed });
    });
    return app;
  }

  private startLive(server: Server) {
    const wss = new WebSocketServer({
      server,
      verifyClient: ({ origin }: { origin?: string }) => !origin || this.appOrigins.includes(origin),
    });
    this.wss = wss;
    wss.on('error', () => {});
    wss.on('connection', (socket) => {
      this.live.connected = true;
      this.log(this.live.log, 'WebSocket: a client connected and the connection stays open');
      socket.on('message', (data) => {
        this.live.sent = true;
        const text = data.toString().slice(0, 200);
        this.log(this.live.log, `WebSocket: received "${text}" from the client`);
        socket.send(JSON.stringify({ kind: 'echo', text }));
      });
      socket.on('close', () => this.log(this.live.log, 'WebSocket: the client disconnected'));
      socket.on('error', () => {});
    });
    this.ticker = setInterval(() => {
      this.live.tick++;
      this.live.value = Math.round((this.live.value + (Math.random() - 0.5) * 6) * 100) / 100;
      for (const client of wss.clients) {
        if (client.readyState === WebSocket.OPEN) {
          client.send(JSON.stringify({ kind: 'update', tick: this.live.tick, value: this.live.value }));
          this.live.pushes++;
        }
      }
    }, 2000);
    this.ticker.unref();
  }

  start() {
    this.listen('site', this.buildSite(), this.ports.site);
    this.listen('cors', this.buildCorsApi(), this.ports.corsApi);
    this.listen('http', this.buildHttp(), this.ports.http);
    this.startLive(this.listen('live', this.buildLive(), this.ports.live));
    void this.dns.start((e) => {
      this.unavailable.push('dns');
      console.error(`  Practice DNS server could not start: ${e.message}`);
    });
  }

  async stop() {
    if (this.ticker) clearInterval(this.ticker);
    for (const c of this.wss?.clients ?? []) c.terminate();
    this.wss?.close();
    this.dns.stop();
    await Promise.all(
      this.servers.map(
        (s) =>
          new Promise<void>((r) => {
            s.closeAllConnections();
            s.close(() => r());
          }),
      ),
    );
  }

  state(lab: LabName): LabState {
    const goal = (id: string, text: string, done: boolean): LabGoal => ({ id, text, done });
    switch (lab) {
      case 'ports':
        return {
          lab,
          log: this.ports_.log,
          data: {},
          goals: [
            goal('site', `Reach the website service on port ${this.ports.site}`, this.ports_.site),
            goal('http', `Reach the API service on port ${this.ports.http}`, this.ports_.http),
          ],
        };
      case 'http':
        return {
          lab,
          log: this.http_.log,
          data: {},
          goals: [
            goal('200', 'Get a 200 OK by reading the orders', this.http_.saw200),
            goal('404', 'Get a 404 Not Found by asking for an order that does not exist', this.http_.saw404),
            goal('401', 'Get a 401 Unauthorized by creating an order with no API key', this.http_.saw401),
            goal('201', 'Get a 201 Created by creating an order with the API key', this.http_.saw201),
          ],
        };
      case 'cors':
        return {
          lab,
          log: this.cors.log,
          data: { allowOrigin: this.cors.allowOrigin, tooBroad: this.cors.tooBroad, siteUrl: `http://localhost:${this.ports.site}/cors` },
          goals: [
            goal('blocked', 'See the browser block a request, while the API still answers 200 OK', this.cors.blocked),
            goal('fixed', 'Fix it by allowing exactly one origin: the page\'s own', this.cors.fixed),
          ],
        };
      case 'dns':
        return {
          lab,
          log: this.dnsState.log,
          data: { records: Object.fromEntries(this.dns.records), port: this.dns.activePort, standardPort: this.ports.dns },
          goals: [
            goal('queried', 'Look up shop.groundwork.test', this.dnsState.queried),
            goal('nxdomain', 'Ask for a name in groundwork.test that doesn\'t exist', this.dnsState.nxdomain),
            goal('changed', 'Change where shop.groundwork.test points', this.dnsState.changed),
            goal('requeried', 'Look it up again and see the new address', this.dnsState.requeried),
          ],
        };
      case 'real-dns':
        return {
          lab,
          log: this.realDns.log,
          data: { answer: this.realDns.answer, name: this.realDns.name },
          goals: [goal('looked', 'Look up a real domain on the real internet', this.realDns.looked)],
        };
      case 'live':
        return {
          lab,
          log: this.live.log,
          data: { pushes: this.live.pushes, polls: this.live.polls, wastedPolls: this.live.wastedPolls, port: this.ports.live },
          goals: [
            goal('connected', 'Open a WebSocket connection', this.live.connected),
            goal('pushes', 'Receive 3 updates the server pushed, without asking', this.live.pushes >= 3),
            goal('sent', 'Send a message up the same connection', this.live.sent),
            goal('polled', 'Poll for updates at least 5 times to compare', this.live.polls >= 5),
          ],
        };
    }
  }

  goalsDone(lab: LabName): boolean {
    return this.state(lab).goals.every((g) => g.done);
  }

  /** Learner-triggered lab changes. Throws an Error with a friendly message on bad input. */
  async action(lab: LabName, body: any): Promise<void> {
    if (body?.type === 'reset') return this.reset(lab);
    if (lab === 'cors' && body?.type === 'set-header') {
      const value = String(body.value ?? '').trim();
      if (value.length > 200 || !/^[\x20-\x7e]*$/.test(value)) throw new Error('That value can\'t be sent as a header. Use plain text with no line breaks.');
      this.cors.allowOrigin = value;
      this.log(this.cors.log, value ? `API config changed: Access-Control-Allow-Origin: ${value}` : 'API config changed: no CORS header');
      return;
    }
    if (lab === 'dns' && body?.type === 'set-record') {
      const name = String(body.name ?? '').trim().toLowerCase();
      const ip = String(body.ip ?? '').trim();
      if (!this.dns.records.has(name)) throw new Error('Pick one of the existing names.');
      if (!/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.test(ip) || ip.split('.').some((n) => Number(n) > 255)) {
        throw new Error('An IPv4 address is four numbers from 0 to 255 with dots, like 10.0.0.99.');
      }
      if (this.dns.records.get(name) === ip) throw new Error('That is already the address. Try a different one.');
      this.dns.records.set(name, ip);
      if (name === 'shop.groundwork.test') {
        this.dnsState.changed = true;
        this.dnsState.requeried = false;
      }
      this.log(this.dnsState.log, `Zone changed: ${name} now points to ${ip}`);
      return;
    }
    if (lab === 'dns' && body?.type === 'lookup') {
      // Real DNS packets to the practice server, for when nslookup can't reach it.
      const name = String(body.name ?? '').trim().toLowerCase();
      if (!/^[a-z0-9-]+(.[a-z0-9-]+)+$/.test(name)) throw new Error('Type a name like shop.groundwork.test.');
      if (!this.dns.activePort) throw new Error('The practice DNS server is not running.');
      const resolver = new dnsPromises.Resolver({ timeout: 2000, tries: 1 });
      resolver.setServers([`127.0.0.1:${this.dns.activePort}`]);
      await resolver.resolve4(name).catch(() => null);
      return;
    }
    if (lab === 'real-dns' && body?.type === 'lookup') {
      const name = String(body.name ?? '').trim().toLowerCase();
      if (!/^[a-z0-9-]+(\.[a-z0-9-]+)+$/.test(name)) throw new Error('Type a domain name like example.com.');
      try {
        const answer = await dnsPromises.resolve4(name);
        this.realDns = { ...this.realDns, looked: true, answer, name };
        this.log(this.realDns.log, `${name} → ${answer.join(', ')}`);
      } catch {
        throw new Error(`Couldn't look up ${name}. Check the spelling and your internet connection.`);
      }
      return;
    }
    throw new Error('Unknown lab action.');
  }

  private reset(lab: LabName) {
    if (lab === 'cors') this.cors = { allowOrigin: '', blocked: false, fixed: false, tooBroad: false, log: [] };
    if (lab === 'dns') {
      this.dns.reset();
      this.dnsState = { queried: false, changed: false, requeried: false, nxdomain: false, log: [] };
    }
    if (lab === 'ports') this.ports_ = { site: false, http: false, log: [] };
    if (lab === 'http') {
      this.http_ = { saw200: false, saw404: false, saw401: false, saw201: false, log: [], nextOrder: 104, created: [] };
      this.practice.reset();
    }
    if (lab === 'live') this.live = { ...this.live, connected: false, sent: false, pushes: 0, polls: 0, wastedPolls: 0, log: [] };
    if (lab === 'real-dns') this.realDns = { looked: false, answer: null, name: '', log: [] };
  }
}
