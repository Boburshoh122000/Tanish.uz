import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useAppStore } from '../store';
import { api } from '../lib/api';
import ProfileCard from '../components/ProfileCard';
import IntroSheet from '../components/IntroSheet';

export default function Discovery() {
  const { dailyBatch, setDailyBatch, removeFromBatch, user } = useAppStore();
  const [loading, setLoading] = useState(true);
  const [introTarget, setIntroTarget] = useState<any>(null);
  const [allDone, setAllDone] = useState(false);

  useEffect(() => {
    loadBatch();
  }, []);

  async function loadBatch() {
    setLoading(true);
    const res = await api.discovery.getBatch() as any;
    if (res.success && res.data) {
      setDailyBatch(res.data.profiles);
      if (res.data.profiles.length === 0) setAllDone(true);
    }
    setLoading(false);
  }

  const handlePass = async (profileId: string) => {
    await api.discovery.action(profileId, false);
    removeFromBatch(profileId);
    if (dailyBatch.length <= 1) setAllDone(true);
  };

  const handleSayHi = (profile: any) => {
    setIntroTarget(profile);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen pb-20">
        <div className="flex flex-col items-center gap-4">
          <div className="w-12 h-12 border-4 border-tg-button border-t-transparent rounded-full animate-spin" />
          <p className="text-tg-hint">Loading your matches...</p>
        </div>
      </div>
    );
  }

  if (allDone || dailyBatch.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen pb-20 px-6 text-center">
        <span className="text-6xl mb-4">🌙</span>
        <h2 className="text-xl font-bold text-tg-text mb-2">Come back tomorrow!</h2>
        <p className="text-tg-hint mb-6">
          You've seen all your matches for today. New profiles will appear at 9:00 AM.
        </p>
        {!user?.isPremium && (
          <div className="card p-4 w-full">
            <p className="text-sm text-tg-text mb-3">
              ⭐ Want more matches? Upgrade to Premium for 8 daily profiles!
            </p>
            <button className="btn-primary text-sm py-2.5">
              Go Premium
            </button>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="pb-20">
      {/* Header */}
      <div className="sticky top-0 bg-tg-bg/95 backdrop-blur-sm z-10 px-5 py-3 flex items-center justify-between">
        <div>
          <h1 className="text-lg font-bold text-tg-text">Today's Matches</h1>
          <p className="text-xs text-tg-hint">{dailyBatch.length} profiles remaining</p>
        </div>
        <button onClick={loadBatch} className="text-tg-button text-sm font-medium">
          🔄
        </button>
      </div>

      {/* Profile cards */}
      <div className="px-4 space-y-4">
        <AnimatePresence>
          {dailyBatch.map((profile: any) => (
            <motion.div
              key={profile.id}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, x: -100 }}
              transition={{ duration: 0.3 }}
            >
              <ProfileCard
                profile={profile}
                onPass={() => handlePass(profile.id)}
                onSayHi={() => handleSayHi(profile)}
              />
            </motion.div>
          ))}
        </AnimatePresence>
      </div>

      {/* Intro bottom sheet */}
      {introTarget && (
        <IntroSheet
          profile={introTarget}
          onClose={() => setIntroTarget(null)}
          onSubmit={async (answer) => {
            await api.intros.create(introTarget.id, answer);
            removeFromBatch(introTarget.id);
            setIntroTarget(null);
            if (dailyBatch.length <= 1) setAllDone(true);
          }}
        />
      )}
    </div>
  );
}
