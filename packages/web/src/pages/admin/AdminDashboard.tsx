import { useEffect, useState, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import WebApp from '@twa-dev/sdk';
import { api } from '@/lib/api';

interface LiveMetrics {
  dau: number;
  signupsToday: number;
  introsToday: number;
  matchesToday: number;
  activeNow: number;
}

interface DailyMetric {
  date: string;
  dau: number;
  intros: number;
  matches: number;
}

interface FullMetrics {
  genderRatio: { male: number; female: number };
  matchRate: number;
  responseRate: number;
  premiumConversion: number;
  dailyMetrics: DailyMetric[];
}

export default function AdminDashboard() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [live, setLive] = useState<LiveMetrics | null>(null);
  const [metrics, setMetrics] = useState<FullMetrics | null>(null);
  const [loading, setLoading] = useState(true);
  const intervalRef = useRef<ReturnType<typeof setInterval>>();

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
    loadAll();
    intervalRef.current = setInterval(loadLive, 30_000);
    return () => clearInterval(intervalRef.current);
  }, []);

  async function loadAll() {
    await Promise.all([loadLive(), loadMetrics()]);
    setLoading(false);
  }

  async function loadLive() {
    const res = (await api.admin.getLiveMetrics()) as { success: boolean; data?: LiveMetrics };
    if (res.success && res.data) setLive(res.data);
  }

  async function loadMetrics() {
    const res = (await api.admin.getMetrics()) as { success: boolean; data?: FullMetrics };
    if (res.success && res.data) setMetrics(res.data);
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="w-8 h-8 border-2 border-tg-button border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="pb-24">
      <div className="px-5 py-3">
        <h1 className="text-lg font-bold text-tg-text">{t('admin.title')}</h1>
      </div>

      <div className="px-4 space-y-4">
        {/* Live metrics cards */}
        {live && (
          <div>
            <h3 className="text-xs font-semibold text-tg-section-header uppercase tracking-wider mb-2">
              {t('admin.liveMetrics')}
            </h3>
            <div className="grid grid-cols-2 gap-2">
              <MetricCard label={t('admin.dau')} value={live.dau} />
              <MetricCard label={t('admin.signupsToday')} value={live.signupsToday} accent />
              <MetricCard label={t('admin.introsToday')} value={live.introsToday} />
              <MetricCard label={t('admin.matchesToday')} value={live.matchesToday} />
              <MetricCard label={t('admin.activeNow')} value={live.activeNow} pulse className="col-span-2" />
            </div>
          </div>
        )}

        {/* Gender ratio */}
        {metrics && (
          <GenderGauge male={metrics.genderRatio.male} female={metrics.genderRatio.female} />
        )}

        {/* Charts — last 30 days */}
        {metrics?.dailyMetrics && metrics.dailyMetrics.length > 0 && (
          <div className="space-y-4">
            <h3 className="text-xs font-semibold text-tg-section-header uppercase tracking-wider">
              {t('admin.last30Days')}
            </h3>
            <div className="card p-4 space-y-2">
              <p className="text-xs text-tg-hint">{t('admin.dau')}</p>
              <MiniBarChart data={metrics.dailyMetrics.map((d) => d.dau)} color="bg-tg-button" />
            </div>
            <div className="card p-4 space-y-2">
              <div className="flex justify-between text-xs text-tg-hint">
                <span>{t('admin.introsToday')}</span>
                <span>{t('admin.matchesToday')}</span>
              </div>
              <div className="flex gap-3">
                <div className="flex-1">
                  <MiniBarChart data={metrics.dailyMetrics.map((d) => d.intros)} color="bg-brand-400" />
                </div>
                <div className="flex-1">
                  <MiniBarChart data={metrics.dailyMetrics.map((d) => d.matches)} color="bg-green-500" />
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Quick stats */}
        {metrics && (
          <div>
            <h3 className="text-xs font-semibold text-tg-section-header uppercase tracking-wider mb-2">
              {t('admin.quickStats')}
            </h3>
            <div className="grid grid-cols-3 gap-2">
              <PercentCard label={t('admin.matchRate')} value={metrics.matchRate} />
              <PercentCard label={t('admin.responseRate')} value={metrics.responseRate} />
              <PercentCard label={t('admin.premiumConversion')} value={metrics.premiumConversion} />
            </div>
          </div>
        )}

        {/* Queue navigation */}
        <div className="space-y-2 pt-2">
          <button
            onClick={() => navigate('/admin/verifications')}
            className="card w-full p-4 flex justify-between items-center text-left"
          >
            <span className="text-sm font-medium text-tg-text">{t('admin.pendingVerifications')}</span>
            <ChevronRight />
          </button>
          <button
            onClick={() => navigate('/admin/reports')}
            className="card w-full p-4 flex justify-between items-center text-left"
          >
            <span className="text-sm font-medium text-tg-text">{t('admin.pendingReports')}</span>
            <ChevronRight />
          </button>
        </div>
      </div>
    </div>
  );
}

/* ═══════════ Components ═══════════ */

function MetricCard({
  label,
  value,
  accent,
  pulse,
  className = '',
}: {
  label: string;
  value: number;
  accent?: boolean;
  pulse?: boolean;
  className?: string;
}) {
  return (
    <div className={`card p-3 ${className}`}>
      <p className="text-xs text-tg-hint mb-1">{label}</p>
      <p className={`text-2xl font-bold ${accent ? 'text-tg-button' : 'text-tg-text'}`}>
        {value.toLocaleString()}
        {pulse && (
          <span className="inline-block w-2 h-2 bg-green-500 rounded-full ml-2 animate-pulse" />
        )}
      </p>
    </div>
  );
}

function GenderGauge({ male, female }: { male: number; female: number }) {
  const { t } = useTranslation();
  const total = male + female || 1;
  const malePct = Math.round((male / total) * 100);
  const femalePct = 100 - malePct;
  const ratio = male / (female || 1);
  const status = ratio < 2 ? 'healthy' : ratio < 3 ? 'warning' : 'critical';
  const statusColor = { healthy: 'text-green-600', warning: 'text-yellow-600', critical: 'text-red-600' }[status];
  const barColors = { healthy: 'bg-blue-500', warning: 'bg-yellow-500', critical: 'bg-red-500' }[status];

  return (
    <div className="card p-4 space-y-3">
      <div className="flex justify-between items-center">
        <h3 className="text-xs font-semibold text-tg-section-header uppercase tracking-wider">
          {t('admin.genderRatio')}
        </h3>
        <span className={`text-xs font-semibold ${statusColor}`}>
          {ratio.toFixed(1)}:1 · {t(`admin.${status}`)}
        </span>
      </div>
      <div className="flex h-6 rounded-full overflow-hidden">
        <div className={`${barColors} transition-all`} style={{ width: `${malePct}%` }} />
        <div className="bg-pink-400 transition-all" style={{ width: `${femalePct}%` }} />
      </div>
      <div className="flex justify-between text-xs text-tg-hint">
        <span>♂ {t('admin.male')} {malePct}%</span>
        <span>♀ {t('admin.female')} {femalePct}%</span>
      </div>
    </div>
  );
}

function MiniBarChart({ data, color }: { data: number[]; color: string }) {
  const max = Math.max(...data, 1);
  return (
    <div className="flex items-end gap-px h-20">
      {data.map((v, i) => (
        <div
          key={i}
          className={`flex-1 rounded-t-sm ${color} opacity-80 hover:opacity-100 transition-opacity`}
          style={{ height: `${(v / max) * 100}%`, minHeight: v > 0 ? 2 : 0 }}
        />
      ))}
    </div>
  );
}

function PercentCard({ label, value }: { label: string; value: number }) {
  const pct = Math.round(value * 100);
  return (
    <div className="card p-3 text-center">
      <p className="text-2xl font-bold text-tg-text">{pct}%</p>
      <p className="text-[10px] text-tg-hint mt-0.5 leading-tight">{label}</p>
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
