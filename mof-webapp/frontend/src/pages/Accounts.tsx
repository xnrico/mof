import { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { RefreshCw } from 'lucide-react';
import { api, formatCurrency, Account, SyncResult } from '../services/api';

function ProviderBadge({ provider }: { provider: string }) {
  const colors: Record<string, string> = {
    Plaid: 'bg-indigo-100 text-indigo-800',
    GoCardless: 'bg-emerald-100 text-emerald-800',
    IBKR: 'bg-amber-100 text-amber-800',
    Trading212: 'bg-sky-100 text-sky-800',
    Manual: 'bg-gray-100 text-gray-800',
  };
  return (
    <span className={`px-2 py-1 rounded-full text-xs font-medium ${colors[provider] ?? 'bg-gray-100 text-gray-800'}`}>
      {provider}
    </span>
  );
}

export default function Accounts() {
  const queryClient = useQueryClient();
  const [messages, setMessages] = useState<Record<number, string>>({});
  const [cooldowns, setCooldowns] = useState<Record<number, number>>({}); // accountId -> expiry timestamp

  const { data: accounts, isLoading } = useQuery<Account[]>({
    queryKey: ['accounts', 'all'],
    queryFn: () => api.getAccounts(),
  });

  const syncMutation = useMutation({
    mutationFn: (accountId: number) => api.syncAccount(accountId) as Promise<SyncResult>,
    onSuccess: (result) => {
      setMessages((m) => ({
        ...m,
        [result.account_id]: result.success
          ? `✓ Synced: +${result.transactions_added} new, ${result.transactions_updated} updated`
          : `✗ ${result.error ?? 'Sync failed'}`,
      }));
      // 30s cooldown after any sync attempt
      setCooldowns((c) => ({ ...c, [result.account_id]: Date.now() + 30_000 }));
      queryClient.invalidateQueries({ queryKey: ['accounts'] });
    },
    onError: (err: unknown, accountId) => {
      const msg = err instanceof Error ? err.message : 'Request failed';
      setMessages((m) => ({ ...m, [accountId]: `✗ ${msg}` }));
      setCooldowns((c) => ({ ...c, [accountId]: Date.now() + 30_000 }));
    },
  });

  function isCoolingDown(accountId: number) {
    return (cooldowns[accountId] ?? 0) > Date.now();
  }

  // Re-render every second so cooldown buttons re-enable automatically
  const [, setTick] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setTick((t) => t + 1), 1000);
    return () => clearInterval(id);
  }, []);

  return (
    <div className="px-4 py-6 space-y-4">
      <h1 className="text-3xl font-bold text-gray-900">Accounts</h1>

      {isLoading ? (
        <p className="text-gray-500">Loading…</p>
      ) : (
        <div className="bg-white rounded-lg shadow-sm overflow-hidden">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                {['Account', 'Type', 'Provider', 'Balance', 'Last Synced', ''].map((h) => (
                  <th key={h} className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {(accounts ?? []).map((a) => (
                <tr key={a.id}>
                  <td className="px-4 py-3">
                    <div className="font-medium text-gray-900">{a.name}</div>
                    <div className="text-xs text-gray-500">{a.currency}</div>
                    {messages[a.id] && (
                      <div className={`text-xs mt-1 ${messages[a.id].startsWith('✓') ? 'text-green-600' : 'text-red-600'}`}>
                        {messages[a.id]}
                      </div>
                    )}
                  </td>
                  <td className="px-4 py-3 text-sm text-gray-700">{a.account_type}</td>
                  <td className="px-4 py-3"><ProviderBadge provider={a.provider} /></td>
                  <td className="px-4 py-3 text-sm font-medium text-gray-900">
                    {formatCurrency(a.current_balance, a.currency)}
                  </td>
                  <td className="px-4 py-3 text-sm text-gray-500">
                    {a.last_synced_at ? new Date(a.last_synced_at).toLocaleString() : 'Never'}
                  </td>
                  <td className="px-4 py-3 text-right">
                    {(() => {
                      const cooling = isCoolingDown(a.id);
                      const syncing = syncMutation.isPending && syncMutation.variables === a.id;
                      const secsLeft = cooling
                        ? Math.ceil(((cooldowns[a.id] ?? 0) - Date.now()) / 1000)
                        : 0;
                      return (
                        <button
                          onClick={() => syncMutation.mutate(a.id)}
                          disabled={syncing || cooling}
                          title={cooling ? `Rate limit — wait ${secsLeft}s` : 'Sync account'}
                          className="inline-flex items-center gap-1 px-3 py-1.5 text-sm rounded-md bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                          <RefreshCw className={`h-4 w-4 ${syncing ? 'animate-spin' : ''}`} />
                          {syncing ? 'Syncing…' : cooling ? `${secsLeft}s` : 'Sync'}
                        </button>
                      );
                    })()}
                  </td>
                </tr>
              ))}
              {accounts && accounts.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-4 py-8 text-center text-gray-500">
                    No accounts. Run the seed script or create one via the API.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
