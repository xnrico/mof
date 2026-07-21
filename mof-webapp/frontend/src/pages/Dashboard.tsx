import { useState } from 'react';
import type { ReactNode } from 'react';
import { useQuery } from '@tanstack/react-query';
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip, Legend } from 'recharts';
import { Wallet, TrendingUp } from 'lucide-react';
import { api, formatCurrency, User, Account, CategorySummary } from '../services/api';

// Soviet-poster palette: reds, propaganda gold, ink, and muted earth tones.
const COLORS = [
  '#a01410', '#c8901a', '#7d0f0c', '#e0a92a', '#5c0b09',
  '#8a6d3b', '#c1201a', '#a67214', '#3d0706', '#d23f3f',
  '#6b4f1d', '#835811', '#1a1512', '#b0522b',
];

function Card({ children }: { children: ReactNode }) {
  return <div className="sov-card p-6">{children}</div>;
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

  // Available months to populate the selector — union across the tab's users,
  // newest first. Uses the whole user set so the list is stable across tabs.
  const monthUserIds = (users ?? []).map((u) => u.id);
  const { data: availableMonths } = useQuery({
    queryKey: ['available-months', monthUserIds],
    queryFn: async () => {
      const lists = await Promise.all(monthUserIds.map((id) => api.getAvailableMonths(id)));
      const seen = new Map<string, { year: number; month: number; label: string }>();
      lists.flat().forEach((m) => seen.set(`${m.year}-${m.month}`, m));
      return [...seen.values()].sort((a, b) => b.year - a.year || b.month - a.month);
    },
    enabled: monthUserIds.length > 0,
  });

  // Selected month; default to the most recent available (or current month).
  const [selectedMonth, setSelectedMonth] = useState<{ year: number; month: number } | null>(null);
  const activeMonth = selectedMonth
    ?? (availableMonths && availableMonths.length > 0
      ? { year: availableMonths[0].year, month: availableMonths[0].month }
      : { year: new Date().getFullYear(), month: new Date().getMonth() + 1 });

  // One consolidated month summary per user, merged for the active tab. All
  // figures (salary, additional income, spending pie) come from this single
  // month window so they reconcile: total_income = salary + additional_income.
  const { data: monthSummary } = useQuery({
    queryKey: ['month-summary', summaryUserIds, activeMonth.year, activeMonth.month, displayCurrency],
    queryFn: async () => {
      const rows = await Promise.all(
        summaryUserIds.map((id) => api.getMonthSummary(id, activeMonth.year, activeMonth.month, displayCurrency))
      );
      const byCat: Record<string, CategorySummary> = {};
      let salary = 0, additional = 0, spending = 0;
      rows.forEach((r) => {
        salary += r.salary;
        additional += r.additional_income;
        spending += r.spending;
        r.by_category.forEach((c) => {
          const m = byCat[c.category] ?? { category: c.category, total: 0, count: 0 };
          m.total += c.total; m.count += c.count; byCat[c.category] = m;
        });
      });
      return {
        salary,
        additional_income: additional,
        total_income: salary + additional,
        spending,
        by_category: Object.values(byCat),
      };
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

  const chartData = (monthSummary?.by_category ?? [])
    .filter((s) => s.total > 0.01)  // drop near-zero rounding noise
    .sort((a, b) => b.total - a.total)
    .map((s) => ({ name: s.category, value: Math.round(s.total * 100) / 100 }));
  const spendingTotal = chartData.reduce((sum, d) => sum + d.value, 0);

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

        {/* Month selector — drives Salary, Additional Income, and Spending. */}
        <select
          value={`${activeMonth.year}-${activeMonth.month}`}
          onChange={(e) => {
            const [y, m] = e.target.value.split('-').map(Number);
            setSelectedMonth({ year: y, month: m });
          }}
          className="sm:ml-auto px-3 py-1.5 rounded-md border border-gray-200 text-sm bg-white"
        >
          {(availableMonths && availableMonths.length > 0
            ? availableMonths
            : [{ year: activeMonth.year, month: activeMonth.month,
                 label: `${activeMonth.year}-${String(activeMonth.month).padStart(2, '0')}` }]
          ).map((m) => (
            <option key={`${m.year}-${m.month}`} value={`${m.year}-${m.month}`}>{m.label}</option>
          ))}
        </select>
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
              <p className="text-sm text-gray-500">Salary ({displayCurrency})</p>
              <p className="text-2xl font-bold text-gray-900">
                {formatCurrency(monthSummary?.salary ?? 0, displayCurrency)}
              </p>
              <p className="text-xs text-gray-400 mt-0.5">salary received this month</p>
            </div>
          </div>
        </Card>
        <Card>
          <div className="flex items-center gap-3">
            <TrendingUp className="h-8 w-8 text-emerald-500" />
            <div>
              <p className="text-sm text-gray-500">Additional Income ({displayCurrency})</p>
              <p className="text-2xl font-bold text-gray-900">
                {formatCurrency(monthSummary?.additional_income ?? 0, displayCurrency)}
              </p>
              <p className="text-xs text-gray-400 mt-0.5">Income + Interest + Dividend</p>
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

      {/* Spending by category + this month's totals */}
      <Card>
        <h2 className="text-lg font-semibold text-gray-900 mb-4">
          Spending by Category ({displayCurrency})
          {(availableMonths?.find((m) => m.year === activeMonth.year && m.month === activeMonth.month)?.label) &&
            ` · ${availableMonths!.find((m) => m.year === activeMonth.year && m.month === activeMonth.month)!.label}`}
        </h2>
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 items-center">
          <div className="lg:col-span-2">
            {chartData.length === 0 ? (
              <p className="text-gray-500 text-sm py-12 text-center">
                No transactions yet. Configure an integration and sync an account to see spending here.
              </p>
            ) : (
              <ResponsiveContainer width="100%" height={320}>
                <PieChart>
                  <Pie
                    data={chartData}
                    dataKey="value"
                    nameKey="name"
                    cx="50%"
                    cy="50%"
                    outerRadius={110}
                    label={({ percent }) => `${((percent ?? 0) * 100).toFixed(1)}%`}
                  >
                    {chartData.map((_, i) => (
                      <Cell key={i} fill={COLORS[i % COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip
                    formatter={(v: number) => {
                      const pct = spendingTotal > 0 ? (v / spendingTotal) * 100 : 0;
                      return [`${formatCurrency(v, displayCurrency)} (${pct.toFixed(1)}%)`, ''];
                    }}
                  />
                  <Legend />
                </PieChart>
              </ResponsiveContainer>
            )}
          </div>

          {/* This month's income / spending totals (accounting rows only) */}
          <div className="space-y-4">
            <p className="text-xs font-semibold uppercase tracking-wider text-gray-400">This month</p>
            <div>
              <p className="text-sm text-gray-500">Total Income</p>
              <p className="text-xl font-bold text-green-600">
                {formatCurrency(monthSummary?.total_income ?? 0, displayCurrency)}
              </p>
            </div>
            <div>
              <p className="text-sm text-gray-500">Total Spending</p>
              <p className="text-xl font-bold text-red-600">
                {formatCurrency(monthSummary?.spending ?? 0, displayCurrency)}
              </p>
            </div>
            <div className="pt-2 border-t border-gray-100">
              <p className="text-sm text-gray-500">Net</p>
              <p className={`text-xl font-bold ${(monthSummary?.total_income ?? 0) - (monthSummary?.spending ?? 0) >= 0 ? 'text-gray-900' : 'text-red-600'}`}>
                {formatCurrency((monthSummary?.total_income ?? 0) - (monthSummary?.spending ?? 0), displayCurrency)}
              </p>
            </div>
          </div>
        </div>
      </Card>
    </div>
  );
}
