import { useState, useEffect, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { motion } from 'framer-motion';
import WebApp from '@twa-dev/sdk';
import { api } from '@/lib/api';

interface ReferralLink {
  code: string;
  link: string;
}

interface ReferralStats {
  totalReferred: number;
  completedSignups: number;
  bonusMatchesEarned: number;
}

export default function ReferralsPage() {
  const { t } = useTranslation();
  const [link, setLink] = useState<ReferralLink | null>(null);
  const [stats, setStats] = useState<ReferralStats | null>(null);
  const [copied, setCopied] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadData();
  }, []);

  async function loadData() {
    const [linkRes, statsRes] = await Promise.all([
      api.referrals.getLink() as Promise<{ success: boolean; data?: ReferralLink }>,
      api.referrals.getStats() as Promise<{ success: boolean; data?: ReferralStats }>,
    ]);
    if (linkRes.success && linkRes.data) setLink(linkRes.data);
    if (statsRes.success && statsRes.data) setStats(statsRes.data);
    setLoading(false);
  }

  const handleCopy = useCallback(async () => {
    if (!link) return;
    try {
      await navigator.clipboard.writeText(link.link);
      setCopied(true);
      WebApp.HapticFeedback.notificationOccurred('success');
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Fallback for browsers without clipboard API
      WebApp.showPopup({ message: link.link, buttons: [{ type: 'close' }] });
    }
  }, [link]);

  const handleShare = useCallback(() => {
    if (!link) return;
    const message = t('referral.shareMessage', {
      defaultValue: 'Join me on Tanish — meet interesting people in your city! {{link}}',
      link: link.link,
    });
    // Open Telegram share dialog
    WebApp.openTelegramLink(
      `https://t.me/share/url?url=${encodeURIComponent(link.link)}&text=${encodeURIComponent(message)}`,
    );
  }, [link, t]);

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen pb-20">
        <div className="w-10 h-10 border-4 border-tg-button border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="pb-20">
      {/* Header */}
      <div className="px-5 py-3">
        <h1 className="text-lg font-bold text-tg-text">{t('referral.title')}</h1>
      </div>

      <div className="px-4 space-y-4">
        {/* Hero card */}
        <div className="card p-5 text-center space-y-3">
          <span className="text-5xl">🎁</span>
          <p className="text-sm text-tg-text leading-relaxed">
            {t('referral.subtitle')}
          </p>

          {/* Bonus callout */}
          <div className="bg-brand-50 rounded-xl px-4 py-2.5">
            <p className="text-sm font-medium text-brand-700">
              {t('referral.bonusInfo', {
                defaultValue: 'Both you and your friend get +1 extra match!',
              })}
            </p>
          </div>
        </div>

        {/* Link section */}
        {link && (
          <div className="card p-4 space-y-3">
            {/* Link display */}
            <div className="bg-tg-secondary-bg rounded-xl px-4 py-3 text-center">
              <p className="text-xs text-tg-hint mb-1">{t('referral.yourLink', { defaultValue: 'Your referral link' })}</p>
              <p className="text-sm text-tg-text font-mono break-all">{link.link}</p>
            </div>

            {/* Action buttons */}
            <div className="flex gap-3">
              <button onClick={handleCopy} className="btn-secondary flex-1 py-2.5 text-sm">
                {copied ? `✓ ${t('referral.copied')}` : `📋 ${t('referral.copyLink')}`}
              </button>
              <button onClick={handleShare} className="btn-primary flex-1 py-2.5 text-sm">
                📤 {t('referral.share', { defaultValue: 'Share' })}
              </button>
            </div>
          </div>
        )}

        {/* Stats */}
        {stats && (
          <div className="card p-4 space-y-3">
            <h3 className="text-sm font-semibold text-tg-section-header">{t('referral.stats')}</h3>
            <div className="grid grid-cols-3 gap-3">
              <StatBox
                value={stats.totalReferred}
                label={t('referral.totalReferred')}
              />
              <StatBox
                value={stats.completedSignups}
                label={t('referral.completed')}
              />
              <StatBox
                value={stats.bonusMatchesEarned}
                label={t('referral.bonusMatches')}
              />
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function StatBox({ value, label }: { value: number; label: string }) {
  return (
    <motion.div
      initial={{ scale: 0.9, opacity: 0 }}
      animate={{ scale: 1, opacity: 1 }}
      className="text-center"
    >
      <p className="text-2xl font-bold text-tg-text">{value}</p>
      <p className="text-[10px] text-tg-hint leading-tight mt-0.5">{label}</p>
    </motion.div>
  );
}
