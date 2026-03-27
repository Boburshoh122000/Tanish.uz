import { useTranslation } from 'react-i18next';
import type { Badge } from '@tanish/shared';

const BADGE_STYLES: Record<string, string> = {
  founder:    'bg-gradient-to-r from-amber-500 to-yellow-400 text-white',
  team:       'bg-gradient-to-r from-blue-500 to-cyan-400 text-white',
  ambassador: 'bg-gradient-to-r from-purple-500 to-pink-400 text-white',
  verified:   'bg-tg-button/15 text-tg-button',
  premium:    'bg-gradient-to-r from-violet-500 to-purple-400 text-white',
};

export default function BadgeRow({ badges }: { badges?: Badge[] }) {
  const { t } = useTranslation();

  if (!badges || badges.length === 0) return null;

  return (
    <div className="flex flex-wrap gap-1.5">
      {badges.map((badge) => (
        <span
          key={badge.type}
          className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold ${
            BADGE_STYLES[badge.type] || 'bg-tg-secondary-bg text-tg-text'
          }`}
        >
          <span>{badge.icon}</span>
          <span>{t(badge.label)}</span>
        </span>
      ))}
    </div>
  );
}

/** Compact badge for discovery cards — shows only the top badge as an overlay */
export function BadgeOverlay({ badges }: { badges?: Badge[] }) {
  const { t } = useTranslation();

  if (!badges || badges.length === 0) return null;

  const top = badges[0];

  return (
    <span
      className={`inline-flex items-center gap-0.5 px-2 py-0.5 rounded-full text-[10px] font-semibold shadow-sm ${
        BADGE_STYLES[top.type] || 'bg-tg-secondary-bg text-tg-text'
      }`}
    >
      <span>{top.icon}</span>
      <span>{t(top.label)}</span>
    </span>
  );
}
