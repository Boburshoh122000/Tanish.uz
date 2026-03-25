import { useAppStore } from '../store';
import { api } from '../lib/api';

export default function Profile() {
  const { user, setUser } = useAppStore();

  if (!user) {
    return (
      <div className="flex items-center justify-center min-h-screen pb-20">
        <p className="text-tg-hint">Loading profile...</p>
      </div>
    );
  }

  const age = Math.floor(
    (Date.now() - new Date(user.birthDate).getTime()) / (365.25 * 24 * 60 * 60 * 1000)
  );

  return (
    <div className="pb-20">
      {/* Header */}
      <div className="px-5 py-3 flex items-center justify-between">
        <h1 className="text-lg font-bold text-tg-text">My Profile</h1>
        <a href="/settings" className="text-tg-button text-sm font-medium">⚙️</a>
      </div>

      {/* Profile preview */}
      <div className="px-4 space-y-4">
        {/* Photo */}
        <div className="aspect-[4/5] rounded-2xl bg-tg-secondary-bg overflow-hidden max-w-sm mx-auto">
          {user.photos?.[0] ? (
            <img src={user.photos[0].url} className="w-full h-full object-cover" alt="" />
          ) : (
            <div className="w-full h-full flex flex-col items-center justify-center text-tg-hint gap-2">
              <span className="text-5xl">📷</span>
              <span className="text-sm">Add a photo</span>
            </div>
          )}
        </div>

        {/* Info */}
        <div className="card p-4 space-y-4">
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-2xl font-bold text-tg-text">
                {user.firstName}{user.lastName ? ` ${user.lastName}` : ''}, {age}
              </h2>
              {user.verified && <span className="text-blue-400 text-lg">✓</span>}
            </div>
            {user.currentRole && (
              <p className="text-tg-hint mt-0.5">{user.currentRole}</p>
            )}
            <p className="text-xs text-tg-hint mt-0.5">📍 {user.city}</p>
          </div>

          {/* Bio */}
          {user.bio && (
            <div>
              <h3 className="text-sm font-semibold text-tg-section-header mb-1">About</h3>
              <p className="text-sm text-tg-text">{user.bio}</p>
            </div>
          )}

          {/* Interests */}
          {user.interests?.length > 0 && (
            <div>
              <h3 className="text-sm font-semibold text-tg-section-header mb-2">Interests</h3>
              <div className="flex flex-wrap gap-1.5">
                {user.interests.map((ui: any) => (
                  <span key={ui.interestId || ui.interest?.id} className="chip chip-unselected text-xs">
                    {ui.interest?.icon} {ui.interest?.name}
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* Looking for */}
          {user.lookingFor?.length > 0 && (
            <div>
              <h3 className="text-sm font-semibold text-tg-section-header mb-2">Looking for</h3>
              <div className="flex flex-wrap gap-1.5">
                {user.lookingFor.map((lf: string) => (
                  <span key={lf} className="chip chip-unselected text-xs">
                    {lf === 'NETWORKING' ? '💼' : lf === 'FRIENDSHIP' ? '🤝' : '💕'}{' '}
                    {lf.charAt(0) + lf.slice(1).toLowerCase()}
                  </span>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Profile completeness */}
        <div className="card p-4">
          <h3 className="text-sm font-semibold text-tg-section-header mb-2">Profile Strength</h3>
          <div className="w-full h-2 bg-tg-secondary-bg rounded-full overflow-hidden">
            <div
              className="h-full bg-gradient-to-r from-brand-400 to-brand-600 rounded-full transition-all duration-500"
              style={{ width: `${calculateCompleteness(user)}%` }}
            />
          </div>
          <p className="text-xs text-tg-hint mt-1">{calculateCompleteness(user)}% complete</p>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-3 gap-3">
          <div className="card p-3 text-center">
            <p className="text-xl font-bold text-tg-text">{Math.round(user.eloScore)}</p>
            <p className="text-[10px] text-tg-hint">Score</p>
          </div>
          <div className="card p-3 text-center">
            <p className="text-xl font-bold text-tg-text">{user.isPremium ? '⭐' : '—'}</p>
            <p className="text-[10px] text-tg-hint">Premium</p>
          </div>
          <div className="card p-3 text-center">
            <p className="text-xl font-bold text-tg-text">{user.verified ? '✓' : '—'}</p>
            <p className="text-[10px] text-tg-hint">Verified</p>
          </div>
        </div>
      </div>
    </div>
  );
}

function calculateCompleteness(user: any): number {
  let score = 0;
  if (user.firstName) score += 10;
  if (user.photos?.length > 0) score += 25;
  if (user.bio) score += 15;
  if (user.currentRole) score += 15;
  if (user.interests?.length >= 5) score += 20;
  if (user.photos?.length >= 2) score += 15;
  return score;
}
