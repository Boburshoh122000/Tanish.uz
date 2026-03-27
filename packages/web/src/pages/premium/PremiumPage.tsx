import { useState, useEffect, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import WebApp from '@twa-dev/sdk';
import { useAppStore } from '@/store';
import { api } from '@/lib/api';
import {
  LIMITS,
  PREMIUM_PRICE_STARS,
  PREMIUM_PROMO_PRICE_STARS,
} from '@tanish/shared';

interface PremiumStatus {
  isPremium: boolean;
  premiumUntil: string | null;
  daysRemaining: number;
}

const FEATURES = [
  { key: 'matches', free: LIMITS.FREE_DAILY_MATCHES, premium: LIMITS.PREMIUM_DAILY_MATCHES },
  { key: 'intros', free: LIMITS.FREE_DAILY_INTROS, premium: LIMITS.PREMIUM_DAILY_INTROS },
  { key: 'whoLikes', free: false, premium: true },
  { key: 'boost', free: false, premium: true },
  { key: 'priority', free: false, premium: true },
  { key: 'badge', free: false, premium: true },
] as const;

export default function PremiumPage() {
  const { t } = useTranslation();
  const { user, setUser } = useAppStore();
  const [status, setStatus] = useState<PremiumStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [purchasing, setPurchasing] = useState(false);

  useEffect(() => {
    loadStatus();
  }, []);

  async function loadStatus() {
    const res = await api.premium.status();
    if (res.success && res.data) {
      setStatus(res.data);
    }
    setLoading(false);
  }

  const handleUpgrade = useCallback(async (promo: boolean) => {
    setPurchasing(true);
    const res = await api.premium.createInvoice(promo);
    if (res.success && res.data) {
      WebApp.openInvoice(res.data.invoiceUrl, (invoiceStatus) => {
        if (invoiceStatus === 'paid') {
          WebApp.HapticFeedback.notificationOccurred('success');
          // Refresh status + user
          loadStatus();
          api.users.me().then((userRes) => {
            if (userRes.success && userRes.data) {
              setUser(userRes.data as Parameters<typeof setUser>[0]);
            }
          });
        }
        setPurchasing(false);
      });
    } else {
      setPurchasing(false);
    }
  }, [setUser]);

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen pb-20">
        <div className="w-10 h-10 border-4 border-tg-button border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  const isPremium = status?.isPremium ?? user?.isPremium ?? false;

  return (
    <div className="pb-20 px-4 pt-4 space-y-5">
      {/* Header */}
      <div className="text-center space-y-2">
        <span className="text-5xl">⭐</span>
        <h1 className="text-2xl font-bold text-tg-text">{t('premium.title')}</h1>
      </div>

      {/* Active status */}
      {isPremium && status && (
        <div className="card p-4 border-2 border-yellow-400/50 bg-yellow-400/5">
          <div className="flex items-center gap-3">
            <span className="text-3xl">✓</span>
            <div>
              <p className="font-bold text-tg-text">{t('premium.currentPlan')}</p>
              <p className="text-sm text-tg-hint">
                {t('premium.daysLeft', { days: status.daysRemaining })}
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Comparison table */}
      <div className="card overflow-hidden">
        <div className="grid grid-cols-3 text-center text-xs font-semibold border-b border-tg-secondary-bg">
          <div className="p-3 text-tg-hint" />
          <div className="p-3 text-tg-hint">{t('premium.free')}</div>
          <div className="p-3 text-yellow-500">{t('premium.premiumLabel')}</div>
        </div>
        {FEATURES.map(({ key, free, premium }) => (
          <div
            key={key}
            className="grid grid-cols-3 text-center text-sm border-b border-tg-secondary-bg last:border-0"
          >
            <div className="p-3 text-left text-tg-text">
              {t(`premium.features.${key}`, {
                count: typeof premium === 'number' ? premium : undefined,
              })}
            </div>
            <div className="p-3 text-tg-hint">
              {typeof free === 'number' ? free : free ? '✓' : '—'}
            </div>
            <div className="p-3 text-tg-text font-medium">
              {typeof premium === 'number' ? premium : premium ? '✓' : '—'}
            </div>
          </div>
        ))}
      </div>

      {/* CTA */}
      {!isPremium && (
        <div className="space-y-3">
          {/* Promo badge */}
          <div className="card p-4 bg-gradient-to-r from-yellow-400/10 to-orange-400/10 border border-yellow-400/20">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs font-semibold text-yellow-600 uppercase">
                  {t('premium.promo.badge')}
                </p>
                <p className="text-sm text-tg-text mt-1">
                  {t('premium.promo.firstMonth')}
                </p>
              </div>
              <button
                onClick={() => handleUpgrade(true)}
                disabled={purchasing}
                className="btn-primary text-sm py-2 px-4 whitespace-nowrap"
              >
                {purchasing ? '...' : `⭐ ${PREMIUM_PROMO_PRICE_STARS}`}
              </button>
            </div>
          </div>

          {/* Regular CTA */}
          <button
            onClick={() => handleUpgrade(false)}
            disabled={purchasing}
            className="btn-primary w-full py-3.5 text-base font-semibold flex items-center justify-center gap-2"
          >
            {purchasing ? (
              <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
            ) : (
              t('premium.upgrade', { price: PREMIUM_PRICE_STARS })
            )}
          </button>
        </div>
      )}
    </div>
  );
}
