import type { Scene } from './StepViz.tsx';

export const requestTrip: Scene = {
  height: 300,
  nodes: [
    { id: 'browser', label: 'Your browser', x: 90, y: 70 },
    { id: 'dns', label: 'DNS server', sub: 'the address book', x: 380, y: 70 },
    { id: 'router', label: 'Your router', sub: 'and the internet', x: 90, y: 230 },
    { id: 'server', label: 'Web server', sub: 'shop.example', x: 670, y: 230 },
    { id: 'db', label: 'Database', x: 670, y: 70 },
  ],
  steps: [
    { title: 'You press Enter', text: 'You type `https://shop.example` and press Enter. Your browser knows a name, but computers connect using numbers.', active: ['browser'] },
    { title: 'Ask for the address', text: 'The browser asks a DNS server: "What is the IP address for shop.example?"', from: 'browser', to: 'dns', message: 'shop.example?' },
    { title: 'The answer', text: 'The DNS server answers with an IP address. Now the browser knows where to go.', from: 'dns', to: 'browser', message: '93.184.216.34' },
    { title: 'Leave the house', text: 'The browser opens a connection. The data goes to your router first, then hops across the internet.', from: 'browser', to: 'router', message: 'connect' },
    { title: 'Connect and secure', text: 'The connection reaches the server on port 443, and they set up encryption. That\'s the "S" in HTTPS.', from: 'router', to: 'server', message: 'port 443 + TLS' },
    { title: 'Ask for the page', text: 'Now the actual HTTP request travels, encrypted: "GET / please".', from: 'router', to: 'server', message: 'GET /' },
    { title: 'The server looks things up', text: 'The web server often needs data, so it asks its database for today\'s products.', from: 'server', to: 'db', message: 'SELECT …' },
    { title: 'Data comes back', text: 'The database hands back rows of data, and the server builds the response.', from: 'db', to: 'server', message: 'rows' },
    { title: 'The response', text: 'The server answers with a status code (`200 OK`) and the HTML of the page.', from: 'server', to: 'router', message: '200 OK + HTML' },
    { title: 'The page appears', text: 'The browser reads the HTML, and it usually repeats this trip for images, styles and scripts. All of this takes around a second.', from: 'router', to: 'browser', message: 'page', tone: 'good' },
  ],
};

export const dnsLookup: Scene = {
  height: 300,
  nodes: [
    { id: 'laptop', label: 'Your laptop', sub: 'checks its cache', x: 90, y: 150 },
    { id: 'resolver', label: 'Resolver', sub: 'your ISP, usually', x: 320, y: 150 },
    { id: 'root', label: 'Root server', sub: 'knows .com, .org…', x: 620, y: 40 },
    { id: 'tld', label: '.com server', sub: 'knows each .com', x: 620, y: 150 },
    { id: 'auth', label: 'Authoritative', sub: 'example.com\'s own', x: 620, y: 260 },
  ],
  steps: [
    { title: 'Check nearby first', text: 'Your laptop checks whether it already looked this name up recently. If so, it\'s done, no network needed.', active: ['laptop'] },
    { title: 'Ask the resolver', text: 'If not, it asks a resolver, a DNS server whose job is to find answers on your behalf.', from: 'laptop', to: 'resolver', message: 'www.example.com?' },
    { title: 'Start at the root', text: 'The resolver doesn\'t know either, so it starts at the top and asks a root server.', from: 'resolver', to: 'root', message: 'www.example.com?' },
    { title: '"Ask the .com servers"', text: 'The root doesn\'t know the answer, but it knows who handles `.com`.', from: 'root', to: 'resolver', message: 'try .com' },
    { title: 'Ask .com', text: 'The resolver asks a `.com` server.', from: 'resolver', to: 'tld', message: 'www.example.com?' },
    { title: '"Ask example.com\'s own servers"', text: 'The `.com` server points at the name servers that example.com\'s owner set up.', from: 'tld', to: 'resolver', message: 'try ns1.example.com' },
    { title: 'Ask the authority', text: 'The resolver asks the authoritative server, the source of truth for this domain.', from: 'resolver', to: 'auth', message: 'www.example.com?' },
    { title: 'The real answer', text: 'It answers with the IP address, plus a TTL: how many seconds this answer may be remembered.', from: 'auth', to: 'resolver', message: 'A 93.184.216.34, TTL 300' },
    { title: 'Back to you', text: 'The resolver caches the answer and hands it to your laptop. Thanks to caching, most lookups stop far earlier than this. It\'s also why a DNS change can take a while to reach everyone.', from: 'resolver', to: 'laptop', message: '93.184.216.34', tone: 'good' },
  ],
};

export const httpsHandshake: Scene = {
  height: 220,
  nodes: [
    { id: 'browser', label: 'Your browser', x: 110, y: 110 },
    { id: 'server', label: 'bank.example', sub: 'web server', x: 650, y: 110 },
  ],
  steps: [
    { title: 'Hello', text: 'After connecting, the browser says which encryption methods it supports, and sends its half of a key exchange.', from: 'browser', to: 'server', message: 'ClientHello + key share' },
    { title: 'Hello back, plus a certificate', text: 'The server picks a method, sends its half of the key exchange, and shows its certificate: an ID saying "I am bank.example", signed by a Certificate Authority.', from: 'server', to: 'browser', message: 'ServerHello + certificate' },
    { title: 'Check the ID', text: 'The browser checks the certificate: is it for this exact name? Not expired? Signed by an authority it trusts? If not, you see a big warning page.', active: ['browser'] },
    { title: 'Prove it', text: 'A certificate is public, so anyone could copy one. The server also signs the handshake with its private key, which proves it really owns this certificate.', from: 'server', to: 'browser', message: 'signature' },
    { title: 'Same secret on both sides', text: 'Each side combines its private value with the other\'s key share and arrives at the same secret. Someone listening in saw the key shares but still can\'t work it out.', active: ['browser', 'server'] },
    { title: 'Encrypted from here on', text: 'Everything now uses that shared secret. Anyone in between (like a café\'s Wi-Fi) can see which site you\'re talking to, but not what you\'re saying.', from: 'browser', to: 'server', message: 'encrypted: GET /balance', tone: 'good' },
  ],
};

export const corsDecision: Scene = {
  height: 280,
  nodes: [
    { id: 'page', label: 'The page', sub: 'localhost:4311', x: 110, y: 70 },
    { id: 'browser', label: 'Browser', sub: 'enforces the rule', x: 110, y: 220 },
    { id: 'api', label: 'The API', sub: 'localhost:4312', x: 650, y: 150 },
  ],
  steps: [
    { title: 'The page asks', text: 'JavaScript on the page calls `fetch(\'http://localhost:4312/data\')`. Different port means a different **origin**.', from: 'page', to: 'browser', message: 'fetch()' },
    { title: 'The request still goes out', text: 'The browser adds a header saying where the page came from: `Origin: http://localhost:4311`, and sends it.', from: 'browser', to: 'api', message: 'Origin: localhost:4311' },
    { title: 'The API answers normally', text: 'The API does its work and answers `200 OK`. This surprises people: the server usually isn\'t the one blocking anything.', from: 'api', to: 'browser', message: '200 OK + data' },
    { title: 'The browser reads the headers', text: 'Before handing over the response, the browser looks for `Access-Control-Allow-Origin`. Does it allow this page\'s origin?', active: ['browser'] },
    { title: 'No match: blocked', text: 'If the header is missing or doesn\'t match, the browser throws the data away and the page gets an error. Tools like curl and Postman don\'t have this rule, which is why "it works in Postman".', from: 'browser', to: 'page', message: 'CORS error', tone: 'bad' },
    { title: 'Match: allowed', text: 'With `Access-Control-Allow-Origin: http://localhost:4311`, the browser hands the data to the page. So the fix belongs on the server, not in the page.', from: 'browser', to: 'page', message: 'here is the data', tone: 'good' },
  ],
};

export const pollingVsWebsockets: Scene = {
  height: 240,
  nodes: [
    { id: 'client', label: 'Browser', x: 110, y: 120 },
    { id: 'server', label: 'Server', x: 650, y: 120 },
  ],
  steps: [
    { title: 'Polling: ask', text: 'With polling, the browser asks "anything new?" on a timer, with a full HTTP request each time.', from: 'client', to: 'server', message: 'GET /updates' },
    { title: 'Polling: usually nothing', text: 'Most of the time the answer is "no". That was a wasted round trip, repeated by every user.', from: 'server', to: 'client', message: 'nothing new' },
    { title: 'Polling: ask again', text: 'And again. Polling is simple and reliable, and it\'s often good enough if updates are rare or a delay is fine.', from: 'client', to: 'server', message: 'GET /updates' },
    { title: 'Polling: finally', text: 'When something does happen, you only find out at the next poll, so there\'s a delay.', from: 'server', to: 'client', message: 'yes! new data' },
    { title: 'WebSocket: upgrade', text: 'A WebSocket starts as an HTTP request asking to "upgrade" the connection.', from: 'client', to: 'server', message: 'Upgrade: websocket' },
    { title: 'WebSocket: stays open', text: 'The server agrees (`101 Switching Protocols`), and the connection now stays open instead of closing.', from: 'server', to: 'client', message: '101', active: ['client', 'server'] },
    { title: 'WebSocket: server pushes', text: 'Now the server can send data the moment something happens, without being asked.', from: 'server', to: 'client', message: 'new data', tone: 'good' },
    { title: 'WebSocket: both directions', text: 'The browser can send up the same connection, too. The cost: the server must hold a connection open for every user, which matters at scale.', from: 'client', to: 'server', message: 'message', tone: 'good' },
  ],
};
