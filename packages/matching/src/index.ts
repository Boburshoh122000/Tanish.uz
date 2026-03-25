import { LIMITS } from '@tanish/shared';
import type { MatchScore } from '@tanish/shared';

interface UserForMatching {
  id: string;
  eloScore: number;
  lastActiveAt: Date;
  interests: string[];
  university?: string | null;
  workplace?: string | null;
  bio?: string | null;
  photoCount: number;
  verified: boolean;
  isPremium: boolean;
}

/**
 * Score a candidate relative to a user for matching purposes.
 * 
 * score = (
 *   interestOverlap * 0.30 +
 *   professionMatch * 0.25 +
 *   activityScore * 0.20 +
 *   eloProximity * 0.15 +
 *   profileQuality * 0.10
 * )
 */
export function scoreCandidate(
  user: UserForMatching,
  candidate: UserForMatching
): MatchScore {
  // Interest overlap: shared / max(userInterests, 5)
  const sharedInterests = candidate.interests.filter((id) =>
    user.interests.includes(id)
  );
  const interestOverlap = sharedInterests.length / Math.max(user.interests.length, 5);

  // Profession match: same university OR same workplace
  const sameUniversity =
    user.university && candidate.university && user.university === candidate.university ? 1 : 0;
  const sameWorkplace =
    user.workplace && candidate.workplace && user.workplace === candidate.workplace ? 1 : 0;
  const professionMatch = Math.max(sameUniversity, sameWorkplace);

  // Activity: based on lastActiveAt recency (1.0 = today, decays over 7 days)
  const daysSinceActive =
    (Date.now() - candidate.lastActiveAt.getTime()) / (1000 * 60 * 60 * 24);
  const activityScore = Math.max(0, 1 - daysSinceActive / 7);

  // ELO proximity: 1.0 - abs(userElo - candidateElo) / 1000
  const userElo = user.isPremium ? user.eloScore + LIMITS.ELO_PREMIUM_BOOST : user.eloScore;
  const candidateElo = candidate.isPremium
    ? candidate.eloScore + LIMITS.ELO_PREMIUM_BOOST
    : candidate.eloScore;
  const eloProximity = Math.max(0, 1.0 - Math.abs(userElo - candidateElo) / 1000);

  // Profile quality: has bio + has 2+ photos + verified bonus
  const hasBio = candidate.bio ? 1 : 0;
  const hasPhotos = candidate.photoCount >= 2 ? 1 : 0;
  const isVerified = candidate.verified ? 1 : 0;
  const profileQuality = (hasBio + hasPhotos + isVerified) / 3;

  const score =
    interestOverlap * 0.30 +
    professionMatch * 0.25 +
    activityScore * 0.20 +
    eloProximity * 0.15 +
    profileQuality * 0.10;

  return {
    userId: candidate.id,
    score: Math.round(score * 100) / 100,
    breakdown: {
      interestOverlap: Math.round(interestOverlap * 100) / 100,
      professionMatch,
      activityScore: Math.round(activityScore * 100) / 100,
      eloProximity: Math.round(eloProximity * 100) / 100,
      profileQuality: Math.round(profileQuality * 100) / 100,
    },
  };
}

/**
 * Rank candidates for a user and return the top N.
 */
export function rankCandidates(
  user: UserForMatching,
  candidates: UserForMatching[],
  limit: number
): MatchScore[] {
  const scored = candidates.map((candidate) => scoreCandidate(user, candidate));
  scored.sort((a, b) => b.score - a.score);
  return scored.slice(0, limit);
}

/**
 * Get the ELO tier for a user.
 */
export function getEloTier(eloScore: number): 1 | 2 | 3 {
  if (eloScore >= 1500) return 1;
  if (eloScore >= 1000) return 2;
  return 3;
}

export { LIMITS };
