import { BrowserRouter as Router, Routes, Route, NavLink } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { DollarSign, CreditCard, List, Settings as SettingsIcon, Wrench } from 'lucide-react';
import Dashboard from './pages/Dashboard';
import Accounts from './pages/Accounts';
import Transactions from './pages/Transactions';
import Settings from './pages/Settings';
import Manage from './pages/Manage';
import GoCardlessCallback from './pages/GoCardlessCallback';
import TrueLayerCallback from './pages/TrueLayerCallback';

const queryClient = new QueryClient();

const navItems = [
  { to: '/', label: 'Dashboard', icon: DollarSign, end: true },
  { to: '/accounts', label: 'Accounts', icon: CreditCard, end: false },
  { to: '/transactions', label: 'Transactions', icon: List, end: false },
  { to: '/manage', label: 'Manage', icon: SettingsIcon, end: false },
  { to: '/settings', label: 'Settings', icon: Wrench, end: false },
];

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <Router>
        <div className="min-h-screen bg-gray-50">
          {/* Navigation */}
          <nav className="bg-white shadow-sm">
            <div className="max-w-7xl mx-auto px-3 sm:px-6 lg:px-8">
              <div className="flex items-center justify-between gap-2 h-16">
                <div className="flex-shrink-0 flex items-center min-w-0">
                  <DollarSign className="h-7 w-7 sm:h-8 sm:w-8 text-blue-600 flex-shrink-0" />
                  <span className="ml-2 text-base sm:text-xl font-bold text-gray-900 truncate">
                    <span className="hidden sm:inline">Ministry of Finance</span>
                    <span className="sm:hidden">MoF</span>
                  </span>
                </div>
                <div className="flex items-center gap-1 sm:gap-6 overflow-x-auto">
                  {navItems.map(({ to, label, icon: Icon, end }) => (
                    <NavLink
                      key={to}
                      to={to}
                      end={end}
                      className={({ isActive }) =>
                        `inline-flex flex-col sm:flex-row items-center px-2 sm:px-1 py-1 sm:pt-1 border-b-2 text-xs sm:text-sm font-medium flex-shrink-0 ${
                          isActive
                            ? 'border-blue-500 text-gray-900'
                            : 'border-transparent text-gray-500 hover:border-gray-300 hover:text-gray-700'
                        }`
                      }
                    >
                      <Icon className="h-5 w-5 sm:h-4 sm:w-4 sm:mr-2" />
                      <span className="text-[10px] sm:text-sm">{label}</span>
                    </NavLink>
                  ))}
                </div>
              </div>
            </div>
          </nav>

          {/* Main Content */}
          <main className="max-w-7xl mx-auto py-6 sm:px-6 lg:px-8">
            <Routes>
              <Route path="/" element={<Dashboard />} />
              <Route path="/accounts" element={<Accounts />} />
              <Route path="/transactions" element={<Transactions />} />
              <Route path="/settings" element={<Settings />} />
              <Route path="/gocardless/callback" element={<GoCardlessCallback />} />
              <Route path="/truelayer/callback" element={<TrueLayerCallback />} />
              <Route path="/manage" element={<Manage />} />
            </Routes>
          </main>
        </div>
      </Router>
    </QueryClientProvider>
  );
}

export default App;
