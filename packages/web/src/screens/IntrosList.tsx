import { useEffect } from 'react';
import { useAppStore } from '../store';
import { api } from '../lib/api';
import { motion } from 'framer-motion';

export default function IntrosList() {
  const { pendingIntros, setPendingIntros } = useAppStore();

  useEffect(() => {
    loadIntros();
  }, []);

  async function loadIntros() {
    const res = await api.intros.pending() as any;
    if (res.success && res.data) {
      setPendingIntros(res.data);
    }
  }

  const handleRespond = async (introId: string, answer: string) => {
    const res = await api.intros.respond(introId, { answer }) as any;
    if (res.success) {
      setPendingIntros(pendingIntros.filter((i: any) => i.id !== introId));
    }
  };

  const handleDecline = async (introId: string) => {
    await api.intros.respond(introId, { decline: true });
    setPendingIntros(pendingIntros.filter((i: any) => i.id !== introId));
  };

  if (pendingIntros.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen pb-20 px-6 text-center">
        <span className="text-5xl mb-4">💬</span>
        <h2 className="text-xl font-bold text-tg-text mb-2">No pending intros</h2>
        <p className="text-tg-hint">When someone sends you an intro, it'll appear here.</p>
      </div>
    );
  }

  return (
    <div className="pb-20">
      <div className="px-5 py-3">
        <h1 className="text-lg font-bold text-tg-text">Intros</h1>
        <p className="text-xs text-tg-hint">{pendingIntros.length} pending</p>
      </div>

      <div className="px-4 space-y-4">
        {pendingIntros.map((intro: any) => (
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
              <p className="text-xs text-tg-hint">
                {timeAgo(intro.createdAt)}
              </p>
            </div>

            {/* Question */}
            <div className="bg-tg-secondary-bg rounded-xl p-3 text-center">
              <p className="text-xs text-tg-hint mb-1">QUESTION</p>
              <p className="text-sm text-tg-text font-medium">{intro.question}</p>
            </div>

            {/* Their answer */}
            <div className="bg-brand-50 rounded-xl p-3">
              <p className="text-xs text-brand-600 mb-1">Their answer</p>
              <p className="text-sm text-tg-text">{intro.senderAnswer}</p>
            </div>

            {/* Your answer */}
            <IntroResponse
              onAnswer={(answer) => handleRespond(intro.id, answer)}
              onDecline={() => handleDecline(intro.id)}
            />

            {/* Expiry */}
            <p className="text-xs text-tg-hint text-center">
              ⏰ Expires {timeUntil(intro.expiresAt)}
            </p>
          </motion.div>
        ))}
      </div>
    </div>
  );
}

function IntroResponse({ onAnswer, onDecline }: { onAnswer: (answer: string) => void; onDecline: () => void }) {
  const [answer, setAnswer] = useState('');
  const [expanded, setExpanded] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  if (!expanded) {
    return (
      <div className="flex gap-2">
        <button onClick={() => setExpanded(true)} className="btn-primary flex-1 py-2.5 text-sm">
          ✍️ Answer
        </button>
        <button onClick={onDecline} className="text-tg-hint text-sm px-3 py-2.5">
          Not interested
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <textarea
        value={answer}
        onChange={(e) => setAnswer(e.target.value.slice(0, 500))}
        placeholder="Write your answer (min 20 characters)..."
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
          {submitting ? '...' : '💫 Connect'}
        </button>
        <button onClick={() => setExpanded(false)} className="text-tg-hint text-sm px-3">
          Cancel
        </button>
      </div>
    </div>
  );
}

import { useState } from 'react';

function timeAgo(date: string): string {
  const diff = Date.now() - new Date(date).getTime();
  const hours = Math.floor(diff / (1000 * 60 * 60));
  if (hours < 1) return 'Just now';
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

function timeUntil(date: string): string {
  const diff = new Date(date).getTime() - Date.now();
  const hours = Math.floor(diff / (1000 * 60 * 60));
  if (hours < 1) return 'soon';
  return `in ${hours}h`;
}
