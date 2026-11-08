// Runs just the practice lab servers. Used by `npm run check-content`.
import { Labs } from '../server/labs/index.ts';

const labs = new Labs();
console.error = () => {};
labs.start();
