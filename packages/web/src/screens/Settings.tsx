import WebApp from '@twa-dev/sdk';
import { useNavigate } from 'react-router-dom';
import { useAppStore } from '../store';
import { api } from '../lib/api';

export default function Settings() {
  const { user } = useAppStore();
  const navigate = useNavigate();

  const handleDeleteAccount = () => {
    WebApp.showPopup(
      {
        title: 'Delete Account?',
        message: 'Your account will be scheduled for deletion. You have 7 days to reactivate by logging in again.',
        buttons: [
          { id: 'cancel', type: 'cancel' },
          { id: 'delete', type: 'destructive', text: 'Delete' },
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
        <h1 className="text-lg font-bold text-tg-text">Settings</h1>
      </div>

      <div className="px-4 space-y-3">
        {/* Notifications */}
        <div className="card p-4 space-y-3">
          <h3 className="text-sm font-semibold text-tg-section-header">Notifications</h3>
          <ToggleRow
            label="Daily matches"
            value={user?.notifyDailyBatch ?? true}
            onChange={(v) => api.users.updateNotifications({ dailyBatch: v })}
          />
          <ToggleRow
            label="New intros"
            value={user?.notifyIntros ?? true}
            onChange={(v) => api.users.updateNotifications({ intros: v })}
          />
          <ToggleRow
            label="Matches"
            value={user?.notifyMatches ?? true}
            onChange={(v) => api.users.updateNotifications({ matches: v })}
          />
          <ToggleRow
            label="Re-engagement"
            value={user?.notifyReEngagement ?? true}
            onChange={(v) => api.users.updateNotifications({ reEngagement: v })}
          />
        </div>

        {/* Preferences */}
        <div className="card p-4 space-y-3">
          <h3 className="text-sm font-semibold text-tg-section-header">Discovery Preferences</h3>
          <div className="flex justify-between items-center">
            <span className="text-sm text-tg-text">Show me</span>
            <select
              defaultValue={user?.genderPref || ''}
              onChange={(e) => api.users.update({ genderPref: e.target.value || null })}
              className="text-sm text-tg-button bg-transparent border-none outline-none"
            >
              <option value="">Everyone</option>
              <option value="MALE">Men</option>
              <option value="FEMALE">Women</option>
            </select>
          </div>
          <div className="flex justify-between items-center">
            <span className="text-sm text-tg-text">Age range</span>
            <span className="text-sm text-tg-hint">{user?.minAge || 18} - {user?.maxAge || 28}</span>
          </div>
        </div>

        {/* Account */}
        <div className="card p-4 space-y-3">
          <h3 className="text-sm font-semibold text-tg-section-header">Account</h3>
          
          <button className="w-full text-left text-sm text-tg-text py-2 flex justify-between items-center">
            <span>Verification</span>
            <span className={user?.verified ? 'text-green-500' : 'text-tg-hint'}>
              {user?.verified ? '✓ Verified' : 'Not verified'}
            </span>
          </button>

          <button className="w-full text-left text-sm text-tg-text py-2 flex justify-between items-center">
            <span>Premium</span>
            <span className={user?.isPremium ? 'text-yellow-500' : 'text-tg-hint'}>
              {user?.isPremium ? '⭐ Active' : 'Upgrade'}
            </span>
          </button>

          <button className="w-full text-left text-sm text-tg-text py-2 flex justify-between items-center">
            <span>Blocked users</span>
            <span className="text-tg-hint">→</span>
          </button>

          <hr className="border-tg-secondary-bg" />

          <button
            onClick={handleDeleteAccount}
            className="w-full text-left text-sm text-tg-destructive py-2"
          >
            Delete account
          </button>
        </div>

        {/* Version */}
        <p className="text-center text-xs text-tg-hint py-4">
          Tanish v0.1.0 · Made in Tashkent 🇺🇿
        </p>
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
