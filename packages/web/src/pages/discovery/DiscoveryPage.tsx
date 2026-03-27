import { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { motion, AnimatePresence } from 'framer-motion';
import { useAppStore } from '@/store';
import { api } from '@/lib/api';
import type { PublicProfile } from '@tanish/shared';
import ProfileCard from '@/components/ProfileCard';
import IntroSheet from '@/components/IntroSheet';

const PULL_THRESHOLD = 60;

function SkeletonCard() {
    return (
          <div className="card overflow-hidden animate-pulse">
                <div className="aspect-[4/5] bg-tg-secondary-bg" />
                <div className="p-4 space-y-3">
                        <div className="h-6 bg-tg-secondary-bg rounded w-2/3" />
                        <div className="h-4 bg-tg-secondary-bg rounded w-1/2" />
                        <div className="flex gap-1.5">
                                  <div className="h-6 bg-tg-secondary-bg rounded-full w-16" />
                                  <div className="h-6 bg-tg-secondary-bg rounded-full w-20" />
                                  <div className="h-6 bg-tg-secondary-bg rounded-full w-14" />
                        </div>div>
                </div>div>
          </div>div>
        );
}

export default function DiscoveryPage() {
    const { t } = useTranslation();
    const navigate = useNavigate();
    const { dailyBatch, batchTotal, setDailyBatch, removeFromBatch, user } = useAppStore();
  
    const [loading, setLoading] = useState(true);
    const [introTarget, setIntroTarget] = useState<PublicProfile | null>(null);
    const [allDone, setAllDone] = useState(false);
    const [noCandidates, setNoCandidates] = useState(false);
  
    // Pull-to-refresh state
    const [pullDistance, setPullDistance] = useState(0);
    const [refreshing, setRefreshing] = useState(false);
    const touchStartY = useRef(0);
    const scrollRef = useRef<HTMLDivElement>(null);
  
    useEffect(() => {
          loadBatch();
    }, []);
  
    async function loadBatch() {
          setLoading(true);
          setAllDone(false);
          setNoCandidates(false);
          const res = await api.discovery.getBatch();
          if (res.success && res.data) {
                  setDailyBatch(res.data.profiles, res.data.total);
                  if (res.data.profiles.length === 0) {
                            // If total is also 0, there are simply no candidates in the system
                            if (res.data.total === 0 || res.data.remaining === 0) {
                                        setNoCandidates(true);
                            }
                            setAllDone(true);
                  }
          }
          setLoading(false);
    }
  
    const handlePass = async (profileId: string) => {
          await api.discovery.action(profileId, false);
          removeFromBatch(profileId);
          if (dailyBatch.length <= 1) setAllDone(true);
    };
  
    const handleSayHi = (profile: PublicProfile) => {
          setIntroTarget(profile);
    };
  
    const handleIntroSuccess = (profileId: string) => {
          removeFromBatch(profileId);
          setIntroTarget(null);
          if (dailyBatch.length <= 1) setAllDone(true);
    };
  
    // Pull-to-refresh handlers
    const onTouchStart = useCallback((e: React.TouchEvent) => {
          if (scrollRef.current && scrollRef.current.scrollTop === 0) {
                  touchStartY.current = e.touches[0].clientY;
          }
    }, []);
  
    const onTouchMove = useCallback((e: React.TouchEvent) => {
          if (!touchStartY.current || refreshing) return;
          const delta = e.touches[0].clientY - touchStartY.current;
          if (delta > 0 && scrollRef.current && scrollRef.current.scrollTop === 0) {
                  setPullDistance(Math.min(delta * 0.5, 100));
          }
    }, [refreshing]);
  
    const onTouchEnd = useCallback(async () => {
          if (pullDistance >= PULL_THRESHOLD && !refreshing) {
                  setRefreshing(true);
                  await loadBatch();
                  setRefreshing(false);
          }
          setPullDistance(0);
          touchStartY.current = 0;
    }, [pullDistance, refreshing]);
  
    if (loading) {
          return (
                  <div className="pb-20 px-4 pt-16 space-y-4">
                          <SkeletonCard />
                          <SkeletonCard />
                          <SkeletonCard />
                  </div>div>
                );
    }
  
    // Empty state: distinguish "no candidates exist" from "you've seen all today's matches"
    if (allDone || dailyBatch.length === 0) {
          return (
                  <div className="flex flex-col items-center justify-center min-h-screen pb-20 px-6 text-center">
                    {noCandidates ? (
                              <>
                                          <span className="text-6xl mb-4">🔍</span>span>
                                          <h2 className="text-xl font-bold text-tg-text mb-2">{t('discovery.noMatches.title')}</h2>h2>
                                          <p className="text-tg-hint mb-6">{t('discovery.noMatches.subtitle')}</p>p>
                                          <button
                                                          onClick={() => navigate('/profile/edit')}
                                                          className="btn-primary text-sm py-2.5 px-6"
                                                        >
                                            {t('profile.edit')}
                                          </button>button>
                              </>>
                            ) : (
                              <>
                                          <span className="text-6xl mb-4">🌙</span>span>
                                          <h2 className="text-xl font-bold text-tg-text mb-2">{t('discovery.empty.title')}</h2>h2>
                                          <p className="text-tg-hint mb-6">{t('discovery.empty.subtitle')}</p>p>
                                {!user?.isPremium && (
                                              <div className="card p-4 w-full">
                                                              <p className="text-sm text-tg-text mb-3">{t('discovery.empty.premiumCta')}</p>p>
                                                              <button
                                                                                  onClick={() => navigate('/premium')}
                                                                                  className="btn-primary text-sm py-2.5"
                                                                                >
                                                                {t('common.premium')}
                                                              </button>button>
                                              </div>div>
                                          )}
                              </>>
                            )}
                  </div>div>
                );
    }
  
    return (
          <div
                  ref={scrollRef}
                  className="pb-20 overflow-y-auto"
                  onTouchStart={onTouchStart}
                  onTouchMove={onTouchMove}
                  onTouchEnd={onTouchEnd}
                >
            {/* Pull-to-refresh indicator */}
                <AnimatePresence>
                  {pullDistance > 0 && (
                            <motion.div
                                          initial={{ height: 0, opacity: 0 }}
                                          animate={{ height: pullDistance, opacity: pullDistance / PULL_THRESHOLD }}
                                          exit={{ height: 0, opacity: 0 }}
                                          className="flex items-center justify-center overflow-hidden"
                                        >
                                        <div
                                                        className={`w-6 h-6 border-2 border-tg-button border-t-transparent rounded-full ${
                                                                          pullDistance >= PULL_THRESHOLD ? 'animate-spin' : ''
                                                        }`}
                                                      />
                              {pullDistance >= PULL_THRESHOLD && (
                                                        <span className="ml-2 text-xs text-tg-hint">{t('discovery.pullToRefresh')}</span>span>
                                        )}
                            </motion.div>motion.div>
                          )}
                </AnimatePresence>AnimatePresence>
          
            {/* Header */}
                <div className="sticky top-0 bg-tg-bg/95 backdrop-blur-sm z-10 px-5 py-3 flex items-center justify-between">
                        <div>
                                  <h1 className="text-lg font-bold text-tg-text">{t('discovery.title')}</h1>h1>
                                  <p className="text-xs text-tg-hint">
                                    {t('discovery.remaining', { count: dailyBatch.length, total: batchTotal })}
                                  </p>p>
                        </div>div>
                </div>div>
          
            {/* Profile cards */}
                <div className="px-4 space-y-4">
                        <AnimatePresence>
                          {dailyBatch.map((profile) => (
                              <motion.div
                                              key={profile.id}
                                              initial={{ opacity: 0, y: 20 }}
                                              animate={{ opacity: 1, y: 0 }}
                                              exit={{ opacity: 0, y: 40 }}
                                              transition={{ duration: 0.3 }}
                                            >
                                            <ProfileCard
                                                              profile={profile}
                                                              sharedInterestIds={
                                                                                  profile.sharedInterests?.map((i) => i.id) ?? []
                                                              }
                                                            >
                                                            <div className="flex gap-3 pt-1">
                                                                              <button
                                                                                                    onClick={() => handlePass(profile.id)}
                                                                                                    className="btn-secondary flex-1 py-2.5 text-sm"
                                                                                                  >
                                                                                {t('discovery.pass')}
                                                                              </button>button>
                                                                              <button
                                                                                                    onClick={() => handleSayHi(profile)}
                                                                                                    className="btn-primary flex-1 py-2.5 text-sm"
                                                                                                  >
                                                                                                  👋 {t('discovery.sayHi')}
                                                                              </button>button>
                                                            </div>div>
                                            </ProfileCard>ProfileCard>
                              </motion.div>motion.div>
                            ))}
                        </AnimatePresence>AnimatePresence>
                </div>div>
          
            {/* Intro bottom sheet */}
            {introTarget && (
                          <IntroSheet
                                      isOpen={!!introTarget}
                                      onClose={() => setIntroTarget(null)}
                                      receiverId={introTarget.id}
                                      receiverName={introTarget.firstName}
                                      receiverPhoto={introTarget.photos[0]?.url}
                                      receiverRole={introTarget.currentRole}
                                      onSuccess={() => handleIntroSuccess(introTarget.id)}
                                    />
                        )}
          </div>div>
        );
}</></></div>
