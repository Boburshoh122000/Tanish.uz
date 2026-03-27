import { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { useTranslation } from 'react-i18next';
import WebApp from '@twa-dev/sdk';
import { useAppStore } from '@/store';
import { api } from '@/lib/api';
import ProfileCard from '@/components/ProfileCard';
import { ReportReason, type PublicProfile } from '@tanish/shared';

const REPORT_REASONS: ReportReason[] = [
  ReportReason.FAKE_PROFILE,
  ReportReason.HARASSMENT,
  ReportReason.SPAM,
  ReportReason.INAPPROPRIATE_CONTENT,
  ReportReason.OTHER,
];

export default function ProfileViewPage() {
  const { id } = useParams<{ id: string }>();
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { user } = useAppStore();

  const [profile, setProfile] = useState<PublicProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [showReport, setShowReport] = useState(false);
  const [reportReason, setReportReason] = useState<ReportReason | null>(null);
  const [reportSubmitting, setReportSubmitting] = useState(false);

  const [blockSubmitting, setBlockSubmitting] = useState(false);

  useEffect(() => {
    WebApp.BackButton.show();
    WebApp.BackButton.onClick(() => navigate(-1));
    return () => {
      WebApp.BackButton.hide();
      WebApp.BackButton.offClick(() => navigate(-1));
    };
  }, [navigate]);

  useEffect(() => {
    if (!id) return;
    loadProfile(id);
  }, [id]);

  async function loadProfile(profileId: string) {
    setLoading(true);
    setError(null);
    const res = (await api.users.getPublic(profileId)) as {
      success: boolean;
      data?: PublicProfile;
      error?: string;
    };
    if (res.success && res.data) {
      setProfile(res.data);
    } else {
      setError(res.error ?? t('common.error'));
    }
    setLoading(false);
  }

  const handleReport = useCallback(async () => {
    if (!id || !reportReason) return;
    setReportSubmitting(true);
    await api.reports.create(id, reportReason);
    setReportSubmitting(false);
    setShowReport(false);
    setReportReason(null);
    WebApp.showPopup({
      title: t('safety.reportTitle'),
      message: t('safety.reportSubmitted'),
      buttons: [{ type: 'close' }],
    });
  }, [id, reportReason, t]);

  const handleBlock = useCallback(async () => {
    if (!id) return;
    WebApp.showConfirm(t('safety.blockConfirm'), async (confirmed) => {
      if (!confirmed) return;
      setBlockSubmitting(true);
      await api.blocks.create(id);
      setBlockSubmitting(false);
      WebApp.showPopup({
        message: t('safety.blocked'),
        buttons: [{ type: 'close' }],
      });
      navigate(-1);
    });
  }, [id, t, navigate]);

  // Derive shared interest IDs from the current user
  const myInterestIds =
    user?.interests?.map((ui: { interestId?: string; interest?: { id: string } }) =>
      ui.interestId ?? ui.interest?.id ?? '',
    ) ?? [];

  if (loading) {
    return <ProfileViewSkeleton />;
  }

  if (error || !profile) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen px-6 text-center">
        <span className="text-5xl mb-4">😕</span>
        <p className="text-tg-hint mb-4">{error ?? t('common.error')}</p>
        <button onClick={() => id && loadProfile(id)} className="btn-secondary py-2 px-6 w-auto">
          {t('common.retry')}
        </button>
      </div>
    );
  }

  return (
    <div className="pb-6">
      {/* Header with report/block */}
      <div className="sticky top-0 bg-tg-bg/95 backdrop-blur-sm z-30 px-5 py-3 flex items-center justify-between">
        <h1 className="text-lg font-bold text-tg-text">{t('profile.title')}</h1>
        <div className="flex items-center gap-3">
          <button
            onClick={() => setShowReport(true)}
            className="text-tg-hint text-lg"
            aria-label={t('safety.report')}
          >
            🚩
          </button>
          <button
            onClick={handleBlock}
            disabled={blockSubmitting}
            className="text-tg-destructive text-sm font-medium"
          >
            {t('safety.block')}
          </button>
        </div>
      </div>

      <div className="px-4">
        <ProfileCard
          profile={profile}
          sharedInterestIds={myInterestIds}
        />
      </div>

      {/* Report bottom sheet */}
      <AnimatePresence>
        {showReport && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setShowReport(false)}
              className="fixed inset-0 bg-black/50 z-40"
            />
            <motion.div
              initial={{ y: '100%' }}
              animate={{ y: 0 }}
              exit={{ y: '100%' }}
              transition={{ type: 'spring', damping: 25, stiffness: 300 }}
              className="fixed bottom-0 left-0 right-0 bg-tg-bg rounded-t-3xl z-50 max-h-[70vh] overflow-y-auto"
              style={{ paddingBottom: 'calc(var(--safe-area-bottom, 0px) + 20px)' }}
            >
              <div className="p-5 space-y-4">
                {/* Handle */}
                <div className="flex justify-center">
                  <div className="w-10 h-1 bg-tg-hint/30 rounded-full" />
                </div>

                <h3 className="text-lg font-bold text-tg-text">{t('safety.reportTitle')}</h3>

                <div className="space-y-2">
                  {REPORT_REASONS.map((reason) => (
                    <button
                      key={reason}
                      onClick={() => setReportReason(reason)}
                      className={`w-full text-left px-4 py-3 rounded-xl transition-all duration-200 ${
                        reportReason === reason
                          ? 'bg-tg-button text-tg-button-text'
                          : 'bg-tg-secondary-bg text-tg-text'
                      }`}
                    >
                      {t(`safety.reasons.${reason}`)}
                    </button>
                  ))}
                </div>

                <button
                  onClick={handleReport}
                  disabled={!reportReason || reportSubmitting}
                  className="btn-primary"
                >
                  {reportSubmitting ? (
                    <span className="inline-block w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  ) : (
                    t('safety.report')
                  )}
                </button>

                <button
                  onClick={() => setShowReport(false)}
                  className="w-full text-center text-tg-hint text-sm py-2"
                >
                  {t('common.cancel')}
                </button>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </div>
  );
}

/** Skeleton placeholder while the profile loads */
function ProfileViewSkeleton() {
  return (
    <div className="pb-6">
      <div className="px-5 py-3">
        <div className="h-5 w-24 bg-tg-secondary-bg rounded animate-pulse" />
      </div>
      <div className="px-4">
        <div className="card overflow-hidden">
          <div className="aspect-[4/5] bg-tg-secondary-bg animate-pulse" />
          <div className="p-4 space-y-3">
            <div className="h-4 w-48 bg-tg-secondary-bg rounded animate-pulse" />
            <div className="h-3 w-32 bg-tg-secondary-bg rounded animate-pulse" />
            <div className="flex gap-2">
              {Array.from({ length: 4 }).map((_, i) => (
                <div key={i} className="h-7 w-20 bg-tg-secondary-bg rounded-full animate-pulse" />
              ))}
            </div>
            <div className="h-12 bg-tg-secondary-bg rounded animate-pulse" />
          </div>
        </div>
      </div>
    </div>
  );
}
