import { LIMITS } from '@tanish/shared';
import type { MatchScore } from '@tanish/shared';

/**
 * Minimal shape needed to score a candidate.
 * Kept separate from Prisma types so the scoring logic is testable in isolation.
 */
export interface UserForScoring {
  id: string;
  eloScore: number;
  lastActiveAt: Date;
  interests: string[];        // interest IDs
  currentRole: string | null;
  university: string | null;
  bio: string | null;
  photoCount: number;
  verified: boolean;
  isPremium: boolean;
}

/**
 * Score a candidate relative to a user for matching purposes.
 *
 * score = interestOverlap * 0.30
 *       + professionMatch * 0.25
 *       + activityScore   * 0.20
 *       + eloProximity    * 0.15
 *       + profileQuality  * 0.10
 */
export function scoreCandidate(
  user: UserForScoring,
  candidate: UserForScoring,
): MatchScore {
  // 1. Interest overlap: shared count / max(user interest count, 5)
  const sharedCount = candidate.interests.filter((id) =>
    user.interests.includes(id),
  ).length;
  const interestOverlap = Math.min(
    sharedCount / Math.max(user.interests.length, 5),
    1,
  );

  // 2. Profession match: 1.0 if same university OR similar currentRole, else 0
  const sameUniversity =
    user.university &&
    candidate.university &&
    user.university === candidate.university;
  const similarRole =
    user.currentRole &&
    candidate.currentRole &&
    user.currentRole.toLowerCase() === candidate.currentRole.toLowerCase();
  const professionMatch = sameUniversity || similarRole ? 1 : 0;

  // 3. Activity: 1.0 = today, linear decay to 0 over 7 days
  const daysSinceActive =
    (Date.now() - candidate.lastActiveAt.getTime()) / (1000 * 60 * 60 * 24);
  const activityScore = Math.max(0, 1 - daysSinceActive / 7);

  // 4. ELO proximity: 1.0 - abs(diff) / 1000, clamped to [0, 1]
  const userElo = user.isPremium
    ? user.eloScore + LIMITS.ELO_PREMIUM_BOOST
    : user.eloScore;
  const candidateElo = candidate.isPremium
    ? candidate.eloScore + LIMITS.ELO_PREMIUM_BOOST
    : candidate.eloScore;
  const eloProximity = Math.max(
    0,
    1 - Math.abs(userElo - candidateElo) / 1000,
  );

  // 5. Profile quality: 0.4 bio + 0.3 photos(2+) + 0.3 verified
  const profileQuality =
    (candidate.bio ? 0.4 : 0) +
    (candidate.photoCount >= 2 ? 0.3 : 0) +
    (candidate.verified ? 0.3 : 0);

  const score =
    interestOverlap * 0.3 +
    professionMatch * 0.25 +
    activityScore * 0.2 +
    eloProximity * 0.15 +
    profileQuality * 0.1;

  return {
    userId: candidate.id,
    score: round2(score),
    breakdown: {
      interestOverlap: round2(interestOverlap),
      professionMatch,
      activityScore: round2(activityScore),
      eloProximity: round2(eloProximity),
      profileQuality: round2(profileQuality),
    },
  };
}

/**
 * Rank candidates by score and return the top N.
 */
export function rankCandidates(
  user: UserForScoring,
  candidates: UserForScoring[],
  limit: number,
): MatchScore[] {
  return candidates
    .map((c) => scoreCandidate(user, c))
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);
}

/**
 * ELO tier bucket (1 = highest).
 */
export function getEloTier(eloScore: number): 1 | 2 | 3 {
  if (eloScore >= 1500) return 1;
  if (eloScore >= 1000) return 2;
  return 3;
}

// ───── helpers ─────

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}
