import { useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { useAppStore } from '@/store';
import { api } from '@/lib/api';
import { motion } from 'framer-motion';

export default function MatchesPage() {
  const { t } = useTranslation();
  const { matchedIntros, setMatchedIntros } = useAppStore();

  useEffect(() => {
    loadMatches();
  }, []);

  async function loadMatches() {
    const res = await api.intros.matched() as any;
    if (res.success && res.data) {
      setMatchedIntros(res.data);
    }
  }

  if (matchedIntros.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen pb-20 px-6 text-center">
        <span className="text-5xl mb-4">💫</span>
        <h2 className="text-xl font-bold text-tg-text mb-2">{t('matches.empty')}</h2>
        <p className="text-tg-hint">{t('matches.emptySubtitle')}</p>
      </div>
    );
  }

  return (
    <div className="pb-20">
      <div className="px-5 py-3">
        <h1 className="text-lg font-bold text-tg-text">{t('matches.title')}</h1>
        <p className="text-xs text-tg-hint">{matchedIntros.length} connections</p>
      </div>

      <div className="px-4 space-y-2">
        {matchedIntros.map((match: any, index: number) => (
          <motion.div
            key={match.id}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: index * 0.05 }}
            className="card p-4"
          >
            <div className="flex items-center gap-3">
              <div className="w-14 h-14 rounded-full bg-tg-secondary-bg overflow-hidden shrink-0">
                {match.otherUser?.photos?.[0] ? (
                  <img src={match.otherUser.photos[0].url} className="w-full h-full object-cover" alt="" />
                ) : (
                  <div className="w-full h-full flex items-center justify-center text-2xl">👤</div>
                )}
              </div>
              <div className="flex-1 min-w-0">
                <p className="font-semibold text-tg-text truncate">
                  {match.otherUser?.firstName}
                  {match.otherUser?.verified && <span className="text-blue-400 ml-1">✓</span>}
                </p>
                <p className="text-xs text-tg-hint truncate">{match.otherUser?.currentRole}</p>
              </div>
              {match.chatLink ? (
                <a
                  href={match.chatLink}
                  target="_blank"
                  rel="noopener"
                  className="btn-primary !w-auto px-4 py-2 text-sm shrink-0"
                >
                  💬 {t('matches.openChat')}
                </a>
              ) : (
                <span className="text-xs text-tg-hint">{t('matches.noUsername')}</span>
              )}
            </div>
          </motion.div>
        ))}
      </div>
    </div>
  );
}
