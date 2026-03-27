import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import WebApp from '@twa-dev/sdk';
import { api } from '@/lib/api';

interface Verification {
  id: string;
  selfieUrl: string;
  createdAt: string;
  user: {
    id: string;
    firstName: string;
    photos: Array<{ url: string }>;
  };
}

interface PageData {
  items: Verification[];
  hasMore: boolean;
  page: number;
}

export default function VerificationQueue() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [items, setItems] = useState<Verification[]>([]);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(true);
  const [rejectingId, setRejectingId] = useState<string | null>(null);
  const [rejectionReason, setRejectionReason] = useState('');
  const [processing, setProcessing] = useState<string | null>(null);

  useEffect(() => {
    const goBack = () => navigate(-1);
    WebApp.BackButton.show();
    WebApp.BackButton.onClick(goBack);
    return () => {
      WebApp.BackButton.hide();
      WebApp.BackButton.offClick(goBack);
    };
  }, [navigate]);

  useEffect(() => {
    loadPage(1);
  }, []);

  async function loadPage(p: number) {
    setLoading(true);
    const res = (await api.admin.getPendingVerifications(p)) as {
      success: boolean;
      data?: PageData;
    };
    if (res.success && res.data) {
      setItems(p === 1 ? res.data.items : [...items, ...res.data.items]);
      setHasMore(res.data.hasMore);
      setPage(res.data.page);
    }
    setLoading(false);
  }

  const handleApprove = async (id: string) => {
    setProcessing(id);
    const res = (await api.admin.reviewVerification(id, { approved: true })) as { success: boolean };
    if (res.success) {
      setItems((prev) => prev.filter((v) => v.id !== id));
    }
    setProcessing(null);
  };

  const handleReject = async (id: string) => {
    if (!rejectionReason.trim()) return;
    setProcessing(id);
    const res = (await api.admin.reviewVerification(id, {
      approved: false,
      rejectionReason: rejectionReason.trim(),
    })) as { success: boolean };
    if (res.success) {
      setItems((prev) => prev.filter((v) => v.id !== id));
      setRejectingId(null);
      setRejectionReason('');
    }
    setProcessing(null);
  };

  if (loading && items.length === 0) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="w-8 h-8 border-2 border-tg-button border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="pb-24">
      <div className="px-5 py-3">
        <h1 className="text-lg font-bold text-tg-text">{t('admin.pendingVerifications')}</h1>
        <p className="text-xs text-tg-hint">{items.length} {t('intros.pending').toLowerCase()}</p>
      </div>

      {items.length === 0 ? (
        <div className="flex flex-col items-center justify-center px-6 pt-20 text-center">
          <div className="w-16 h-16 rounded-full bg-tg-secondary-bg flex items-center justify-center mb-4">
            <svg className="w-8 h-8 text-tg-hint" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
              <polyline points="22 4 12 14.01 9 11.01" />
            </svg>
          </div>
          <h2 className="text-lg font-bold text-tg-text mb-1">{t('admin.noVerifications')}</h2>
        </div>
      ) : (
        <div className="px-4 space-y-4">
          {items.map((v) => (
            <div key={v.id} className="card p-4 space-y-3">
              {/* Photos comparison */}
              <div className="flex gap-3">
                <div className="flex-1 space-y-1">
                  <p className="text-[10px] text-tg-hint uppercase tracking-wider">{t('admin.selfie')}</p>
                  <div className="aspect-square rounded-xl bg-tg-secondary-bg overflow-hidden">
                    <img src={v.selfieUrl} className="w-full h-full object-cover" alt="Selfie" />
                  </div>
                </div>
                <div className="flex-1 space-y-1">
                  <p className="text-[10px] text-tg-hint uppercase tracking-wider">{t('profile.mainPhoto')}</p>
                  <div className="aspect-square rounded-xl bg-tg-secondary-bg overflow-hidden">
                    {v.user.photos?.[0] ? (
                      <img src={v.user.photos[0].url} className="w-full h-full object-cover" alt="Profile" />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center text-tg-hint text-2xl">👤</div>
                    )}
                  </div>
                </div>
              </div>

              {/* User info */}
              <div className="flex justify-between items-center">
                <p className="text-sm font-medium text-tg-text">{v.user.firstName}</p>
                <p className="text-xs text-tg-hint">{new Date(v.createdAt).toLocaleDateString()}</p>
              </div>

              {/* Rejection reason input */}
              {rejectingId === v.id && (
                <div className="space-y-2">
                  <input
                    type="text"
                    value={rejectionReason}
                    onChange={(e) => setRejectionReason(e.target.value)}
                    placeholder={t('admin.rejectionReason')}
                    className="input-field text-sm"
                    autoFocus
                  />
                </div>
              )}

              {/* Actions */}
              <div className="flex gap-2">
                {rejectingId === v.id ? (
                  <>
                    <button
                      onClick={() => handleReject(v.id)}
                      disabled={!rejectionReason.trim() || processing === v.id}
                      className="flex-1 py-2.5 rounded-xl text-sm font-medium bg-red-500 text-white disabled:opacity-50"
                    >
                      {processing === v.id ? '...' : t('admin.confirmReject')}
                    </button>
                    <button
                      onClick={() => { setRejectingId(null); setRejectionReason(''); }}
                      className="px-4 py-2.5 text-sm text-tg-hint"
                    >
                      {t('common.cancel')}
                    </button>
                  </>
                ) : (
                  <>
                    <button
                      onClick={() => handleApprove(v.id)}
                      disabled={processing === v.id}
                      className="flex-1 py-2.5 rounded-xl text-sm font-medium bg-green-500 text-white disabled:opacity-50"
                    >
                      {processing === v.id ? '...' : t('admin.approve')}
                    </button>
                    <button
                      onClick={() => setRejectingId(v.id)}
                      className="flex-1 py-2.5 rounded-xl text-sm font-medium bg-tg-secondary-bg text-tg-destructive"
                    >
                      {t('admin.reject')}
                    </button>
                  </>
                )}
              </div>
            </div>
          ))}

          {/* Load more */}
          {hasMore && (
            <button
              onClick={() => loadPage(page + 1)}
              disabled={loading}
              className="w-full py-3 text-sm text-tg-button font-medium"
            >
              {loading ? '...' : t('common.loading')}
            </button>
          )}
        </div>
      )}
    </div>
  );
}
