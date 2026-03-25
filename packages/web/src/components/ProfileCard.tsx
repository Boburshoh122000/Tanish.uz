interface ProfileCardProps {
  profile: any;
  onPass: () => void;
  onSayHi: () => void;
  showActions?: boolean;
}

export default function ProfileCard({ profile, onPass, onSayHi, showActions = true }: ProfileCardProps) {
  const primaryPhoto = profile.photos?.[0];
  const age = profile.age || calculateAge(profile.birthDate);
  const sharedInterests = profile.sharedInterests || profile.interests?.filter((i: any) => i.isShared) || [];
  const otherInterests = profile.interests?.filter((i: any) => !i.isShared)?.slice(0, 4) || [];

  return (
    <div className="card overflow-hidden">
      {/* Photo */}
      <div className="relative aspect-[16/9] bg-tg-secondary-bg">
        {primaryPhoto ? (
          <img
            src={primaryPhoto.url}
            alt={profile.firstName}
            className="w-full h-full object-cover"
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center text-4xl">
            {profile.gender === 'FEMALE' ? '👩' : '👨'}
          </div>
        )}

        {/* Photo overlay with name */}
        <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/60 to-transparent p-4">
          <div className="flex items-center gap-2">
            <h3 className="text-white text-xl font-bold">{profile.firstName}, {age}</h3>
            {profile.verified && <span className="text-blue-400 text-lg">✓</span>}
            {profile.isPremium && <span className="text-yellow-400 text-sm">⭐</span>}
          </div>
          {profile.currentRole && (
            <p className="text-white/80 text-sm truncate">{profile.currentRole}</p>
          )}
        </div>
      </div>

      {/* Content */}
      <div className="p-4 space-y-3">
        {/* Shared interests */}
        {sharedInterests.length > 0 && (
          <div className="space-y-1.5">
            <span className="text-xs text-tg-section-header font-semibold uppercase">Shared interests</span>
            <div className="flex flex-wrap gap-1.5">
              {sharedInterests.slice(0, 4).map((interest: any) => (
                <span key={interest.id} className="chip chip-shared text-xs">
                  {interest.icon} {interest.name}
                </span>
              ))}
            </div>
          </div>
        )}

        {/* Other interests */}
        {otherInterests.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {otherInterests.map((interest: any) => (
              <span key={interest.id} className="chip chip-unselected text-xs">
                {interest.icon} {interest.name}
              </span>
            ))}
          </div>
        )}

        {/* Bio preview */}
        {profile.bio && (
          <p className="text-sm text-tg-text line-clamp-2">{profile.bio}</p>
        )}

        {/* Compatibility */}
        {profile.compatibilityScore && (
          <p className="text-xs font-medium text-brand-600">
            {profile.compatibilityScore > 0.7 ? '🔥 Great match' : '👍 Good match'}
          </p>
        )}

        {/* Action buttons */}
        {showActions && (
          <div className="flex gap-3 pt-1">
            <button onClick={onPass} className="btn-secondary flex-1 py-2.5 text-sm">
              Pass
            </button>
            <button onClick={onSayHi} className="btn-primary flex-1 py-2.5 text-sm">
              👋 Say hi
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

function calculateAge(birthDate: string): number {
  return Math.floor((Date.now() - new Date(birthDate).getTime()) / (365.25 * 24 * 60 * 60 * 1000));
}
