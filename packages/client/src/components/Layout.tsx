import { NavLink, Outlet } from 'react-router';
import SyncStatus from './SyncStatus';
import SyncButton from './SyncButton';
import BottomTabBar from './BottomTabBar';

export default function Layout() {
  return (
    <div className="min-h-dvh bg-gray-50 overflow-x-hidden">
      <nav className="hidden md:block bg-gray-900 text-white">
        <div className="mx-auto max-w-6xl flex items-center justify-between px-4 py-3">
          <div className="flex items-center gap-8">
            <h1 className="text-lg font-bold">Minerva Money</h1>
            <div className="flex gap-4">
              <NavLink
                to="/"
                end
                className={({ isActive }) =>
                  `px-3 py-1 rounded ${isActive ? 'bg-gray-700' : 'hover:bg-gray-800'}`
                }
              >
                Dashboard
              </NavLink>
              <NavLink
                to="/accounts"
                className={({ isActive }) =>
                  `px-3 py-1 rounded ${isActive ? 'bg-gray-700' : 'hover:bg-gray-800'}`
                }
              >
                Accounts
              </NavLink>
              <NavLink
                to="/transactions"
                className={({ isActive }) =>
                  `px-3 py-1 rounded ${isActive ? 'bg-gray-700' : 'hover:bg-gray-800'}`
                }
              >
                Transactions
              </NavLink>
              <NavLink
                to="/categories"
                className={({ isActive }) =>
                  `px-3 py-1 rounded ${isActive ? 'bg-gray-700' : 'hover:bg-gray-800'}`
                }
              >
                Categories
              </NavLink>
              <NavLink
                to="/rules"
                className={({ isActive }) =>
                  `px-3 py-1 rounded ${isActive ? 'bg-gray-700' : 'hover:bg-gray-800'}`
                }
              >
                Rules
              </NavLink>
              <NavLink
                to="/transfers"
                className={({ isActive }) =>
                  `px-3 py-1 rounded ${isActive ? 'bg-gray-700' : 'hover:bg-gray-800'}`
                }
              >
                Transfers
              </NavLink>
              <NavLink
                to="/budget"
                className={({ isActive }) =>
                  `px-3 py-1 rounded ${isActive ? 'bg-gray-700' : 'hover:bg-gray-800'}`
                }
              >
                Budget
              </NavLink>
              <NavLink
                to="/reports"
                className={({ isActive }) =>
                  `px-3 py-1 rounded ${isActive ? 'bg-gray-700' : 'hover:bg-gray-800'}`
                }
              >
                Reports
              </NavLink>
              <NavLink
                to="/chat"
                className={({ isActive }) =>
                  `px-3 py-1 rounded ${isActive ? 'bg-gray-700' : 'hover:bg-gray-800'}`
                }
              >
                Chat
              </NavLink>
              <NavLink
                to="/import"
                className={({ isActive }) =>
                  `px-3 py-1 rounded ${isActive ? 'bg-gray-700' : 'hover:bg-gray-800'}`
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
