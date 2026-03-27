export type BadgeType = 'founder' | 'team' | 'ambassador' | 'verified' | 'premium';

export interface Badge {
  type: BadgeType;
  label: string;
  icon: string;
  priority: number;
}

const ADMIN_IDS = (process.env.ADMIN_TELEGRAM_IDS || '')
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean);

/**
 * Compute badges for a user based on their data.
 * Called when building profile responses — NOT stored in DB.
 */
export function getUserBadges(user: {
  telegramId: bigint | string;
  verified?: boolean;
  isPremium?: boolean;
  isAmbassador?: boolean;
}): Badge[] {
  const badges: Badge[] = [];
  const tid = user.telegramId.toString();

  // Founder badge — first ID in ADMIN_TELEGRAM_IDS is the founder
  if (ADMIN_IDS.length > 0 && tid === ADMIN_IDS[0]) {
    badges.push({ type: 'founder', label: 'badges.founder', icon: '👑', priority: 0 });
  }
  // Team badge — other admin IDs
  else if (ADMIN_IDS.includes(tid)) {
    badges.push({ type: 'team', label: 'badges.team', icon: '🛡️', priority: 1 });
  }

  if (user.isAmbassador) {
    badges.push({ type: 'ambassador', label: 'badges.ambassador', icon: '⭐', priority: 2 });
  }

  if (user.verified) {
    badges.push({ type: 'verified', label: 'badges.verified', icon: '✓', priority: 3 });
  }

  if (user.isPremium) {
    badges.push({ type: 'premium', label: 'badges.premium', icon: '💎', priority: 4 });
  }

  return badges.sort((a, b) => a.priority - b.priority);
}
