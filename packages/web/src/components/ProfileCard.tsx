import { useState, useCallback, type ReactNode } from 'react';
import { motion, AnimatePresence, type PanInfo } from 'framer-motion';
import { useTranslation } from 'react-i18next';
import type { PublicProfile, InterestWithCategory } from '@tanish/shared';

interface ProfileCardProps {
  profile: PublicProfile;
  isOwnProfile?: boolean;
  sharedInterestIds?: string[];
  children?: ReactNode;
}

const MAX_VISIBLE_INTERESTS = 8;
const SWIPE_THRESHOLD = 50;

export default function ProfileCard({
  profile,
  isOwnProfile = false,
  sharedInterestIds = [],
  children,
}: ProfileCardProps) {
  const { t } = useTranslation();
  const [photoIndex, setPhotoIndex] = useState(0);
  const photos = profile.photos ?? [];
  const hasMultiplePhotos = photos.length > 1;

  const sharedSet = new Set(sharedInterestIds);
  const shared = profile.interests?.filter((i) => sharedSet.has(i.id)) ?? [];
  const remaining = profile.interests?.filter((i) => !sharedSet.has(i.id)) ?? [];
  const visibleInterests = [...shared, ...remaining].slice(0, MAX_VISIBLE_INTERESTS);

  const overlappingLookingFor = isOwnProfile
    ? profile.lookingFor
    : profile.lookingFor ?? [];

  const goToPhoto = useCallback(
    (direction: number) => {
      setPhotoIndex((prev) => {
        const next = prev + direction;
        if (next < 0) return 0;
        if (next >= photos.length) return photos.length - 1;
        return next;
      });
    },
    [photos.length],
  );

  const handleDragEnd = useCallback(
    (_: MouseEvent | TouchEvent | PointerEvent, info: PanInfo) => {
      if (info.offset.x < -SWIPE_THRESHOLD) goToPhoto(1);
      else if (info.offset.x > SWIPE_THRESHOLD) goToPhoto(-1);
    },
    [goToPhoto],
  );

  return (
    <div className="card overflow-hidden">
      {/* Photo carousel — 4:5 aspect ratio */}
      <div className="relative aspect-[4/5] bg-tg-secondary-bg overflow-hidden">
        {photos.length > 0 ? (
          <AnimatePresence mode="popLayout" initial={false}>
            <motion.img
              key={photos[photoIndex].id}
              src={photos[photoIndex].url}
              alt={profile.firstName}
              className="absolute inset-0 w-full h-full object-cover"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.25 }}
              drag={hasMultiplePhotos ? 'x' : false}
              dragConstraints={{ left: 0, right: 0 }}
              dragElastic={0.15}
              onDragEnd={handleDragEnd}
            />
          </AnimatePresence>
        ) : (
          <div className="w-full h-full flex items-center justify-center text-5xl text-tg-hint">
            {profile.gender === 'FEMALE' ? '👩' : '👨'}
          </div>
        )}

        {/* Tap zones for photo navigation */}
        {hasMultiplePhotos && (
          <>
            <button
              type="button"
              aria-label={t('profile.prevPhoto')}
              onClick={() => goToPhoto(-1)}
              className="absolute inset-y-0 left-0 w-1/3 z-10"
            />
            <button
              type="button"
              aria-label={t('profile.nextPhoto')}
              onClick={() => goToPhoto(1)}
              className="absolute inset-y-0 right-0 w-1/3 z-10"
            />
          </>
        )}

        {/* Dots indicator */}
        {hasMultiplePhotos && (
          <div className="absolute top-3 left-0 right-0 flex justify-center gap-1.5 z-20">
            {photos.map((p, i) => (
              <button
                key={p.id}
                type="button"
                onClick={() => setPhotoIndex(i)}
                className={`h-1 rounded-full transition-all duration-200 ${
                  i === photoIndex
                    ? 'w-5 bg-white'
                    : 'w-1.5 bg-white/50'
                }`}
              />
            ))}
          </div>
        )}

        {/* Gradient overlay with name */}
        <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/70 via-black/30 to-transparent p-4 pt-16 z-10 pointer-events-none">
          <div className="flex items-center gap-2">
            <h3 className="text-white text-2xl font-bold">
              {profile.firstName}, {profile.age}
            </h3>
            {profile.verified && (
              <span className="text-blue-400 text-lg" title={t('profile.verified')}>
                ✓
              </span>
            )}
            {profile.isPremium && <span className="text-yellow-400 text-sm">⭐</span>}
          </div>
          {profile.currentRole && (
            <p className="text-white/80 text-sm truncate mt-0.5">
              {profile.currentRole}
            </p>
          )}
          <p className="text-white/60 text-xs mt-0.5 flex items-center gap-1">
            <span>📍</span> {profile.city}
          </p>
        </div>
      </div>

      {/* Content */}
      <div className="p-4 space-y-3">
        {/* Interests */}
        {visibleInterests.length > 0 && (
          <div className="space-y-1.5">
            {shared.length > 0 && !isOwnProfile && (
              <span className="text-xs text-tg-section-header font-semibold uppercase">
                {t('discovery.sharedInterests')}
              </span>
            )}
            <div className="flex flex-wrap gap-1.5">
              {visibleInterests.map((interest: InterestWithCategory) => (
                <span
                  key={interest.id}
                  className={`chip text-xs ${
                    sharedSet.has(interest.id) && !isOwnProfile
                      ? 'chip-shared'
                      : 'chip-unselected'
                  }`}
                >
                  {interest.icon && <span>{interest.icon}</span>}
                  {interest.name}
                </span>
              ))}
            </div>
          </div>
        )}

        {/* Bio — hide if empty, no placeholder text */}
        {profile.bio && (
          <p className="text-sm text-tg-text leading-relaxed">{profile.bio}</p>
        )}

        {/* Looking for pills — show only overlapping with viewer (or all for own profile) */}
        {overlappingLookingFor.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {overlappingLookingFor.map((lf) => (
              <span key={lf} className="chip chip-unselected text-xs">
                {lookingForEmoji(lf)} {t(`onboarding.step1.${lf.toLowerCase()}`)}
              </span>
            ))}
          </div>
        )}

        {/* Compatibility score */}
        {!isOwnProfile && profile.compatibilityScore != null && (
          <p className="text-xs font-medium text-brand-600">
            {profile.compatibilityScore > 0.7
              ? `🔥 ${t('discovery.greatMatch')}`
              : `👍 ${t('discovery.goodMatch')}`}
          </p>
        )}

        {/* Action slot (discovery buttons, edit button, etc.) */}
        {children}
      </div>
    </div>
  );
}

function lookingForEmoji(lf: string): string {
  switch (lf) {
    case 'NETWORKING':
      return '💼';
    case 'FRIENDSHIP':
      return '🤝';
    case 'RELATIONSHIP':
      return '💕';
    default:
      return '';
  }
}
