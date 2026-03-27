import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { motion } from 'framer-motion';
import { useAppStore } from '@/store';
import { api } from '@/lib/api';

type Tab = 'pending' | 'matched';

export default function IntrosPage() {
  const { t } = useTranslation();
  const [activeTab, setActiveTab] = useState<Tab>('pending');
  const { pendingIntros, matchedIntros, setPendingIntros, setMatchedIntros } = useAppStore();

  useEffect(() => {
    loadData();
  }, []);

  async function loadData() {
    const results = await Promise.all([
      api.intros.pending(),
      api.intros.matched(),
    ]);
    const pending = results[0] as { success: boolean; data?: any[] };
    const matched = results[1] as { success: boolean; data?: any[] };
    if (pending.success && pending.data) setPendingIntros(pending.data);
    if (matched.success && matched.data) setMatchedIntros(matched.data);
  }

  const handleRespond = async (introId: string, answer: string) => {
    const res = (await api.intros.respond(introId, { answer })) as { success: boolean };
    if (res.success) {
      setPendingIntros(pendingIntros.filter((i: any) => i.id !== introId));
    }
  };

  const handleDecline = async (introId: string) => {
    await api.intros.respond(introId, { decline: true });
    setPendingIntros(pendingIntros.filter((i: any) => i.id !== introId));
  };

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
        <PendingTab
          intros={pendingIntros}
          onRespond={handleRespond}
          onDecline={handleDecline}
        />
      ) : (
        <MatchedTab matches={matchedIntros} />
      )}
    </div>
  );
}

/* ---------- Pending Tab ---------- */

function PendingTab({
  intros,
  onRespond,
  onDecline,
}: {
  intros: any[];
  onRespond: (id: string, answer: string) => Promise<void>;
  onDecline: (id: string) => Promise<void>;
}) {
  const { t } = useTranslation();

  if (intros.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center px-6 pt-20 text-center">
        <span className="text-5xl mb-4">💬</span>
        <h2 className="text-lg font-bold text-tg-text mb-1">{t('intros.empty')}</h2>
        <p className="text-sm text-tg-hint">{t('intros.emptySubtitle')}</p>
      </div>
    );
  }

  return (
    <div className="px-4 space-y-4">
      {intros.map((intro: any) => (
        <motion.div
          key={intro.id}
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          className="card p-4 space-y-3"
        >
          {/* Sender info */}
          <div className="flex items-center gap-3">
            <div className="w-14 h-14 rounded-full bg-tg-secondary-bg overflow-hidden">
              {intro.sender?.photos?.[0] ? (
                <img src={intro.sender.photos[0].url} className="w-full h-full object-cover" alt="" />
              ) : (
                <div className="w-full h-full flex items-center justify-center text-2xl">👤</div>
              )}
            </div>
            <div className="flex-1">
              <p className="font-semibold text-tg-text">
                {intro.sender?.firstName}
                {intro.sender?.verified && <span className="text-blue-400 ml-1">✓</span>}
              </p>
              <p className="text-xs text-tg-hint">{intro.sender?.currentRole}</p>
            </div>
            <p className="text-xs text-tg-hint">{timeAgo(intro.createdAt)}</p>
          </div>

          {/* Question */}
          <div className="bg-tg-secondary-bg rounded-xl p-3 text-center">
            <p className="text-xs text-tg-hint mb-1">{t('intros.question').toUpperCase()}</p>
            <p className="text-sm text-tg-text font-medium">{intro.question}</p>
          </div>

          {/* Their answer */}
          <div className="bg-brand-50 rounded-xl p-3">
            <p className="text-xs text-brand-600 mb-1">{t('intros.theirAnswer')}</p>
            <p className="text-sm text-tg-text">{intro.senderAnswer}</p>
          </div>

          {/* Response actions */}
          <IntroResponse
            onAnswer={(answer) => onRespond(intro.id, answer)}
            onDecline={() => onDecline(intro.id)}
          />

          {/* Expiry */}
          <p className="text-xs text-tg-hint text-center">
            ⏰ {t('intros.expiresIn', { hours: hoursUntil(intro.expiresAt) })}
          </p>
        </motion.div>
      ))}
    </div>
  );
}

function IntroResponse({
  onAnswer,
  onDecline,
}: {
  onAnswer: (answer: string) => Promise<void>;
  onDecline: () => Promise<void>;
}) {
  const { t } = useTranslation();
  const [answer, setAnswer] = useState('');
  const [expanded, setExpanded] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  if (!expanded) {
    return (
      <div className="flex gap-2">
        <button onClick={() => setExpanded(true)} className="btn-primary flex-1 py-2.5 text-sm">
          ✍️ {t('intros.yourAnswer')}
        </button>
        <button onClick={onDecline} className="text-tg-hint text-sm px-3 py-2.5">
          {t('intros.notInterested')}
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <textarea
        value={answer}
        onChange={(e) => setAnswer(e.target.value.slice(0, 500))}
        placeholder={t('intros.answerPlaceholder')}
        className="input-field min-h-[80px] resize-none text-sm"
        maxLength={500}
        rows={3}
        autoFocus
      />
      <div className="flex gap-2">
        <button
          onClick={async () => {
            if (answer.length < 20) return;
            setSubmitting(true);
            await onAnswer(answer);
            setSubmitting(false);
          }}
          disabled={answer.length < 20 || submitting}
          className="btn-primary flex-1 py-2.5 text-sm"
        >
          {submitting ? '...' : `💫 ${t('intros.connect')}`}
        </button>
        <button onClick={() => setExpanded(false)} className="text-tg-hint text-sm px-3">
          {t('common.cancel')}
        </button>
      </div>
    </div>
  );
}

/* ---------- Matched Tab ---------- */

function MatchedTab({ matches }: { matches: any[] }) {
  const { t } = useTranslation();

  if (matches.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center px-6 pt-20 text-center">
        <span className="text-5xl mb-4">💫</span>
        <h2 className="text-lg font-bold text-tg-text mb-1">{t('intros.matchedEmpty')}</h2>
        <p className="text-sm text-tg-hint">{t('intros.matchedEmptySubtitle')}</p>
      </div>
    );
  }

  return (
    <div className="px-4 space-y-2">
      {matches.map((match: any, index: number) => (
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
                💬 {t('intros.openChat')}
              </a>
            ) : (
              <span className="text-xs text-tg-hint">{t('intros.expired')}</span>
            )}
          </div>
        </motion.div>
      ))}
    </div>
  );
}

/* ---------- Helpers ---------- */

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
