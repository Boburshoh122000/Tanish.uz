import { useEffect, useState, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { motion, AnimatePresence } from 'framer-motion';
import WebApp from '@twa-dev/sdk';
import { useIntrosStore } from '@/store/intros';

type Tab = 'pending' | 'matched';

export default function IntrosPage() {
  const { t } = useTranslation();
  const [activeTab, setActiveTab] = useState<Tab>('pending');
  const {
    pendingIntros, matchedIntros,
    pendingLoading, matchedLoading,
    loadPending, loadMatched,
  } = useIntrosStore();

  useEffect(() => {
    loadPending();
    loadMatched();
  }, [loadPending, loadMatched]);

  const tabs: Array<{ key: Tab; label: string; count: number }> = [
    { key: 'pending', label: t('intros.pending'), count: pendingIntros.length },
    { key: 'matched', label: t('intros.matchedTab'), count: matchedIntros.length },
  ];

  return (
    <div className="pb-20">
      <div className="px-5 py-3">
        <h1 className="text-lg font-bold text-tg-text">{t('intros.title')}</h1>
      </div>

      {/* Segmented tabs */}
      <div className="px-4 mb-4">
        <div className="flex bg-tg-secondary-bg rounded-xl p-1">
          {tabs.map(({ key, label, count }) => (
            <button
              key={key}
              onClick={() => setActiveTab(key)}
              className={`flex-1 py-2 rounded-lg text-sm font-medium transition-colors ${
                activeTab === key
                  ? 'bg-tg-bg text-tg-text shadow-sm'
                  : 'text-tg-hint'
              }`}
            >
              {label}
              {count > 0 && (
                <span
                  className={`ml-1.5 inline-flex items-center justify-center min-w-[20px] h-5 px-1.5 rounded-full text-[10px] font-bold ${
                    activeTab === key
                      ? 'bg-tg-button text-tg-button-text'
                      : 'bg-tg-hint/20 text-tg-hint'
                  }`}
                >
                  {count}
                </span>
              )}
            </button>
          ))}
        </div>
      </div>

      {activeTab === 'pending' ? (
        <PendingTab loading={pendingLoading} />
      ) : (
        <MatchedTab loading={matchedLoading} />
      )}
    </div>
  );
}

/* ═══════════════ Pending Tab ═══════════════ */

function PendingTab({ loading }: { loading: boolean }) {
  const { t } = useTranslation();
  const { pendingIntros, respond, decline } = useIntrosStore();
  const [respondingId, setRespondingId] = useState<string | null>(null);

  const handleRespond = useCallback(async (introId: string, answer: string) => {
    setRespondingId(introId);
    const ok = await respond(introId, answer);
    if (!ok) setRespondingId(null);
    // On success the card will animate out via AnimatePresence
    setTimeout(() => setRespondingId(null), 600);
  }, [respond]);

  const handleDecline = useCallback(async (introId: string) => {
    await decline(introId);
  }, [decline]);

  if (loading && pendingIntros.length === 0) {
    return (
      <div className="flex items-center justify-center pt-20">
        <div className="w-8 h-8 border-2 border-tg-button border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (pendingIntros.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center px-6 pt-20 text-center">
        <div className="w-20 h-20 rounded-full bg-tg-secondary-bg flex items-center justify-center mb-4">
          <svg className="w-10 h-10 text-tg-hint" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
          </svg>
        </div>
        <h2 className="text-lg font-bold text-tg-text mb-1">{t('intros.noPending')}</h2>
        <p className="text-sm text-tg-hint">{t('intros.sendIntros')}</p>
      </div>
    );
  }

  return (
    <div className="px-4 space-y-4">
      <AnimatePresence mode="popLayout">
        {pendingIntros.map((intro) => (
          <PendingIntroCard
            key={intro.id}
            intro={intro}
            isResponding={respondingId === intro.id}
            onRespond={handleRespond}
            onDecline={handleDecline}
          />
        ))}
      </AnimatePresence>
    </div>
  );
}

function PendingIntroCard({
  intro,
  isResponding,
  onRespond,
  onDecline,
}: {
  intro: any;
  isResponding: boolean;
  onRespond: (id: string, answer: string) => void;
  onDecline: (id: string) => void;
}) {
  const { t } = useTranslation();
  const [answer, setAnswer] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const expiringSoon = hoursUntil(intro.expiresAt) <= 4;

  const handleSubmit = async () => {
    if (answer.length < 20 || submitting) return;
    setSubmitting(true);
    await onRespond(intro.id, answer);
    setSubmitting(false);
  };

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, x: -300, transition: { duration: 0.3 } }}
      className="card overflow-hidden"
    >
      {/* Success overlay */}
      <AnimatePresence>
        {isResponding && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="absolute inset-0 z-10 bg-tg-bg/90 flex flex-col items-center justify-center rounded-2xl"
          >
            <motion.div
              initial={{ scale: 0 }}
              animate={{ scale: 1 }}
              transition={{ type: 'spring', damping: 12 }}
              className="w-16 h-16 rounded-full bg-green-500 flex items-center justify-center mb-3"
            >
              <svg className="w-8 h-8 text-white" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="20 6 9 17 4 12" />
              </svg>
            </motion.div>
            <p className="text-sm font-semibold text-tg-text">{t('intros.connectSuccess')}</p>
          </motion.div>
        )}
      </AnimatePresence>

      <div className="p-4 space-y-4 relative">
        {/* Sender photo + info */}
        <div className="flex items-center gap-3">
          <div className="w-16 h-16 rounded-2xl bg-tg-secondary-bg overflow-hidden shrink-0">
            {intro.sender?.photos?.[0] ? (
              <img src={intro.sender.photos[0].url} className="w-full h-full object-cover" alt="" />
            ) : (
              <div className="w-full h-full flex items-center justify-center text-2xl text-tg-hint">
                <svg className="w-8 h-8" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                  <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
                  <circle cx="12" cy="7" r="4" />
                </svg>
              </div>
            )}
          </div>
          <div className="flex-1 min-w-0">
            <p className="font-semibold text-tg-text truncate">
              {intro.sender?.firstName}{intro.sender?.age ? `, ${intro.sender.age}` : ''}
              {intro.sender?.verified && <span className="text-blue-400 ml-1">✓</span>}
            </p>
            <p className="text-xs text-tg-hint truncate">{intro.sender?.currentRole}</p>
          </div>
          {expiringSoon ? (
            <span className="text-xs text-red-500 font-medium shrink-0">
              ⏰ {t('intros.expiresSoon')}
            </span>
          ) : (
            <span className="text-xs text-tg-hint shrink-0">{timeAgo(intro.createdAt)}</span>
          )}
        </div>

        {/* Icebreaker question — prominent */}
        <div className="bg-tg-secondary-bg rounded-2xl px-4 py-5 text-center">
          <p className="text-[10px] font-semibold text-tg-hint tracking-widest uppercase mb-2">
            {t('intros.question')}
          </p>
          <p className="text-base text-tg-text font-semibold leading-snug">{intro.question}</p>
        </div>

        {/* Sender's answer — chat bubble style */}
        <div className="flex gap-2">
          <div className="w-7 h-7 rounded-full bg-tg-secondary-bg overflow-hidden shrink-0 mt-0.5">
            {intro.sender?.photos?.[0] ? (
              <img src={intro.sender.photos[0].url} className="w-full h-full object-cover" alt="" />
            ) : (
              <div className="w-full h-full bg-tg-hint/20" />
            )}
          </div>
          <div className="bg-brand-50 rounded-2xl rounded-tl-md px-3.5 py-2.5 max-w-[85%]">
            <p className="text-xs text-brand-600 font-medium mb-0.5">{intro.sender?.firstName}</p>
            <p className="text-sm text-tg-text leading-relaxed">{intro.senderAnswer}</p>
          </div>
        </div>

        {/* Your answer input */}
        <div className="space-y-2">
          <textarea
            value={answer}
            onChange={(e) => setAnswer(e.target.value.slice(0, 500))}
            placeholder={t('intros.typeAnswer')}
            className="input-field min-h-[80px] resize-none text-sm"
            maxLength={500}
            rows={3}
          />
          <div className="flex justify-between items-center text-xs text-tg-hint px-1">
            <span>
              {answer.length < 20
                ? t('intros.minChars', { count: 20 - answer.length })
                : `${answer.length}/500`}
            </span>
          </div>
        </div>

        {/* Actions */}
        <button
          onClick={handleSubmit}
          disabled={answer.length < 20 || submitting}
          className="btn-primary flex items-center justify-center gap-2"
        >
          {submitting ? (
            <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
          ) : (
            <>💫 {t('intros.connect')}</>
          )}
        </button>

        <button
          onClick={() => onDecline(intro.id)}
          className="w-full text-center text-tg-hint text-xs py-1"
        >
          {t('intros.notInterested')}
        </button>
      </div>
    </motion.div>
  );
}

/* ═══════════════ Matched Tab ═══════════════ */

function MatchedTab({ loading }: { loading: boolean }) {
  const { t } = useTranslation();
  const { matchedIntros } = useIntrosStore();

  const openChat = useCallback((link: string) => {
    try {
      WebApp.openTelegramLink(link);
    } catch {
      window.open(link, '_blank');
    }
  }, []);

  if (loading && matchedIntros.length === 0) {
    return (
      <div className="flex items-center justify-center pt-20">
        <div className="w-8 h-8 border-2 border-tg-button border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (matchedIntros.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center px-6 pt-20 text-center">
        <div className="w-20 h-20 rounded-full bg-tg-secondary-bg flex items-center justify-center mb-4">
          <svg className="w-10 h-10 text-tg-hint" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z" />
          </svg>
        </div>
        <h2 className="text-lg font-bold text-tg-text mb-1">{t('intros.noMatches')}</h2>
        <p className="text-sm text-tg-hint">{t('intros.sendIntros')}</p>
      </div>
    );
  }

  const now = Date.now();

  return (
    <div className="px-4 space-y-2">
      {matchedIntros.map((match, index) => {
        const isNew = now - new Date(match.matchedAt).getTime() < 24 * 60 * 60 * 1000;

        return (
          <motion.div
            key={match.id}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: index * 0.04 }}
            className="card p-4"
          >
            <div className="flex items-center gap-3">
              <div className="w-14 h-14 rounded-full bg-tg-secondary-bg overflow-hidden shrink-0 relative">
                {match.otherUser?.photos?.[0] ? (
                  <img src={match.otherUser.photos[0].url} className="w-full h-full object-cover" alt="" />
                ) : (
                  <div className="w-full h-full flex items-center justify-center text-tg-hint">
                    <svg className="w-7 h-7" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                      <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
                      <circle cx="12" cy="7" r="4" />
                    </svg>
                  </div>
                )}
                {isNew && (
                  <span className="absolute -top-0.5 -right-0.5 w-3.5 h-3.5 bg-green-500 border-2 border-tg-bg rounded-full" />
                )}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-1.5">
                  <p className="font-semibold text-tg-text truncate">
                    {match.otherUser?.firstName}
                  </p>
                  {match.otherUser?.verified && <span className="text-blue-400 text-xs">✓</span>}
                  {isNew && (
                    <span className="text-[10px] font-bold text-green-600 bg-green-100 px-1.5 py-0.5 rounded-full">
                      NEW
                    </span>
                  )}
                </div>
                <p className="text-xs text-tg-hint truncate">{match.otherUser?.currentRole}</p>
              </div>
              {match.chatLink ? (
                <button
                  onClick={() => openChat(match.chatLink!)}
                  className="btn-primary !w-auto px-4 py-2 text-sm shrink-0"
                >
                  💬 {t('intros.openChat')}
                </button>
              ) : (
                <span className="text-xs text-tg-hint shrink-0">{t('intros.expired')}</span>
              )}
            </div>
          </motion.div>
        );
      })}
    </div>
  );
}

/* ═══════════════ Helpers ═══════════════ */

function timeAgo(date: string): string {
  const diff = Date.now() - new Date(date).getTime();
  const hours = Math.floor(diff / (1000 * 60 * 60));
  if (hours < 1) return 'Just now';
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

function hoursUntil(date: string): number {
  const diff = new Date(date).getTime() - Date.now();
  return Math.max(0, Math.floor(diff / (1000 * 60 * 60)));
}
