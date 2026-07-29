import { BrowserRouter as Router, Routes, Route, NavLink } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { LayoutDashboard, CreditCard, List, SlidersHorizontal, Wrench } from 'lucide-react';
import Dashboard from './pages/Dashboard';
import Accounts from './pages/Accounts';
import Transactions from './pages/Transactions';
import Settings from './pages/Settings';
import Manage from './pages/Manage';
import TrueLayerCallback from './pages/TrueLayerCallback';

const queryClient = new QueryClient();

const navItems = [
  { to: '/', label: 'Dashboard', icon: LayoutDashboard, end: true },
  { to: '/accounts', label: 'Accounts', icon: CreditCard, end: false },
  { to: '/transactions', label: 'Transactions', icon: List, end: false },
  { to: '/manage', label: 'Manage', icon: SlidersHorizontal, end: false },
  { to: '/settings', label: 'Settings', icon: Wrench, end: false },
];

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <Router>
        <div className="min-h-screen">
          {/* Top bar — translucent material, content scrolls underneath. On
              mobile it carries only the wordmark; navigation moves to the
              bottom tab bar (the iOS convention). */}
          <header className="app-chrome sticky top-0 z-30 border-b border-black/5
                             bg-white/72 backdrop-blur-xl backdrop-saturate-150"
                  style={{ paddingTop: 'env(safe-area-inset-top)' }}>
            <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
              <div className="flex items-center justify-between gap-4 h-14 sm:h-16">
                <div className="flex-shrink-0 flex items-center min-w-0">
                  <span className="text-[17px] sm:text-xl font-display font-bold tracking-tight text-ink truncate">
                    <span className="hidden sm:inline">Ministry of Finance</span>
                    <span className="sm:hidden">Finance</span>
                  </span>
                </div>

                {/* Desktop / tablet inline nav */}
                <nav className="hidden sm:flex items-center gap-1">
                  {navItems.map(({ to, label, icon: Icon, end }) => (
                    <NavLink
                      key={to}
                      to={to}
                      end={end}
                      className={({ isActive }) =>
                        `inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full text-[13px] font-medium
                         transition-[background-color,color] duration-200 active:scale-[0.97] ${
                           isActive
                             ? 'bg-black/[0.06] text-ink'
                             : 'text-neutral-500 hover:text-ink hover:bg-black/[0.03]'
                         }`
                      }
                    >
                      <Icon className="h-4 w-4" strokeWidth={2} />
                      <span>{label}</span>
                    </NavLink>
                  ))}
                </nav>
              </div>
            </div>
          </header>

          {/* Main content */}
          <main className="mount-fade max-w-7xl mx-auto px-4 py-6 sm:px-6 lg:px-8 pb-28 sm:pb-10">
            <Routes>
              <Route path="/" element={<Dashboard />} />
              <Route path="/accounts" element={<Accounts />} />
              <Route path="/transactions" element={<Transactions />} />
              <Route path="/settings" element={<Settings />} />
              <Route path="/truelayer/callback" element={<TrueLayerCallback />} />
              <Route path="/manage" element={<Manage />} />
            </Routes>
          </main>

          {/* Mobile bottom tab bar — fixed translucent material, safe-area aware. */}
          <nav className="app-chrome sm:hidden fixed bottom-0 inset-x-0 z-30
                          border-t border-black/5 bg-white/80 backdrop-blur-xl backdrop-saturate-150"
               style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}>
            <div className="flex items-stretch justify-around">
              {navItems.map(({ to, label, icon: Icon, end }) => (
                <NavLink
                  key={to}
                  to={to}
                  end={end}
                  className={({ isActive }) =>
                    `flex flex-1 flex-col items-center justify-center gap-1 py-2 min-w-0
                     transition-colors duration-150 active:scale-95 ${
                       isActive ? 'text-blue-600' : 'text-neutral-400'
                     }`
                  }
                >
                  <Icon className="h-[22px] w-[22px]" strokeWidth={2} />
                  <span className="text-[10px] font-medium leading-none truncate max-w-full">{label}</span>
                </NavLink>
              ))}
            </div>
          </nav>
        </div>
      </Router>
    </QueryClientProvider>
  );
}

export default App;
