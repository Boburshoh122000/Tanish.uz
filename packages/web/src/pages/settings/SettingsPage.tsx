import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import WebApp from '@twa-dev/sdk';
import { useAppStore } from '@/store';
import { api } from '@/lib/api';
import { changeLanguage } from '@/i18n';

const LANGUAGES = [
  { code: 'uz' as const, label: "O'zbekcha" },
  { code: 'ru' as const, label: 'Русский' },
  { code: 'en' as const, label: 'English' },
];

export default function SettingsPage() {
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  const { user, setUser } = useAppStore();
  const [paused, setPaused] = useState(user?.paused ?? false);

  useEffect(() => {
    const goBack = () => navigate(-1);
    WebApp.BackButton.show();
    WebApp.BackButton.onClick(goBack);
    return () => {
      WebApp.BackButton.hide();
      WebApp.BackButton.offClick(goBack);
    };
  }, [navigate]);

  const handleLanguageChange = async (lang: 'uz' | 'ru' | 'en') => {
    changeLanguage(lang);
    await api.users.update({ preferredLanguage: lang });
  };

  const handlePauseToggle = async () => {
    const next = !paused;
    setPaused(next);
    await api.users.update({ paused: next });
    if (user) setUser({ ...user, paused: next });
  };

  const handleDeleteAccount = () => {
    WebApp.showPopup(
      {
        title: t('settings.deleteConfirmTitle'),
        message: t('settings.deleteConfirmMessage'),
        buttons: [
          { id: 'cancel', type: 'cancel' },
          { id: 'delete', type: 'destructive', text: t('common.delete') },
        ],
      },
      async (btnId?: string) => {
        if (btnId === 'delete') {
          await api.users.deleteAccount();
          WebApp.close();
        }
      }
    );
  };

  return (
    <div className="pb-20">
      <div className="px-5 py-3">
        <h1 className="text-lg font-bold text-tg-text">{t('settings.title')}</h1>
      </div>

      <div className="px-4 space-y-3">
        {/* Notifications */}
        <div className="card p-4 space-y-3">
          <h3 className="text-sm font-semibold text-tg-section-header">
            {t('settings.notifications')}
          </h3>
          <ToggleRow
            label={t('settings.dailyMatches')}
            value={user?.notifyDailyBatch ?? true}
            onChange={async (v) => {
              await api.users.updateNotifications({ dailyBatch: v });
              if (user) setUser({ ...user, notifyDailyBatch: v });
            }}
          />
          <ToggleRow
            label={t('settings.introNotifs')}
            value={user?.notifyIntros ?? true}
            onChange={async (v) => {
              await api.users.updateNotifications({ intros: v });
              if (user) setUser({ ...user, notifyIntros: v });
            }}
          />
          <ToggleRow
            label={t('settings.matchNotifs')}
            value={user?.notifyMatches ?? true}
            onChange={async (v) => {
              await api.users.updateNotifications({ matches: v });
              if (user) setUser({ ...user, notifyMatches: v });
            }}
          />
          <ToggleRow
            label={t('settings.reEngagement')}
            value={user?.notifyReEngagement ?? true}
            onChange={async (v) => {
              await api.users.updateNotifications({ reEngagement: v });
              if (user) setUser({ ...user, notifyReEngagement: v });
            }}
          />
        </div>

        {/* Language */}
        <div className="card p-4 space-y-3">
          <h3 className="text-sm font-semibold text-tg-section-header">
            {t('settings.language')}
          </h3>
          <div className="flex gap-2">
            {LANGUAGES.map(({ code, label }) => (
              <button
                key={code}
                onClick={() => handleLanguageChange(code)}
                className={`flex-1 py-2 rounded-xl text-sm font-medium transition-colors ${
                  i18n.language === code
                    ? 'bg-tg-button text-tg-button-text'
                    : 'bg-tg-secondary-bg text-tg-text'
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        </div>

        {/* Account */}
        <div className="card p-4 space-y-1">
          <h3 className="text-sm font-semibold text-tg-section-header mb-2">
            {t('profile.account')}
          </h3>

          <button
            onClick={() => navigate('/settings/blocked')}
            className="w-full text-left text-sm text-tg-text py-2.5 flex justify-between items-center"
          >
            <span>{t('settings.blockedUsers')}</span>
            <ChevronRight />
          </button>

          <hr className="border-tg-secondary-bg" />

          <div className="py-1">
            <ToggleRow
              label={t('settings.pauseProfile')}
              value={paused}
              onChange={handlePauseToggle}
            />
            <p className="text-xs text-tg-hint mt-1">
              {t('settings.pauseDescription')}
            </p>
          </div>

          <hr className="border-tg-secondary-bg" />

          <button className="w-full text-left text-sm text-tg-text py-2.5 flex justify-between items-center">
            <span>{t('settings.premium')}</span>
            <span className={user?.isPremium ? 'text-yellow-500 text-xs' : 'text-tg-hint text-xs'}>
              {user?.isPremium ? t('premium.currentPlan') : t('premium.upgrade', { price: 150 })}
            </span>
          </button>

          <hr className="border-tg-secondary-bg" />

          <button
            onClick={handleDeleteAccount}
            className="w-full text-left text-sm text-tg-destructive py-2.5"
          >
            {t('settings.deleteAccount')}
          </button>
        </div>

        {/* About */}
        <div className="card p-4 space-y-1">
          <h3 className="text-sm font-semibold text-tg-section-header mb-2">
            {t('settings.about')}
          </h3>
          <button
            onClick={() => WebApp.openTelegramLink('https://t.me/tanish_support')}
            className="w-full text-left text-sm text-tg-text py-2.5 flex justify-between items-center"
          >
            <span>{t('settings.help')}</span>
            <ChevronRight />
          </button>
          <hr className="border-tg-secondary-bg" />
          <p className="text-xs text-tg-hint py-2 text-center">
            {t('settings.version', { version: '0.1.0' })}
          </p>
        </div>
      </div>
    </div>
  );
}

function ToggleRow({ label, value, onChange }: { label: string; value: boolean; onChange: (v: boolean) => void }) {
  return (
    <div className="flex justify-between items-center">
      <span className="text-sm text-tg-text">{label}</span>
      <button
        onClick={() => onChange(!value)}
        className={`w-11 h-6 rounded-full transition-colors duration-200 relative ${
          value ? 'bg-tg-button' : 'bg-tg-hint/30'
        }`}
      >
        <span
          className={`absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform duration-200 ${
            value ? 'translate-x-5' : 'translate-x-0'
          }`}
        />
      </button>
    </div>
  );
}

function ChevronRight() {
  return (
    <svg className="w-4 h-4 text-tg-hint" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="9 18 15 12 9 6" />
    </svg>
  );
}
