import { NavLink, Outlet } from 'react-router';
import SyncStatus from './SyncStatus';
import SyncButton from './SyncButton';
import BottomTabBar from './BottomTabBar';

export default function Layout() {
  return (
    <div className="min-h-dvh bg-surface-alt overflow-x-hidden">
      <nav className="hidden md:block bg-nav-bg text-text-invert">
        <div className="mx-auto max-w-6xl flex items-center justify-between px-4 py-3">
          <div className="flex items-center gap-8">
            <h1 className="text-lg font-bold">Minerva Money</h1>
            <div className="flex gap-4">
              <NavLink
                to="/"
                end
                className={({ isActive }) =>
                  `px-3 py-1 rounded ${isActive ? 'bg-nav-active' : 'hover:bg-nav-hover'}`
                }
              >
                Dashboard
              </NavLink>
              <NavLink
                to="/accounts"
                className={({ isActive }) =>
                  `px-3 py-1 rounded ${isActive ? 'bg-nav-active' : 'hover:bg-nav-hover'}`
                }
              >
                Accounts
              </NavLink>
              <NavLink
                to="/transactions"
                className={({ isActive }) =>
                  `px-3 py-1 rounded ${isActive ? 'bg-nav-active' : 'hover:bg-nav-hover'}`
                }
              >
                Transactions
              </NavLink>
              <NavLink
                to="/categories"
                className={({ isActive }) =>
                  `px-3 py-1 rounded ${isActive ? 'bg-nav-active' : 'hover:bg-nav-hover'}`
                }
              >
                Categories
              </NavLink>
              <NavLink
                to="/rules"
                className={({ isActive }) =>
                  `px-3 py-1 rounded ${isActive ? 'bg-nav-active' : 'hover:bg-nav-hover'}`
                }
              >
                Rules
              </NavLink>
              <NavLink
                to="/transfers"
                className={({ isActive }) =>
                  `px-3 py-1 rounded ${isActive ? 'bg-nav-active' : 'hover:bg-nav-hover'}`
                }
              >
                Transfers
              </NavLink>
              <NavLink
                to="/budget"
                className={({ isActive }) =>
                  `px-3 py-1 rounded ${isActive ? 'bg-nav-active' : 'hover:bg-nav-hover'}`
                }
              >
                Budget
              </NavLink>
              <NavLink
                to="/reports"
                className={({ isActive }) =>
                  `px-3 py-1 rounded ${isActive ? 'bg-nav-active' : 'hover:bg-nav-hover'}`
                }
              >
                Reports
              </NavLink>
              <NavLink
                to="/chat"
                className={({ isActive }) =>
                  `px-3 py-1 rounded ${isActive ? 'bg-nav-active' : 'hover:bg-nav-hover'}`
                }
              >
                Chat
              </NavLink>
              <NavLink
                to="/import"
                className={({ isActive }) =>
                  `px-3 py-1 rounded ${isActive ? 'bg-nav-active' : 'hover:bg-nav-hover'}`
                }
              >
                Import
              </NavLink>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <SyncStatus />
            <SyncButton />
          </div>
        </div>
      </nav>
      <main className="mx-auto max-w-6xl px-4 py-6 pb-20 md:pb-6">
        <Outlet />
      </main>
      <BottomTabBar />
    </div>
  );
}
