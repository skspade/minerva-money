import { useState } from 'react';
import { NavLink } from 'react-router';
import { Home, List, BarChart2, MessageSquare, MoreHorizontal } from 'lucide-react';
import MoreSheet from './MoreSheet';

const PRIMARY_TABS = [
  { to: '/', end: true, icon: Home, label: 'Dashboard' },
  { to: '/transactions', end: false, icon: List, label: 'Transactions' },
  { to: '/budget', end: false, icon: BarChart2, label: 'Budget' },
  { to: '/chat', end: false, icon: MessageSquare, label: 'Chat' },
] as const;

export default function BottomTabBar() {
  const [moreOpen, setMoreOpen] = useState(false);

  return (
    <>
      <nav className="fixed bottom-0 inset-x-0 md:hidden bg-surface border-t border-border pb-safe z-40">
        <div className="flex">
          {PRIMARY_TABS.map((tab) => (
            <NavLink
              key={tab.to}
              to={tab.to}
              end={tab.end}
              className={({ isActive }) =>
                `flex-1 flex flex-col items-center justify-center min-h-[44px] py-2 text-xs gap-1 ${isActive ? 'text-accent' : 'text-text-secondary'}`
              }
            >
              <tab.icon size={20} />
              <span>{tab.label}</span>
            </NavLink>
          ))}
          <button
            onClick={() => setMoreOpen(true)}
            className="flex-1 flex flex-col items-center justify-center min-h-[44px] py-2 text-xs gap-1 text-text-secondary"
            aria-label="More navigation options"
          >
            <MoreHorizontal size={20} />
            <span>More</span>
          </button>
        </div>
      </nav>
      <MoreSheet open={moreOpen} onClose={() => setMoreOpen(false)} />
    </>
  );
}
