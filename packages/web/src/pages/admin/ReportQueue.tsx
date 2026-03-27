import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import WebApp from '@twa-dev/sdk';
import { api } from '@/lib/api';
import type { ReportReason } from '@tanish/shared';

interface ReportItem {
  id: string;
  reason: ReportReason;
  details: string | null;
  createdAt: string;
  reporter: {
    id: string;
    firstName: string;
    photos: Array<{ url: string }>;
  };
  reported: {
    id: string;
    firstName: string;
    photos: Array<{ url: string }>;
    totalReports: number;
  };
}

interface PageData {
  items: ReportItem[];
  hasMore: boolean;
  page: number;
}

type ReportAction = 'dismiss' | 'warn' | 'suspend' | 'ban';

export default function ReportQueue() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [items, setItems] = useState<ReportItem[]>([]);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(true);
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
    const res = (await api.admin.getPendingReports(p)) as {
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

  const handleAction = async (id: string, action: ReportAction) => {
    setProcessing(id);
    const res = (await api.admin.reviewReport(id, { action })) as { success: boolean };
    if (res.success) {
      setItems((prev) => prev.filter((r) => r.id !== id));
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
        <h1 className="text-lg font-bold text-tg-text">{t('admin.pendingReports')}</h1>
        <p className="text-xs text-tg-hint">{items.length} {t('intros.pending').toLowerCase()}</p>
      </div>

      {items.length === 0 ? (
        <div className="flex flex-col items-center justify-center px-6 pt-20 text-center">
          <div className="w-16 h-16 rounded-full bg-tg-secondary-bg flex items-center justify-center mb-4">
            <svg className="w-8 h-8 text-tg-hint" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 22c5.523 0 10-4.477 10-10S17.523 2 12 2 2 6.477 2 12s4.477 10 10 10z" />
              <path d="M8 14s1.5 2 4 2 4-2 4-2" />
              <line x1="9" y1="9" x2="9.01" y2="9" />
              <line x1="15" y1="9" x2="15.01" y2="9" />
            </svg>
          </div>
          <h2 className="text-lg font-bold text-tg-text mb-1">{t('admin.noReports')}</h2>
        </div>
      ) : (
        <div className="px-4 space-y-4">
          {items.map((report) => (
            <div key={report.id} className="card p-4 space-y-3">
              {/* Reporter → Reported */}
              <div className="flex items-center gap-2">
                <UserBadge user={report.reporter} label={t('admin.reportedBy')} />
                <svg className="w-4 h-4 text-tg-hint shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M5 12h14M12 5l7 7-7 7" />
                </svg>
                <UserBadge user={report.reported} />
              </div>

              {/* Reason + report count */}
              <div className="flex justify-between items-center">
                <span className="text-xs font-medium text-tg-text bg-tg-secondary-bg px-2.5 py-1 rounded-full">
                  {t(`safety.reasons.${report.reason}`)}
                </span>
                <span className={`text-xs font-bold ${
                  report.reported.totalReports >= 3 ? 'text-red-500' : 'text-tg-hint'
                }`}>
                  {t('admin.totalReports', { count: report.reported.totalReports })}
                </span>
              </div>

              {/* Details */}
              {report.details && (
                <p className="text-sm text-tg-text bg-tg-secondary-bg rounded-xl p-3 italic">
                  "{report.details}"
                </p>
              )}

              {/* Date */}
              <p className="text-xs text-tg-hint">
                {new Date(report.createdAt).toLocaleDateString()}
              </p>

              {/* Actions */}
              <div className="grid grid-cols-4 gap-1.5">
                {(['dismiss', 'warn', 'suspend', 'ban'] as ReportAction[]).map((action) => {
                  const styles: Record<ReportAction, string> = {
                    dismiss: 'bg-tg-secondary-bg text-tg-hint',
                    warn: 'bg-yellow-100 text-yellow-700',
                    suspend: 'bg-orange-100 text-orange-700',
                    ban: 'bg-red-100 text-red-700',
                  };
                  return (
                    <button
                      key={action}
                      onClick={() => handleAction(report.id, action)}
                      disabled={processing === report.id}
                      className={`py-2 rounded-lg text-xs font-medium ${styles[action]} disabled:opacity-50`}
                    >
                      {processing === report.id ? '...' : t(`admin.${action}`)}
                    </button>
                  );
                })}
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

function UserBadge({
  user,
  label,
}: {
  user: { firstName: string; photos: Array<{ url: string }> };
  label?: string;
}) {
  return (
    <div className="flex items-center gap-2 flex-1 min-w-0">
      <div className="w-10 h-10 rounded-full bg-tg-secondary-bg overflow-hidden shrink-0">
        {user.photos?.[0] ? (
          <img src={user.photos[0].url} className="w-full h-full object-cover" alt="" />
        ) : (
          <div className="w-full h-full flex items-center justify-center text-tg-hint text-sm">👤</div>
        )}
      </div>
      <div className="min-w-0">
        {label && <p className="text-[10px] text-tg-hint leading-tight">{label}</p>}
        <p className="text-sm font-medium text-tg-text truncate">{user.firstName}</p>
      </div>
    </div>
  );
}
