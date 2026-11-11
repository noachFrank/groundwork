// Runs just the practice lab servers. Used by `npm run check-content`.
// With --alt, every port is moved up by 20000 (4314 becomes 24314), so the checks can
// run against this copy of the code while an older copy of Groundwork is running.
import { Labs } from '../server/labs/index.ts';
import { PORTS, type Ports } from '../shared/ports.ts';

export const ALT_OFFSET = 20000;
const alt = process.argv.includes('--alt');
const ports = Object.fromEntries(Object.entries(PORTS).map(([k, v]) => [k, alt ? v + ALT_OFFSET : v])) as unknown as Ports;

const labs = new Labs(ports);
console.error = () => {};
labs.start();
