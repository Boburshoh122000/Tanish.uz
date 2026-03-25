import { NavLink } from 'react-router-dom';
import { useAppStore } from '../store';

export default function BottomNav() {
  const { pendingIntros, matchedIntros } = useAppStore();
  const pendingCount = pendingIntros.length;
  const matchCount = matchedIntros.length;

  return (
    <nav className="fixed bottom-0 left-0 right-0 bg-tg-bg border-t border-tg-secondary-bg z-50"
         style={{ paddingBottom: 'var(--safe-area-bottom, 0px)' }}>
      <div className="flex justify-around items-center h-14">
        <NavItem to="/" icon="🔍" label="Discover" />
        <NavItem to="/intros" icon="💬" label="Intros" badge={pendingCount} />
        <NavItem to="/matches" icon="💫" label="Matches" badge={matchCount} />
        <NavItem to="/profile" icon="👤" label="Profile" />
      </div>
    </nav>
  );
}

function NavItem({ to, icon, label, badge }: { to: string; icon: string; label: string; badge?: number }) {
  return (
    <NavLink
      to={to}
      className={({ isActive }) =>
        `flex flex-col items-center gap-0.5 px-3 py-1 transition-all duration-200 ${
          isActive ? 'text-tg-button scale-105' : 'text-tg-hint'
        }`
      }
    >
      <span className="text-xl relative">
        {icon}
        {badge ? (
          <span className="absolute -top-1 -right-2 min-w-[18px] h-[18px] bg-red-500 text-white 
                          text-[10px] font-bold rounded-full flex items-center justify-center px-1">
            {badge > 99 ? '99+' : badge}
          </span>
        ) : null}
      </span>
      <span className="text-[10px] font-medium">{label}</span>
    </NavLink>
  );
}
