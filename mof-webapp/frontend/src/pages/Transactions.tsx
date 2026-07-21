import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api, formatCurrency, Account, Transaction } from '../services/api';

const CATEGORIES = [
  'Food', 'Grocery', 'Transport', 'Car', 'Housing', 'Entertainment', 'Tourism',
  'Subscriptions', 'Salary', 'Income', 'Investment', 'Investment Gain',
  'Investment Loss', 'Dividend', 'Interest', 'Other',
];

// The "vendor key" used to find similar transactions: prefer merchant name,
// fall back to the description. Kept short so near-identical vendor strings
// (e.g. "TESCO STORES 1234") still match on the common prefix.
function vendorKey(t: Transaction): string {
  const base = (t.merchant_name || t.description || '').trim();
  // Take the first few words — enough to identify the vendor without the
  // trailing store/reference numbers that vary per transaction.
  return base.split(/\s+/).slice(0, 2).join(' ');
}

export default function Transactions() {
  const queryClient = useQueryClient();
  const [accountId, setAccountId] = useState<number | ''>('');
  const [category, setCategory] = useState<string>('');
  const [primaryCurrency, setPrimaryCurrency] = useState<'GBP' | 'USD'>('GBP');
  // Transaction id → vendor key, shown while its "apply to similar" prompt is up.
  const [applyPrompt, setApplyPrompt] = useState<Record<number, string>>({});
  const [bulkMsg, setBulkMsg] = useState('');

  const { data: accounts } = useQuery<Account[]>({
    queryKey: ['accounts', 'all'],
    queryFn: () => api.getAccounts(),
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, category }: { id: number; category: string }) =>
      api.updateTransaction(id, { category_override: category }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['transactions'] }),
  });

  const accountingMutation = useMutation({
    mutationFn: ({ id, include }: { id: number; include: boolean }) =>
      api.updateTransaction(id, { include_in_accounting: include }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['transactions'] });
      queryClient.invalidateQueries({ queryKey: ['summary'] });
    },
  });

  const bulkMutation = useMutation({
    mutationFn: ({ key, category }: { key: string; category: string }) =>
      api.bulkCategorize(key, category),
    onSuccess: (res) => {
      setBulkMsg(`✓ Applied to ${res.updated} matching transaction${res.updated === 1 ? '' : 's'}`);
      queryClient.invalidateQueries({ queryKey: ['transactions'] });
      queryClient.invalidateQueries({ queryKey: ['summary'] });
      setTimeout(() => setBulkMsg(''), 4000);
    },
  });

  function handleCategoryChange(t: Transaction, newCategory: string) {
    updateMutation.mutate({ id: t.id, category: newCategory });
    // Offer to apply this category to similar vendors.
    const key = vendorKey(t);
    if (key) setApplyPrompt((p) => ({ ...p, [t.id]: key }));
  }

  function applyToSimilar(t: Transaction, newCategory: string) {
    const key = applyPrompt[t.id];
    if (key) bulkMutation.mutate({ key, category: newCategory });
    setApplyPrompt((p) => { const n = { ...p }; delete n[t.id]; return n; });
  }

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
        limit: 1000,
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
          className="sov-input w-full sm:w-auto"
        >
          <option value="">All accounts</option>
          {(accounts ?? []).map((a) => (
            <option key={a.id} value={a.id}>{a.name}</option>
          ))}
        </select>
        <select
          value={category}
          onChange={(e) => setCategory(e.target.value)}
          className="sov-input w-full sm:w-auto"
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

      {bulkMsg && (
        <div className="text-sm text-green-600 bg-green-50 border border-green-200 rounded-md px-3 py-2">
          {bulkMsg}
        </div>
      )}

      <div className="sov-card overflow-x-auto">
        <table className="min-w-full divide-y divide-gray-200">
          <thead className="sov-thead">
            <tr>
              {['Date', 'Description', 'Account', 'Category', 'Amount'].map((h) => (
                <th key={h} className="px-4 py-3 text-left text-xs">
                  {h}
                </th>
              ))}
              <th className="px-4 py-3 text-center text-xs whitespace-nowrap" title="Include this transaction in the spending pie / accounting">
                In accounting
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-200">
            {isLoading ? (
              <tr><td colSpan={6} className="px-4 py-8 text-center text-gray-500">Loading…</td></tr>
            ) : (transactions ?? []).length === 0 ? (
              <tr><td colSpan={6} className="px-4 py-8 text-center text-gray-500">
                No transactions. Sync an account to import them.
              </td></tr>
            ) : (
              (transactions ?? []).map((t) => {
                const cat = t.category_override ?? t.category;
                const promptKey = applyPrompt[t.id];
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
                    <td className="px-4 py-3 text-sm text-gray-700">
                      <select
                        value={cat}
                        onChange={(e) => handleCategoryChange(t, e.target.value)}
                        className="sov-input sov-input-sm max-w-[9rem]"
                      >
                        {CATEGORIES.map((c) => (
                          <option key={c} value={c}>{c}</option>
                        ))}
                      </select>
                      {promptKey && (
                        <div className="mt-1 flex items-center gap-1.5">
                          <button
                            onClick={() => applyToSimilar(t, cat)}
                            className="sov-btn text-xs px-2 py-0.5"
                            title={`Apply "${cat}" to all transactions matching "${promptKey}"`}
                          >
                            Apply to “{promptKey}”
                          </button>
                          <button
                            onClick={() => setApplyPrompt((p) => { const n = { ...p }; delete n[t.id]; return n; })}
                            className="text-xs text-gray-400 hover:text-gray-600"
                          >
                            Dismiss
                          </button>
                        </div>
                      )}
                    </td>
                    <td className={`px-4 py-3 text-sm font-medium text-right ${t.amount < 0 ? 'text-red-600' : 'text-gray-900'}`}>
                      {formatCurrency(toPrimary(t.amount, t.currency), primaryCurrency)}
                      {t.currency !== primaryCurrency && (
                        <div className="text-xs font-normal text-gray-400">
                          {formatCurrency(t.amount, t.currency)}
                        </div>
                      )}
                    </td>
                    <td className="px-4 py-3 text-center">
                      <input
                        type="checkbox"
                        checked={t.include_in_accounting}
                        onChange={(e) => accountingMutation.mutate({ id: t.id, include: e.target.checked })}
                        className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500 cursor-pointer"
                        title={t.include_in_accounting ? 'Included in accounting' : 'Excluded from accounting'}
                      />
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
