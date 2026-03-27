import { useEffect } from 'react';
import { Routes, Route, Navigate, Outlet, useNavigate } from 'react-router-dom';
import WebApp from '@twa-dev/sdk';
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

function Layout() {
  return (
    <>
      <Outlet />
      <BottomNav />
    </>
  );
}

export default function App() {
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

      const res = await api.auth.telegram(initData) as any;
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
        title: 'Connection Error',
        message: 'Failed to connect. Please try again.',
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
        <Route element={<Layout />}>
          <Route path="/discovery" element={<DiscoveryPage />} />
          <Route path="/intros" element={<IntrosPage />} />
          <Route path="/profile" element={<MyProfilePage />} />
          {/* /profile/edit MUST come before /profile/:id — otherwise "edit" is captured as an :id param */}
          <Route path="/profile/edit" element={<ProfileEditPage />} />
          <Route path="/profile/:id" element={<ProfileViewPage />} />
          <Route path="/settings" element={<SettingsPage />} />
          <Route path="/settings/blocked" element={<BlockedUsersPage />} />
        </Route>
        <Route path="*" element={<Navigate to="/discovery" replace />} />
      </Routes>
    </div>
  );
}
