import { useEffect, lazy, Suspense } from 'react';
import { Routes, Route, Navigate, Outlet, useNavigate } from 'react-router-dom';
import WebApp from '@twa-dev/sdk';
import { useTranslation } from 'react-i18next';
import { useAppStore } from './store';
import { api, setAuthToken } from './lib/api';
import OnboardingPage from './pages/onboarding/OnboardingPage';
import DiscoveryPage from './pages/discovery/DiscoveryPage';
import ProfileEditPage from './pages/profile/ProfileEditPage';
import ProfileViewPage from './pages/profile/ProfileViewPage';
import IntrosPage from './pages/intros/IntrosPage';
import SettingsPage from './pages/settings/SettingsPage';
import BlockedUsersPage from './pages/settings/BlockedUsersPage';
import BottomNav from './components/BottomNav';

// Lazy-loaded pages (only fetched when user navigates to them)
const ReferralsPage = lazy(() => import('./pages/referrals/ReferralsPage'));
const PremiumPage = lazy(() => import('./pages/premium/PremiumPage'));
const VerificationPage = lazy(() => import('./pages/verification/VerificationPage'));
const AdminDashboard = lazy(() => import('./pages/admin/AdminDashboard'));
const VerificationQueue = lazy(() => import('./pages/admin/VerificationQueue'));
const ReportQueue = lazy(() => import('./pages/admin/ReportQueue'));
const UserManagement = lazy(() => import('./pages/admin/UserManagement'));
const BroadcastPage = lazy(() => import('./pages/admin/BroadcastPage'));

const ADMIN_IDS = ((import.meta.env.VITE_ADMIN_IDS as string) || '').split(',').filter(Boolean);

function LoadingScreen() {
  return (
    <div className="flex items-center justify-center min-h-screen">
      <div className="w-10 h-10 border-4 border-tg-button border-t-transparent rounded-full animate-spin" />
    </div>
  );
}

function AdminGuard() {
  const { user } = useAppStore();
  if (!user || !ADMIN_IDS.includes(user.telegramId)) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen pb-20 px-6 text-center">
        <div className="w-16 h-16 rounded-full bg-tg-secondary-bg flex items-center justify-center mb-4">
          <svg className="w-8 h-8 text-tg-hint" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
            <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
            <path d="M7 11V7a5 5 0 0 1 10 0v4" />
          </svg>
        </div>
        <h2 className="text-lg font-bold text-tg-text mb-1">Access denied</h2>
        <p className="text-sm text-tg-hint">You don't have admin access</p>
      </div>
    );
  }
  return <Outlet />;
}

function AuthGuard() {
  const { t } = useTranslation();
  const { user, isAuthenticated } = useAppStore();

  if (!isAuthenticated || !user) {
    // Detect whether we're actually inside Telegram
    const inTelegram = !!WebApp.initData;

    return (
      <div className="flex flex-col items-center justify-center min-h-screen px-6 text-center">
        <div className="w-16 h-16 rounded-full bg-tg-secondary-bg flex items-center justify-center mb-4">
          <svg className="w-8 h-8 text-tg-hint" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
          </svg>
        </div>
        {inTelegram ? (
          <>
            <h2 className="text-lg font-bold text-tg-text mb-1">{t('auth.connectionFailed')}</h2>
            <p className="text-sm text-tg-hint mb-4">{t('auth.connectionFailedHint')}</p>
            <button
              onClick={() => window.location.reload()}
              className="px-6 py-2.5 bg-tg-button text-tg-button-text rounded-xl font-medium"
            >
              {t('common.retry')}
            </button>
          </>
        ) : (
          <>
            <h2 className="text-lg font-bold text-tg-text mb-1">{t('auth.openViaTelegram')}</h2>
            <p className="text-sm text-tg-hint">{t('auth.openViaTelegramHint')}</p>
          </>
        )}
      </div>
    );
  }

  if (!user.profileComplete) {
    return <Navigate to="/onboarding" replace />;
  }

  return <Outlet />;
}

function Layout() {
  return (
    <>
      <Outlet />
      <BottomNav />
    </>
  );
}

export default function App() {
  const { t } = useTranslation();
  const { isLoading, setUser, setAuthenticated, setLoading, setAuthError } = useAppStore();
  const navigate = useNavigate();

  useEffect(() => {
    WebApp.ready();
    WebApp.expand();
    WebApp.enableClosingConfirmation();
    authenticate();
  }, []);

  async function authenticate() {
    console.log('[AUTH] Starting authentication...');
    console.log('[AUTH] initData length:', WebApp.initData?.length ?? 0);
    console.log('[AUTH] platform:', WebApp.platform);

    // Wait briefly for SDK to populate initData
    let initData = WebApp.initData;
    if (!initData) {
      await new Promise((r) => setTimeout(r, 300));
      initData = WebApp.initData;
      console.log('[AUTH] After delay, initData length:', initData?.length ?? 0);
    }

    if (!initData) {
      console.log('[AUTH] No initData — not in Telegram');
      setLoading(false);
      return;
    }

    try {
      console.log('[AUTH] Sending initData to API...');
      const res = await api.auth.telegram(initData) as { success: boolean; data?: { token: string; user: Parameters<typeof setUser>[0]; onboardingComplete: boolean }; error?: string };
      console.log('[AUTH] Response success:', res.success);

      if (res.success && res.data) {
        console.log('[AUTH] Authenticated as:', res.data.user?.firstName);
        setAuthToken(res.data.token);
        setUser(res.data.user);
        setAuthenticated(true);

        if (!res.data.onboardingComplete) {
          navigate('/onboarding');
        }
      } else {
        console.error('[AUTH] API returned failure:', res.error);
        setAuthError(true);
      }
    } catch (err) {
      console.error('[AUTH] Exception:', err);
      setAuthError(true);
    } finally {
      setLoading(false);
    }
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="flex flex-col items-center gap-4">
          <div className="w-12 h-12 border-4 border-tg-button border-t-transparent rounded-full animate-spin" />
          <p className="text-tg-hint text-sm">Loading Tanish...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-tg-bg">
      <Routes>
        <Route path="/onboarding" element={<OnboardingPage />} />
        <Route element={<AuthGuard />}>
        <Route element={<Layout />}>
          <Route path="/discovery" element={<DiscoveryPage />} />
          <Route path="/intros" element={<IntrosPage />} />
          <Route path="/profile" element={<Navigate to="/profile/edit" replace />} />
          {/* /profile/edit MUST come before /profile/:id — otherwise "edit" is captured as an :id param */}
          <Route path="/profile/edit" element={<ProfileEditPage />} />
          <Route path="/profile/:id" element={<ProfileViewPage />} />
          <Route path="/referrals" element={<Suspense fallback={<LoadingScreen />}><ReferralsPage /></Suspense>} />
          <Route path="/premium" element={<Suspense fallback={<LoadingScreen />}><PremiumPage /></Suspense>} />
          <Route path="/verify" element={<Suspense fallback={<LoadingScreen />}><VerificationPage /></Suspense>} />
          <Route path="/settings" element={<SettingsPage />} />
          <Route path="/settings/blocked" element={<BlockedUsersPage />} />
          <Route element={<AdminGuard />}>
            <Route path="/admin" element={<Suspense fallback={<LoadingScreen />}><AdminDashboard /></Suspense>} />
            <Route path="/admin/users-list" element={<Suspense fallback={<LoadingScreen />}><UserManagement /></Suspense>} />
            <Route path="/admin/verifications" element={<Suspense fallback={<LoadingScreen />}><VerificationQueue /></Suspense>} />
            <Route path="/admin/reports" element={<Suspense fallback={<LoadingScreen />}><ReportQueue /></Suspense>} />
            <Route path="/admin/broadcast" element={<Suspense fallback={<LoadingScreen />}><BroadcastPage /></Suspense>} />
          </Route>
        </Route>
        </Route>
        <Route path="*" element={<Navigate to="/discovery" replace />} />
      </Routes>
    </div>
  );
}
