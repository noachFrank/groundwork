import { GitGraph } from './GitGraph.tsx';
import { corsDecision, dnsLookup, httpsHandshake, pollingVsWebsockets, requestTrip } from './scenes.ts';
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
];

const SCENES = {
  'request-trip': requestTrip,
  'dns-lookup': dnsLookup,
  'https-handshake': httpsHandshake,
  'cors-decision': corsDecision,
  'polling-vs-websockets': pollingVsWebsockets,
};

export function Viz({ name }: { name: string }) {
  if (name === 'git-branches') return <GitGraph />;
  if (name === 'sql-join') return <SqlJoin />;
  const scene = SCENES[name as keyof typeof SCENES];
  return scene ? <StepViz scene={scene} /> : <p className="error-box">Unknown visualization: {name}</p>;
}
