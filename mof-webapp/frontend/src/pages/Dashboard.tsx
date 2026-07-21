import { useState } from 'react';
import type { ReactNode } from 'react';
import { useQuery } from '@tanstack/react-query';
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip, Legend } from 'recharts';
import { Wallet, TrendingUp } from 'lucide-react';
import { api, formatCurrency, User, Account, IncomeSource, CategorySummary } from '../services/api';

const COLORS = [
  '#2563eb', '#16a34a', '#dc2626', '#d97706', '#7c3aed',
  '#0891b2', '#db2777', '#65a30d', '#ea580c', '#4f46e5',
  '#0d9488', '#be123c', '#a16207', '#475569',
];

function Card({ children }: { children: ReactNode }) {
  return <div className="bg-white rounded-lg shadow-sm p-6">{children}</div>;
}

const DAIXU = 'daixu';
type Tab = number | typeof DAIXU;

export default function Dashboard() {
  const [tab, setTab] = useState<Tab | null>(null);
  const [includeShared, setIncludeShared] = useState(true);
  const [displayCurrency, setDisplayCurrency] = useState<'GBP' | 'USD'>('GBP');

  const { data: users } = useQuery<User[]>({ queryKey: ['users'], queryFn: () => api.getUsers() });

  // FX rates for converting balances to the chosen display currency. Refreshed
  // server-side every 5 min; we re-fetch every 60s to pick up new rates.
  const { data: fx } = useQuery({
    queryKey: ['fx-rates'],
    queryFn: () => api.getFxRates(),
    refetchInterval: 60000,
  });

  // Default to the shared Daixu view once users have loaded
  const activeTab: Tab | null = tab ?? (users && users.length > 0 ? DAIXU : null);
  const isDaixu = activeTab === DAIXU;
  const activeUserId = typeof activeTab === 'number' ? activeTab : null;

  // Fetch ALL accounts; we partition client-side by owner / shared.
  const { data: allAccounts } = useQuery<Account[]>({
    queryKey: ['accounts', 'all'],
    queryFn: () => api.getAccounts(),
    refetchInterval: 60000,
  });

  // Accounts visible for the active tab:
  //  - Daixu: every account, exactly once
  //  - a user: their own non-shared accounts, plus shared ones if toggled on
  const accounts = (allAccounts ?? []).filter((a) => {
    if (isDaixu) return true;
    if (a.is_shared) return includeShared;
    return a.user_id === activeUserId;
  });

  // For the Daixu tab, aggregate income/summary across all users (each account
  // belongs to exactly one user_id, so there's no double counting).
  const summaryUserIds = isDaixu ? (users ?? []).map((u) => u.id) : (activeUserId != null ? [activeUserId] : []);

  const { data: income } = useQuery<IncomeSource[]>({
    queryKey: ['income', summaryUserIds],
    queryFn: async () => {
      const lists = await Promise.all(summaryUserIds.map((id) => api.getIncomeSources(id)));
      return lists.flat();
    },
    enabled: summaryUserIds.length > 0,
  });

  const { data: summary } = useQuery<CategorySummary[]>({
    queryKey: ['summary', summaryUserIds],
    queryFn: async () => {
      const lists = await Promise.all(
        summaryUserIds.map((id) => api.getCategorySummary(id, { currency: 'GBP', expenses_only: true }))
      );
      // Merge category rows across users
      const merged: Record<string, CategorySummary> = {};
      lists.flat().forEach((row) => {
        const m = merged[row.category] ?? { category: row.category, total: 0, count: 0 };
        m.total += row.total;
        m.count += row.count;
        merged[row.category] = m;
      });
      return Object.values(merged);
    },
    enabled: summaryUserIds.length > 0,
  });

  // Convert any amount into the selected display currency using the FX rate.
  const gbpUsd = fx?.GBP_USD ?? 1.27;
  function toDisplay(amount: number, from: string): number {
    if (from === displayCurrency) return amount;
    if (from === 'GBP' && displayCurrency === 'USD') return amount * gbpUsd;
    if (from === 'USD' && displayCurrency === 'GBP') return amount / gbpUsd;
    return amount; // unknown currency: show as-is
  }

  // Aggregate balances per currency (native) and as a converted grand total.
  const balancesByCurrency: Record<string, number> = {};
  let totalInDisplay = 0;
  accounts.forEach((a) => {
    if (a.current_balance != null) {
      balancesByCurrency[a.currency] = (balancesByCurrency[a.currency] ?? 0) + a.current_balance;
      totalInDisplay += toDisplay(a.current_balance, a.currency);
    }
  });
  const hasMultipleCurrencies = Object.keys(balancesByCurrency).length > 1;

  const monthlyIncome = (income ?? [])
    .filter((i) => i.frequency === 'monthly')
    .reduce((sum, i) => sum + i.amount, 0);

  const chartData = (summary ?? [])
    .filter((s) => s.total > 0.01)  // drop near-zero rounding noise
    .sort((a, b) => b.total - a.total)
    .map((s) => ({ name: s.category, value: Math.round(s.total * 100) / 100 }));

  return (
    <div className="px-4 py-6 space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <h1 className="text-2xl sm:text-3xl font-bold text-gray-900">Dashboard</h1>
        {users && users.length > 0 && (
          <div className="flex flex-wrap gap-2">
            <button
              onClick={() => setTab(DAIXU)}
              className={`px-4 py-2 rounded-md text-sm font-medium ${
                isDaixu
                  ? 'bg-purple-600 text-white'
                  : 'bg-white text-purple-700 shadow-sm hover:bg-purple-50'
              }`}
            >
              Daixu
            </button>
            {users.map((u) => (
              <button
                key={u.id}
                onClick={() => setTab(u.id)}
                className={`px-4 py-2 rounded-md text-sm font-medium ${
                  activeTab === u.id
                    ? 'bg-blue-600 text-white'
                    : 'bg-white text-gray-700 shadow-sm hover:bg-gray-50'
                }`}
              >
                {u.name}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Currency switch */}
      <div className="flex items-center gap-3 flex-wrap">
        <div className="inline-flex rounded-md border border-gray-200 bg-white overflow-hidden">
          {(['GBP', 'USD'] as const).map((c) => (
            <button
              key={c}
              onClick={() => setDisplayCurrency(c)}
              className={`px-3 py-1.5 text-sm font-medium ${
                displayCurrency === c ? 'bg-blue-600 text-white' : 'text-gray-600 hover:bg-gray-50'
              }`}
            >
              {c}
            </button>
          ))}
        </div>
        {fx && (
          <span className="text-xs text-gray-400">
            1 GBP = {fx.GBP_USD.toFixed(4)} USD
            {fx.stale && ' (fallback)'}
            {fx.updated_at && !fx.stale &&
              ` · updated ${new Date(fx.updated_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`}
          </span>
        )}
      </div>

      {/* Shared-account toggle (per-user tabs only; Daixu always includes all) */}
      {!isDaixu && (
        <label className="flex items-center gap-2 text-sm text-gray-600 cursor-pointer w-fit">
          <input
            type="checkbox"
            checked={includeShared}
            onChange={(e) => setIncludeShared(e.target.checked)}
            className="h-4 w-4 rounded border-gray-300 text-purple-600 focus:ring-purple-500"
          />
          Include shared (Daixu) accounts in totals
        </label>
      )}

      {/* Summary cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        <Card>
          <div className="flex items-center gap-3">
            <Wallet className="h-8 w-8 text-blue-600" />
            <div>
              <p className="text-sm text-gray-500">Total Balance ({displayCurrency})</p>
              <div className="text-2xl font-bold text-gray-900">
                {Object.keys(balancesByCurrency).length === 0
                  ? '—'
                  : formatCurrency(totalInDisplay, displayCurrency)}
              </div>
              {hasMultipleCurrencies && (
                <div className="text-xs text-gray-400 mt-0.5">
                  {Object.entries(balancesByCurrency).map(([cur, amt]) => (
                    <span key={cur} className="mr-2">{formatCurrency(amt, cur)}</span>
                  ))}
                </div>
              )}
            </div>
          </div>
        </Card>
        <Card>
          <div className="flex items-center gap-3">
            <TrendingUp className="h-8 w-8 text-green-600" />
            <div>
              <p className="text-sm text-gray-500">Monthly Income ({displayCurrency})</p>
              <p className="text-2xl font-bold text-gray-900">
                {formatCurrency(toDisplay(monthlyIncome, 'GBP'), displayCurrency)}
              </p>
            </div>
          </div>
        </Card>
        <Card>
          <div>
            <p className="text-sm text-gray-500">Accounts</p>
            <p className="text-2xl font-bold text-gray-900">{accounts?.length ?? 0}</p>
          </div>
        </Card>
      </div>

      {/* Spending by category */}
      <Card>
        <h2 className="text-lg font-semibold text-gray-900 mb-4">Spending by Category (GBP)</h2>
        {chartData.length === 0 ? (
          <p className="text-gray-500 text-sm py-12 text-center">
            No transactions yet. Configure an integration and sync an account to see spending here.
          </p>
        ) : (
          <ResponsiveContainer width="100%" height={320}>
            <PieChart>
              <Pie data={chartData} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={110} label>
                {chartData.map((_, i) => (
                  <Cell key={i} fill={COLORS[i % COLORS.length]} />
                ))}
              </Pie>
              <Tooltip formatter={(v: number) => formatCurrency(v, 'GBP')} />
              <Legend />
            </PieChart>
          </ResponsiveContainer>
        )}
      </Card>
    </div>
  );
}
