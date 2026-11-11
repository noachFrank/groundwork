import { GitGraph } from './GitGraph.tsx';
import { corsDecision, dnsLookup, httpsHandshake, pollingVsWebsockets, requestTrip } from './scenes.ts';
import { apiGateway, cdnCache, loadBalancer, messageQueue, oauthFlow, pubSub, reverseProxy, tcpHandshake, webhookFlow } from './scenes-stage2.ts';
import { SqlJoin } from './SqlJoin.tsx';
import { StepViz } from './StepViz.tsx';

export const VIZ_LIST = [
  { name: 'request-trip', title: 'The trip a web request takes' },
  { name: 'dns-lookup', title: 'A DNS lookup' },
  { name: 'https-handshake', title: 'The HTTPS handshake' },
  { name: 'cors-decision', title: 'The CORS decision' },
  { name: 'polling-vs-websockets', title: 'Polling compared with WebSockets' },
  { name: 'git-branches', title: 'A Git branch graph' },
  { name: 'sql-join', title: 'A SQL join' },
  { name: 'tcp-handshake', title: 'A TCP connection, and a lost packet' },
  { name: 'reverse-proxy', title: 'A reverse proxy routing requests' },
  { name: 'load-balancer', title: 'A load balancer and health checks' },
  { name: 'cdn-cache', title: 'A CDN cache miss, then a hit' },
  { name: 'oauth-flow', title: 'OAuth: connecting an app to your account' },
  { name: 'webhook-flow', title: 'A webhook arriving, and a retry' },
  { name: 'message-queue', title: 'A message queue and its workers' },
  { name: 'pub-sub', title: 'Publish and subscribe' },
  { name: 'api-gateway', title: 'An API gateway' },
];

const SCENES = {
  'request-trip': requestTrip,
  'dns-lookup': dnsLookup,
  'https-handshake': httpsHandshake,
  'cors-decision': corsDecision,
  'polling-vs-websockets': pollingVsWebsockets,
  'tcp-handshake': tcpHandshake,
  'reverse-proxy': reverseProxy,
  'load-balancer': loadBalancer,
  'cdn-cache': cdnCache,
  'oauth-flow': oauthFlow,
  'webhook-flow': webhookFlow,
  'message-queue': messageQueue,
  'pub-sub': pubSub,
  'api-gateway': apiGateway,
};

export function Viz({ name }: { name: string }) {
  if (name === 'git-branches') return <GitGraph />;
  if (name === 'sql-join') return <SqlJoin />;
  const scene = SCENES[name as keyof typeof SCENES];
  return scene ? <StepViz scene={scene} /> : <p className="error-box">Unknown visualization: {name}</p>;
}
