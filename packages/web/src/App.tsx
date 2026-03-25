import { useEffect } from 'react';
import { Routes, Route, Navigate, useNavigate } from 'react-router-dom';
import WebApp from '@twa-dev/sdk';
import { useAppStore } from './store';
import { api, setAuthToken } from './lib/api';
import Onboarding from './screens/Onboarding';
import Discovery from './screens/Discovery';
import Profile from './screens/Profile';
import IntrosList from './screens/IntrosList';
import Matches from './screens/Matches';
import Settings from './screens/Settings';
import BottomNav from './components/BottomNav';

export default function App() {
  const { user, isAuthenticated, isLoading, setUser, setAuthenticated, setLoading } = useAppStore();
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
        // Dev mode — skip auth
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

  // Dev mode fallback
  if (!isAuthenticated && import.meta.env.DEV) {
    return (
      <div className="min-h-screen bg-tg-bg">
        <Routes>
          <Route path="/onboarding" element={<Onboarding />} />
          <Route path="/" element={<Discovery />} />
          <Route path="/profile" element={<Profile />} />
          <Route path="/intros" element={<IntrosList />} />
          <Route path="/matches" element={<Matches />} />
          <Route path="/settings" element={<Settings />} />
          <Route path="*" element={<Navigate to="/" />} />
        </Routes>
        <BottomNav />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-tg-bg">
      <Routes>
        <Route path="/onboarding" element={<Onboarding />} />
        <Route path="/" element={<Discovery />} />
        <Route path="/profile" element={<Profile />} />
        <Route path="/intros" element={<IntrosList />} />
        <Route path="/matches" element={<Matches />} />
        <Route path="/settings" element={<Settings />} />
        <Route path="*" element={<Navigate to="/" />} />
      </Routes>
      {user?.profileComplete && <BottomNav />}
    </div>
  );
}
