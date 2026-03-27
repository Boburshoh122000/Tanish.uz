import { useLocation, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';

const TABS = [
  { path: '/admin', key: 'dashboard' },
  { path: '/admin/users-list', key: 'users' },
  { path: '/admin/verifications', key: 'verifications' },
  { path: '/admin/reports', key: 'reports' },
  { path: '/admin/broadcast', key: 'broadcast' },
] as const;

export default function AdminNav() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { pathname } = useLocation();

  return (
    <div className="px-4 mb-4 overflow-x-auto">
      <div className="flex gap-1.5 min-w-max">
        {TABS.map(({ path, key }) => {
          const active = pathname === path;
          return (
            <button
              key={path}
              onClick={() => navigate(path)}
              className={`px-3 py-1.5 rounded-full text-xs font-medium transition-colors whitespace-nowrap ${
                active
                  ? 'bg-tg-button text-tg-button-text'
                  : 'bg-tg-secondary-bg text-tg-hint'
              }`}
            >
              {t(`admin.${key}`)}
            </button>
          );
        })}
      </div>
    </div>
  );
}
