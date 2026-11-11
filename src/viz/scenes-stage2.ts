import type { Scene } from './StepViz.tsx';

// Step-through scenes for the Stage 2 modules: networks, APIs and connecting services.

export const tcpHandshake: Scene = {
  height: 230,
  nodes: [
    { id: 'laptop', label: 'Your laptop', sub: 'the client', x: 110, y: 115 },
    { id: 'server', label: 'Web server', sub: 'port 443', x: 650, y: 115 },
  ],
  steps: [
    { title: 'May I connect?', text: 'Before any HTTP is sent, TCP sets up a connection. The client sends a **SYN** ("synchronize"), with a starting number it will count its packets from.', from: 'laptop', to: 'server', message: 'SYN, seq=100' },
    { title: 'Yes, and may I?', text: 'The server answers **SYN-ACK**: "I got your 100, and I\'ll count mine from 300." If nothing is listening on the port, it sends a refusal instead. That\'s "connection refused".', from: 'server', to: 'laptop', message: 'SYN-ACK, seq=300, ack=101' },
    { title: 'Agreed', text: 'The client sends **ACK** to confirm. That\'s the three-way handshake: one full round trip before any real data moves.', from: 'laptop', to: 'server', message: 'ACK, ack=301' },
    { title: 'Now the request', text: 'The HTTP request travels in numbered packets. (With HTTPS, the encryption handshake comes first, adding another round trip.)', from: 'laptop', to: 'server', message: 'packets 101, 102, 103' },
    { title: 'One goes missing', text: 'Packet 102 is lost on the way. The server only confirms what arrived in order, so it keeps saying "I have everything up to 101."', from: 'server', to: 'laptop', message: 'ack=102 (still waiting)', tone: 'bad' },
    { title: 'Send it again', text: 'The client notices and **retransmits** 102. The server puts everything back in order before handing it to the web server program. That\'s what "reliable" means, and why a lost packet causes a delay rather than a gap.', from: 'laptop', to: 'server', message: 'packet 102 (again)', tone: 'good' },
  ],
};

export const reverseProxy: Scene = {
  height: 300,
  nodes: [
    { id: 'browser', label: 'Browser', x: 90, y: 150 },
    { id: 'proxy', label: 'Reverse proxy', sub: 'shop.example:443', x: 360, y: 150 },
    { id: 'web', label: 'Website app', sub: 'localhost:3000', x: 660, y: 50 },
    { id: 'api', label: 'API app', sub: 'localhost:4000', x: 660, y: 150 },
    { id: 'files', label: 'Static files', sub: 'images, CSS', x: 660, y: 250 },
  ],
  steps: [
    { title: 'One public address', text: 'The browser only knows `https://shop.example`. It connects to the reverse proxy, the only part of the system the internet can reach.', from: 'browser', to: 'proxy', message: 'GET /api/orders' },
    { title: 'Decrypt', text: 'The proxy holds the certificate and handles HTTPS, so the apps behind it don\'t have to. This is called **TLS termination**.', active: ['proxy'] },
    { title: 'Route by path', text: 'Its rules say anything starting with `/api` goes to the API app. It adds `X-Forwarded-For` so the app can still see who the real visitor was.', from: 'proxy', to: 'api', message: 'GET /orders + X-Forwarded-For' },
    { title: 'Answer through the middle', text: 'The API answers the proxy, and the proxy passes the answer on. The browser never learns there were several apps.', from: 'api', to: 'proxy', message: '200 OK' },
    { title: 'Other paths, other apps', text: 'A request for `/images/logo.png` is answered straight from static files, and every other path goes to the website app. One address, many programs behind it.', from: 'proxy', to: 'files', message: 'GET /images/logo.png' },
    { title: 'Back to the browser', text: 'Every answer leaves through the proxy, encrypted again. Swapping or adding apps behind it changes nothing the outside world sees.', from: 'proxy', to: 'browser', message: '200 OK', tone: 'good' },
  ],
};

export const loadBalancer: Scene = {
  height: 300,
  nodes: [
    { id: 'users', label: 'Visitors', sub: 'thousands of them', x: 90, y: 150 },
    { id: 'lb', label: 'Load balancer', sub: 'one public address', x: 350, y: 150 },
    { id: 's1', label: 'Server 1', x: 650, y: 50 },
    { id: 's2', label: 'Server 2', x: 650, y: 150 },
    { id: 's3', label: 'Server 3', x: 650, y: 250 },
  ],
  steps: [
    { title: 'Requests arrive', text: 'Every visitor uses the same address. DNS points it at the load balancer, not at any one server.', from: 'users', to: 'lb', message: 'many requests' },
    { title: 'Round robin', text: 'The first request goes to server 1, the next to server 2, then server 3, then back to 1. That\'s **round robin**, the simplest way to share the work.', from: 'lb', to: 's1', message: 'request 1' },
    { title: 'The next one', text: 'Request 2 goes to server 2. Each server sees only a third of the traffic.', from: 'lb', to: 's2', message: 'request 2' },
    { title: 'Health checks', text: 'Every few seconds the load balancer asks each server `GET /health`. Server 3 stops answering: it crashed.', from: 'lb', to: 's3', message: 'GET /health … no answer', tone: 'bad' },
    { title: 'Taken out of rotation', text: 'The load balancer stops sending anything to server 3. Visitors notice nothing, because servers 1 and 2 take its share.', from: 'lb', to: 's1', message: 'request 3' },
    { title: 'Back when it\'s healthy', text: 'When server 3 restarts and passes its health checks again, it\'s quietly added back. Need more capacity? Add server 4 behind the same address.', from: 'lb', to: 's3', message: 'GET /health → 200', tone: 'good' },
  ],
};

export const cdnCache: Scene = {
  height: 300,
  nodes: [
    { id: 'tokyo', label: 'Visitor in Tokyo', x: 90, y: 60 },
    { id: 'tokyo2', label: 'Second visitor', sub: 'also in Tokyo', x: 90, y: 240 },
    { id: 'edge', label: 'CDN edge server', sub: 'in Tokyo', x: 370, y: 150 },
    { id: 'origin', label: 'Origin server', sub: 'in Virginia, USA', x: 660, y: 150 },
  ],
  steps: [
    { title: 'The nearest copy', text: 'The site uses a CDN, so DNS sends the Tokyo visitor to an **edge server** in Tokyo instead of all the way to the USA.', from: 'tokyo', to: 'edge', message: 'GET /logo.png' },
    { title: 'A cache miss', text: 'The edge has never seen this file. That\'s a **cache miss**, so it fetches it from the **origin**, the site\'s real server, across the Pacific.', from: 'edge', to: 'origin', message: 'GET /logo.png', tone: 'bad' },
    { title: 'Keep a copy', text: 'The origin answers with the file and `Cache-Control: max-age=86400`, meaning "you may reuse this for a day". The edge stores a copy.', from: 'origin', to: 'edge', message: '200 OK + max-age=86400' },
    { title: 'First visitor served', text: 'The first visitor waited for the long round trip, this once.', from: 'edge', to: 'tokyo', message: 'logo.png' },
    { title: 'A cache hit', text: 'The second visitor asks for the same file. The edge already has it: a **cache hit**. It answers in a few milliseconds, and the origin isn\'t bothered at all.', from: 'tokyo2', to: 'edge', message: 'GET /logo.png' },
    { title: 'Fast, and cheaper', text: 'Most visitors get the nearby copy. The origin handles a tiny share of the traffic, and a flood of visitors lands mostly on the CDN\'s huge network instead.', from: 'edge', to: 'tokyo2', message: 'logo.png (from cache)', tone: 'good' },
  ],
};

export const oauthFlow: Scene = {
  height: 320,
  nodes: [
    { id: 'user', label: 'You, in a browser', x: 90, y: 160 },
    { id: 'app', label: 'PhotoPrint app', sub: 'its own server', x: 370, y: 50 },
    { id: 'auth', label: 'Google sign-in', sub: 'authorization server', x: 660, y: 160 },
    { id: 'photos', label: 'Google Photos API', sub: 'resource server', x: 370, y: 270 },
  ],
  steps: [
    { title: '"Connect Google Photos"', text: 'You click a button in PhotoPrint. It never asks for your Google password. Instead, it sends your browser to Google with its `client_id`, the `scope` it wants (read photos), a `redirect_uri` and a random `state`.', from: 'app', to: 'user', message: 'go to Google' },
    { title: 'Log in where it\'s safe', text: 'You log in on Google\'s own page, so PhotoPrint never sees your password. Google shows a **consent screen**: "PhotoPrint wants to see your photos. Allow?"', from: 'user', to: 'auth', message: 'log in + Allow' },
    { title: 'A one-time code', text: 'Google sends your browser back to PhotoPrint\'s `redirect_uri` with a short-lived **authorization code** and the same `state`, so PhotoPrint can check the reply belongs to a request it started.', from: 'auth', to: 'user', message: 'redirect ?code=…&state=…' },
    { title: 'Back to the app', text: 'Your browser delivers the code to PhotoPrint\'s server.', from: 'user', to: 'app', message: 'code' },
    { title: 'Swap the code for tokens', text: 'PhotoPrint\'s **server** sends the code plus its `client_secret` straight to Google. This happens server to server, so the secret never touches a browser. Google answers with an **access token**, and often a **refresh token**.', from: 'app', to: 'auth', message: 'code + client_secret' },
    { title: 'Use the token', text: 'PhotoPrint calls the Photos API with `Authorization: Bearer <token>`. The token only allows reading photos, only yours, and only until it expires. You can revoke it at any time in your Google account.', from: 'app', to: 'photos', message: 'Bearer token', tone: 'good' },
  ],
};

export const webhookFlow: Scene = {
  height: 280,
  nodes: [
    { id: 'shop', label: 'Your shop', sub: 'webhook receiver', x: 110, y: 140 },
    { id: 'pay', label: 'Payment company', sub: 'e.g. Stripe', x: 650, y: 140 },
  ],
  steps: [
    { title: 'Register once', text: 'In the payment company\'s dashboard, you give it an address: `https://shop.example/webhooks/payments`. You also get a **signing secret** that only the two of you know.', from: 'shop', to: 'pay', message: 'my webhook URL is …' },
    { title: 'Something happens', text: 'Later, a customer\'s payment succeeds. Nobody asks. The payment company knows, and it has promised to tell you.', active: ['pay'] },
    { title: 'It calls you', text: 'It sends an HTTP POST to your address, with the event as JSON and a **signature** header made from the body and the secret.', from: 'pay', to: 'shop', message: 'POST payment.succeeded + signature' },
    { title: 'Check, then answer fast', text: 'Your code recomputes the signature. If it matches, the request really came from them and wasn\'t changed. It saves the event and answers `200` straight away, leaving slow work for later.', from: 'shop', to: 'pay', message: '200 OK', tone: 'good' },
    { title: 'If you don\'t answer', text: 'If your server is down or slow, the sender gets no `2xx` and **tries again** later, sometimes for days. So the same event can arrive twice.', from: 'pay', to: 'shop', message: 'POST (retry #2)', tone: 'bad' },
    { title: 'Ignore repeats', text: 'Every event has an `id`. Your code remembers which ids it has handled and skips repeats, so a retried event never ships an order twice.', active: ['shop'], tone: 'good' },
  ],
};

export const messageQueue: Scene = {
  height: 300,
  nodes: [
    { id: 'web', label: 'Web server', sub: 'the producer', x: 90, y: 150 },
    { id: 'queue', label: 'Queue', sub: '"send-email" jobs', x: 370, y: 150 },
    { id: 'w1', label: 'Worker 1', sub: 'a consumer', x: 660, y: 70 },
    { id: 'w2', label: 'Worker 2', sub: 'a consumer', x: 660, y: 230 },
  ],
  steps: [
    { title: 'Don\'t make the customer wait', text: 'A customer places an order. Sending the receipt email takes a few seconds, so the web server drops a message in a queue and answers the customer immediately.', from: 'web', to: 'queue', message: 'send receipt for order 501' },
    { title: 'Messages wait their turn', text: 'At a busy moment hundreds of messages pile up. That\'s fine: the queue holds them safely until a worker is free.', active: ['queue'] },
    { title: 'A worker takes one', text: 'Worker 1 asks for the next message. The queue hides it from other workers while it\'s being handled, but doesn\'t delete it yet.', from: 'queue', to: 'w1', message: 'order 501' },
    { title: 'Done: acknowledge', text: 'The email is sent, so the worker **acknowledges** the message. Only now does the queue delete it.', from: 'w1', to: 'queue', message: 'ack', tone: 'good' },
    { title: 'A worker crashes', text: 'Worker 2 takes order 502 and crashes halfway. It never acknowledges.', from: 'queue', to: 'w2', message: 'order 502', tone: 'bad' },
    { title: 'Delivered again', text: 'After a timeout, the queue makes 502 visible again and another worker gets it. Nothing is lost, but it can be processed twice, so workers must cope with repeats. A message that keeps failing is moved aside to a **dead-letter queue** for a person to look at.', from: 'queue', to: 'w1', message: 'order 502 (again)', tone: 'good' },
  ],
};

export const pubSub: Scene = {
  height: 300,
  nodes: [
    { id: 'shop', label: 'Order service', sub: 'the publisher', x: 90, y: 150 },
    { id: 'topic', label: 'Topic', sub: '"order.placed"', x: 360, y: 150 },
    { id: 'email', label: 'Email service', x: 660, y: 50 },
    { id: 'stock', label: 'Stock service', x: 660, y: 150 },
    { id: 'stats', label: 'Analytics', x: 660, y: 250 },
  ],
  steps: [
    { title: 'Announce, don\'t instruct', text: 'An order is placed. The order service publishes one **event** to the "order.placed" topic, saying "this happened". It doesn\'t know or care who\'s listening.', from: 'shop', to: 'topic', message: 'order.placed #501' },
    { title: 'Every subscriber gets a copy', text: 'Three services have **subscribed**. The topic sends each of them its own copy. That\'s **fan-out**.', from: 'topic', to: 'email', message: 'copy' },
    { title: 'They act independently', text: 'The stock service reduces stock. It works at its own pace, and if it\'s down for a minute, its copy waits for it.', from: 'topic', to: 'stock', message: 'copy' },
    { title: 'And another', text: 'Analytics records the sale. None of the three know about each other.', from: 'topic', to: 'stats', message: 'copy' },
    { title: 'Adding a listener is free', text: 'Next month a loyalty-points service subscribes too. The order service doesn\'t change at all. That\'s **loose coupling**.', active: ['topic'], tone: 'good' },
    { title: 'The cost', text: 'For a moment, the order exists but stock hasn\'t been reduced yet. The parts agree eventually, not instantly: that\'s **eventual consistency**. And following one order through the system now means checking several places.', active: ['email', 'stock', 'stats'], tone: 'bad' },
  ],
};

export const apiGateway: Scene = {
  height: 300,
  nodes: [
    { id: 'app', label: 'Mobile app', x: 90, y: 150 },
    { id: 'gw', label: 'API gateway', sub: 'api.shop.example', x: 360, y: 150 },
    { id: 'orders', label: 'Orders service', x: 660, y: 50 },
    { id: 'users', label: 'Accounts service', x: 660, y: 150 },
    { id: 'search', label: 'Search service', x: 660, y: 250 },
  ],
  steps: [
    { title: 'One front door', text: 'The app only knows one address. Behind it are several separate services, and the app doesn\'t need to know any of them.', from: 'app', to: 'gw', message: 'GET /orders + key' },
    { title: 'Check who\'s calling', text: 'The gateway checks the API key or token first. A bad key gets `401` here, and never reaches a service.', active: ['gw'] },
    { title: 'Check the speed limit', text: 'It counts this caller\'s requests. Over the limit? `429 Too Many Requests`, again without bothering any service.', active: ['gw'] },
    { title: 'Route it', text: 'Requests starting `/orders` go to the orders service. The gateway also logs every request in one place.', from: 'gw', to: 'orders', message: 'GET /orders' },
    { title: 'Answer', text: 'The service only does its own job. Login checks, limits and logging were handled once, at the door.', from: 'orders', to: 'gw', message: '200 OK' },
    { title: 'Back to the app', text: 'The same rules protect every service, and services can be split, moved or renamed without changing the app.', from: 'gw', to: 'app', message: '200 OK', tone: 'good' },
  ],
};
