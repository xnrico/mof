import React from 'react';
import { BrowserRouter as Router, Routes, Route, Link } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { DollarSign, CreditCard, List, Settings as SettingsIcon } from 'lucide-react';

const queryClient = new QueryClient();

// Placeholder components until you build the actual pages
function Dashboard() {
  return (
    <div className="px-4 py-6">
      <h1 className="text-3xl font-bold text-gray-900">Dashboard</h1>
      <p className="mt-4">Welcome to Ministry of Finance</p>
    </div>
  );
}

function Accounts() {
  return (
    <div className="px-4 py-6">
      <h1 className="text-3xl font-bold text-gray-900">Accounts</h1>
      <p className="mt-4">Manage your accounts here</p>
    </div>
  );
}

function Transactions() {
  return (
    <div className="px-4 py-6">
      <h1 className="text-3xl font-bold text-gray-900">Transactions</h1>
      <p className="mt-4">View your transactions here</p>
    </div>
  );
}

function Settings() {
  return (
    <div className="px-4 py-6">
      <h1 className="text-3xl font-bold text-gray-900">Settings</h1>
      <p className="mt-4">Configure your settings here</p>
    </div>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <Router>
        <div className="min-h-screen bg-gray-50">
          {/* Navigation */}
          <nav className="bg-white shadow-sm">
            <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
              <div className="flex justify-between h-16">
                <div className="flex">
                  <div className="flex-shrink-0 flex items-center">
                    <DollarSign className="h-8 w-8 text-blue-600" />
                    <span className="ml-2 text-xl font-bold text-gray-900">
                      Ministry of Finance
                    </span>
                  </div>
                  <div className="hidden sm:ml-6 sm:flex sm:space-x-8">
                    <Link
                      to="/"
                      className="border-blue-500 text-gray-900 inline-flex items-center px-1 pt-1 border-b-2 text-sm font-medium"
                    >
                      <DollarSign className="h-4 w-4 mr-2" />
                      Dashboard
                    </Link>
                    <Link
                      to="/accounts"
                      className="border-transparent text-gray-500 hover:border-gray-300 hover:text-gray-700 inline-flex items-center px-1 pt-1 border-b-2 text-sm font-medium"
                    >
                      <CreditCard className="h-4 w-4 mr-2" />
                      Accounts
                    </Link>
                    <Link
                      to="/transactions"
                      className="border-transparent text-gray-500 hover:border-gray-300 hover:text-gray-700 inline-flex items-center px-1 pt-1 border-b-2 text-sm font-medium"
                    >
                      <List className="h-4 w-4 mr-2" />
                      Transactions
                    </Link>
                    <Link
                      to="/settings"
                      className="border-transparent text-gray-500 hover:border-gray-300 hover:text-gray-700 inline-flex items-center px-1 pt-1 border-b-2 text-sm font-medium"
                    >
                      <SettingsIcon className="h-4 w-4 mr-2" />
                      Settings
                    </Link>
                  </div>
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
            </Routes>
          </main>
        </div>
      </Router>
    </QueryClientProvider>
  );
}

export default App;
