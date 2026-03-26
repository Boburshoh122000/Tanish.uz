// Matching engine — barrel export
export {
  scoreCandidate,
  rankCandidates,
  getEloTier,
} from './scoring.service.js';
export type { UserForScoring } from './scoring.service.js';

export { generateBatches } from './daily-batch.service.js';

export { adjustScore, decayInactiveUsers } from './elo.service.js';
