import { useEffect, lazy, Suspense } from 'react';
import { Routes, Route, Navigate, Outlet, useNavigate } from 'react-router-dom';
import WebApp from '@twa-dev/sdk';
import { useTranslation } from 'react-i18next';
import { useAppStore } from './store';
import { api, setAuthToken } from './lib/api';
import OnboardingPage from './pages/onboarding/OnboardingPage';
import DiscoveryPage from './pages/discovery/DiscoveryPage';
import MyProfilePage from './pages/profile/MyProfilePage';
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

function OnboardingGuard() {
  const { user } = useAppStore();
  // If user exists but hasn't completed onboarding, force them there.
  // This catches users who navigate directly or where the auth redirect races.
  if (user && !user.profileComplete) {
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
  const { isLoading, setUser, setAuthenticated, setLoading } = useAppStore();
  const navigate = useNavigate();

  useEffect(() => {
    WebApp.ready();
    WebApp.expand();
    WebApp.enableClosingConfirmation();
    authenticate();
  }, []);

  async function authenticate() {
    try {
      const initData = WebApp.initData;
      if (!initData) {
        if (import.meta.env.DEV) {
          setLoading(false);
          return;
        }
        setLoading(false);
        return;
      }

      const res = await api.auth.telegram(initData) as { success: boolean; data?: { token: string; user: Parameters<typeof setUser>[0]; onboardingComplete: boolean } };
      if (res.success && res.data) {
        setAuthToken(res.data.token);
        setUser(res.data.user);
        setAuthenticated(true);

        if (!res.data.onboardingComplete) {
          navigate('/onboarding');
        }
      }
    } catch (err) {
      console.error('Auth failed:', err);
      WebApp.showPopup({
        title: t('common.error'),
        message: t('common.retry'),
        buttons: [{ type: 'close' }],
      });
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
        <Route element={<OnboardingGuard />}>
        <Route element={<Layout />}>
          <Route path="/discovery" element={<DiscoveryPage />} />
          <Route path="/intros" element={<IntrosPage />} />
          <Route path="/profile" element={<MyProfilePage />} />
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
            <Route path="/admin/verifications" element={<Suspense fallback={<LoadingScreen />}><VerificationQueue /></Suspense>} />
            <Route path="/admin/reports" element={<Suspense fallback={<LoadingScreen />}><ReportQueue /></Suspense>} />
          </Route>
        </Route>
        </Route>
        <Route path="*" element={<Navigate to="/discovery" replace />} />
      </Routes>
    </div>
  );
}
