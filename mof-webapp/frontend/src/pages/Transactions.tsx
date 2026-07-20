import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api, formatCurrency, Account, Transaction } from '../services/api';

const CATEGORIES = [
  'Food', 'Grocery', 'Transport', 'Housing', 'Entertainment', 'Tourism',
  'Subscriptions', 'Kittens', 'Salary', 'Investment', 'Investment Gain',
  'Investment Loss', 'Dividend', 'Interest', 'Other',
];

export default function Transactions() {
  const [accountId, setAccountId] = useState<number | ''>('');
  const [category, setCategory] = useState<string>('');
  const [primaryCurrency, setPrimaryCurrency] = useState<'GBP' | 'USD'>('GBP');

  const { data: accounts } = useQuery<Account[]>({
    queryKey: ['accounts', 'all'],
    queryFn: () => api.getAccounts(),
  });

  const { data: fx } = useQuery({
    queryKey: ['fx-rates'],
    queryFn: () => api.getFxRates(),
    refetchInterval: 60000,
  });

  // Convert a native amount into the chosen primary currency.
  const gbpUsd = fx?.GBP_USD ?? 1.27;
  function toPrimary(amount: number, from: string): number {
    if (from === primaryCurrency) return amount;
    if (from === 'GBP' && primaryCurrency === 'USD') return amount * gbpUsd;
    if (from === 'USD' && primaryCurrency === 'GBP') return amount / gbpUsd;
    return amount;
  }

  const { data: transactions, isLoading } = useQuery<Transaction[]>({
    queryKey: ['transactions', accountId, category],
    queryFn: () =>
      api.getTransactions({
        account_id: accountId === '' ? undefined : accountId,
        category: category || undefined,
        limit: 200,
      }),
  });

  const accountName = (id: number) => accounts?.find((a) => a.id === id)?.name ?? `#${id}`;

  return (
    <div className="px-4 py-6 space-y-4">
      <h1 className="text-3xl font-bold text-gray-900">Transactions</h1>

      {/* Filters */}
      <div className="flex flex-col sm:flex-row flex-wrap gap-3">
        <select
          value={accountId}
          onChange={(e) => setAccountId(e.target.value === '' ? '' : Number(e.target.value))}
          className="w-full sm:w-auto px-3 py-2 rounded-md border border-gray-300 text-sm bg-white"
        >
          <option value="">All accounts</option>
          {(accounts ?? []).map((a) => (
            <option key={a.id} value={a.id}>{a.name}</option>
          ))}
        </select>
        <select
          value={category}
          onChange={(e) => setCategory(e.target.value)}
          className="w-full sm:w-auto px-3 py-2 rounded-md border border-gray-300 text-sm bg-white"
        >
          <option value="">All categories</option>
          {CATEGORIES.map((c) => (
            <option key={c} value={c}>{c}</option>
          ))}
        </select>
        <div className="inline-flex rounded-md border border-gray-300 bg-white overflow-hidden sm:ml-auto">
          {(['GBP', 'USD'] as const).map((c) => (
            <button
              key={c}
              onClick={() => setPrimaryCurrency(c)}
              className={`px-3 py-2 text-sm font-medium ${
                primaryCurrency === c ? 'bg-blue-600 text-white' : 'text-gray-600 hover:bg-gray-50'
              }`}
            >
              {c}
            </button>
          ))}
        </div>
      </div>

      <div className="bg-white rounded-lg shadow-sm overflow-x-auto">
        <table className="min-w-full divide-y divide-gray-200">
          <thead className="bg-gray-50">
            <tr>
              {['Date', 'Description', 'Account', 'Category', 'Amount'].map((h) => (
                <th key={h} className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-200">
            {isLoading ? (
              <tr><td colSpan={5} className="px-4 py-8 text-center text-gray-500">Loading…</td></tr>
            ) : (transactions ?? []).length === 0 ? (
              <tr><td colSpan={5} className="px-4 py-8 text-center text-gray-500">
                No transactions. Sync an account to import them.
              </td></tr>
            ) : (
              (transactions ?? []).map((t) => {
                const cat = t.category_override ?? t.category;
                return (
                  <tr key={t.id}>
                    <td className="px-4 py-3 text-sm text-gray-500 whitespace-nowrap">
                      {new Date(t.transaction_date).toLocaleDateString()}
                    </td>
                    <td className="px-4 py-3">
                      <div className="text-sm font-medium text-gray-900">{t.description}</div>
                      {t.merchant_name && <div className="text-xs text-gray-500">{t.merchant_name}</div>}
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-700">{accountName(t.account_id)}</td>
                    <td className="px-4 py-3 text-sm text-gray-700">{cat}</td>
                    <td className={`px-4 py-3 text-sm font-medium text-right ${t.amount < 0 ? 'text-red-600' : 'text-gray-900'}`}>
                      {formatCurrency(toPrimary(t.amount, t.currency), primaryCurrency)}
                      {t.currency !== primaryCurrency && (
                        <div className="text-xs font-normal text-gray-400">
                          {formatCurrency(t.amount, t.currency)}
                        </div>
                      )}
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
