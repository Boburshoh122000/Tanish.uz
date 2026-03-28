import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import WebApp from '@twa-dev/sdk';
import { useAppStore } from '@/store';
import ProfileCard from '@/components/ProfileCard';
import BadgeRow from '@/components/BadgeRow';
import type { PublicProfile, UserProfile } from '@tanish/shared';

export default function MyProfilePage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { user, matchedIntros } = useAppStore();

  useEffect(() => {
    WebApp.BackButton.hide();
  }, []);

  if (!user) {
    return (
      <div className="flex items-center justify-center min-h-screen pb-20">
        <p className="text-tg-hint">{t('common.loading')}</p>
      </div>
    );
  }

  const age = Math.floor(
    (Date.now() - new Date(user.birthDate).getTime()) / (365.25 * 24 * 60 * 60 * 1000),
  );

  const ownProfile: PublicProfile = {
    id: user.id,
    username: user.username ?? null,
    firstName: user.firstName,
    lastName: user.lastName ?? null,
    gender: user.gender,
    lookingFor: user.lookingFor ?? [],
    age,
    city: user.city,
    bio: user.bio ?? null,
    currentRole: user.currentRole ?? null,
    university: user.university ?? null,
    photos: user.photos ?? [],
    interests: user.interests ?? [],
    verified: user.verified ?? false,
    isPremium: user.isPremium ?? false,
    badges: user.badges,
  };

  const completeness = calculateCompleteness(user);

  return (
    <div className="pb-20">
      {/* Header */}
      <div className="px-5 py-3 flex items-center justify-between">
        <h1 className="text-lg font-bold text-tg-text">{t('profile.myProfile')}</h1>
        <button
          onClick={() => navigate('/settings')}
          className="text-tg-hint text-lg"
          aria-label={t('settings.title')}
        >
          ⚙️
        </button>
      </div>

      <div className="px-4 space-y-4">
        {/* Profile card preview */}
        <ProfileCard profile={ownProfile} isOwnProfile>
          <button
            onClick={() => navigate('/profile/edit')}
            className="btn-primary py-2.5 text-sm"
          >
            ✏️ {t('profile.edit')}
          </button>
        </ProfileCard>

        {/* Badges */}
        {user.badges && user.badges.length > 0 && (
          <BadgeRow badges={user.badges} />
        )}

        {/* Stats row */}
        <div className="grid grid-cols-2 gap-3">
          <div className="card p-3 text-center">
            <p className="text-2xl font-bold text-tg-text">{matchedIntros.length}</p>
            <p className="text-[10px] text-tg-hint">{t('matches.title')}</p>
          </div>
          <div className="card p-3 text-center">
            <p className="text-2xl font-bold text-tg-text">{completeness}%</p>
            <p className="text-[10px] text-tg-hint">{t('profile.completenessLabel')}</p>
          </div>
        </div>

        {/* Tips */}
        {completeness < 100 && (
          <div className="card p-4 space-y-2">
            {!user.bio && (
              <TipRow emoji="💡" text={t('profile.addBioTip')} />
            )}
            {(user.photos?.length ?? 0) < 3 && (
              <TipRow emoji="📸" text={t('profile.addPhotosTip')} />
            )}
            {!user.verified && (
              <TipRow emoji="✓" text={t('profile.verifyNow')} />
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function TipRow({ emoji, text }: { emoji: string; text: string }) {
  return (
    <div className="flex items-center gap-2 text-sm">
      <span>{emoji}</span>
      <span className="text-tg-text">{text}</span>
    </div>
  );
}

function calculateCompleteness(user: UserProfile): number {
  let score = 0;
  if (user.firstName) score += 10;
  if (user.photos?.length > 0) score += 25;
  if (user.bio) score += 15;
  if (user.currentRole) score += 15;
  if (user.interests?.length >= 5) score += 20;
  if (user.photos?.length >= 2) score += 15;
  return score;
}
