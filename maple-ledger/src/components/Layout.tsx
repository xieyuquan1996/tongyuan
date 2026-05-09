import { Outlet, NavLink } from 'react-router-dom'

export default function Layout() {
  return (
    <div className="min-h-screen bg-gray-50">
      <nav className="bg-white border-b border-gray-200 px-4 py-3 flex items-center gap-6">
        <span className="font-bold text-lg text-gray-900">Maple Ledger</span>
        <NavLink
          to="/transactions"
          className={({ isActive }) =>
            `text-sm ${isActive ? 'text-blue-600 font-medium' : 'text-gray-600 hover:text-gray-900'}`
          }
        >
          交易记录
        </NavLink>
        <NavLink
          to="/reports/monthly"
          className={({ isActive }) =>
            `text-sm ${isActive ? 'text-blue-600 font-medium' : 'text-gray-600 hover:text-gray-900'}`
          }
        >
          月度报表
        </NavLink>
        <NavLink
          to="/reports/exchange-loss"
          className={({ isActive }) =>
            `text-sm ${isActive ? 'text-blue-600 font-medium' : 'text-gray-600 hover:text-gray-900'}`
          }
        >
          汇率损耗
        </NavLink>
      </nav>
      <main className="max-w-6xl mx-auto px-4 py-6">
        <Outlet />
      </main>
    </div>
  )
}
