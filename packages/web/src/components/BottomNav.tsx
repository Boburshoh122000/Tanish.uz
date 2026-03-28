import { useLocation, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { motion } from 'framer-motion';
import { useAppStore } from '../store';

export default function BottomNav() {
  const { t } = useTranslation();
  const location = useLocation();
  const navigate = useNavigate();
  const { pendingIntros } = useAppStore();

  const tabs = [
    { path: '/discovery', i18nKey: 'nav.discover', Icon: CompassIcon, badge: 0 },
    { path: '/intros', i18nKey: 'nav.intros', Icon: ChatBubbleIcon, badge: pendingIntros.length },
    { path: '/profile', i18nKey: 'nav.profile', Icon: PersonIcon, badge: 0 },
    { path: '/settings', i18nKey: 'nav.settings', Icon: GearIcon, badge: 0 },
  ];

  return (
    <nav
      className="fixed bottom-0 left-0 right-0 z-50 backdrop-blur-lg"
      style={{
        paddingBottom: 'env(safe-area-inset-bottom, 0px)',
        backgroundColor: 'var(--tg-theme-bg-color, #ffffff)ee',
        borderTop: '1px solid var(--tg-theme-hint-color, #ccc)15',
      }}
    >
      <div className="flex justify-around items-center h-14">
        {tabs.map(({ path, i18nKey, Icon, badge }) => {
          const isActive = location.pathname.startsWith(path);

          return (
            <motion.button
              key={path}
              onClick={() => navigate(path === '/profile' ? '/profile/edit' : path)}
              whileTap={{ scale: 0.9 }}
              transition={{ type: 'spring', stiffness: 400, damping: 25 }}
              className={`relative flex flex-col items-center gap-0.5 px-4 py-1.5 transition-colors duration-200 ${
                isActive ? 'text-tg-button' : 'text-tg-hint'
              }`}
            >
              {/* Active indicator dot */}
              {isActive && (
                <motion.div
                  layoutId="nav-indicator"
                  className="absolute -top-0.5 w-5 h-0.5 rounded-full bg-tg-button"
                  transition={{ type: 'spring', stiffness: 500, damping: 30 }}
                />
              )}
              <span className="relative">
                <Icon active={isActive} />
                {badge > 0 && (
                  <span className="absolute -top-1 -right-2 min-w-[16px] h-4 bg-red-500 text-white text-[9px] font-bold rounded-full flex items-center justify-center px-1">
                    {badge > 99 ? '99+' : badge}
                  </span>
                )}
              </span>
              <span className="text-[10px] font-medium">{t(i18nKey)}</span>
            </motion.button>
          );
        })}
      </div>
    </nav>
  );
}

function CompassIcon({ active }: { active?: boolean }) {
  return (
    <svg className="w-6 h-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={active ? 2 : 1.5} strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="10" />
      <polygon points="16.24 7.76 14.12 14.12 7.76 16.24 9.88 9.88" fill="currentColor" stroke="none" />
    </svg>
  );
}

function ChatBubbleIcon({ active }: { active?: boolean }) {
  return (
    <svg className="w-6 h-6" viewBox="0 0 24 24" fill={active ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth={active ? 0 : 1.5} strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
    </svg>
  );
}

function PersonIcon({ active }: { active?: boolean }) {
  return (
    <svg className="w-6 h-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={active ? 2 : 1.5} strokeLinecap="round" strokeLinejoin="round">
      <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
      <circle cx="12" cy="7" r="4" />
    </svg>
  );
}

function GearIcon({ active }: { active?: boolean }) {
  return (
    <svg className="w-6 h-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={active ? 2 : 1.5} strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="3" />
      <path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z" />
    </svg>
  );
}
