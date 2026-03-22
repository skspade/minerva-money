import { NavLink, Outlet } from 'react-router';

export default function Layout() {
  return (
    <div className="min-h-screen bg-gray-50">
      <nav className="bg-gray-900 text-white">
        <div className="mx-auto max-w-6xl flex items-center justify-between px-4 py-3">
          <div className="flex items-center gap-8">
            <h1 className="text-lg font-bold">Minerva Money</h1>
            <div className="flex gap-4">
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
            </div>
          </div>
          <div className="flex items-center gap-3">
            {/* Sync status placeholder — filled by plan 04 */}
          </div>
        </div>
      </nav>
      <main className="mx-auto max-w-6xl px-4 py-6">
        <Outlet />
      </main>
    </div>
  );
}
