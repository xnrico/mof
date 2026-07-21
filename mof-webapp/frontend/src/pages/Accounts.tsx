import { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { RefreshCw, RefreshCcw } from 'lucide-react';
import { api, formatCurrency, Account, User, SyncResult } from '../services/api';

function ProviderBadge({ provider }: { provider: string }) {
  const colors: Record<string, string> = {
    Plaid: 'bg-indigo-100 text-indigo-800',
    TrueLayer: 'bg-emerald-100 text-emerald-800',
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

  const [syncAllMsg, setSyncAllMsg] = useState('');

  const { data: accounts, isLoading } = useQuery<Account[]>({
    queryKey: ['accounts', 'all'],
    queryFn: () => api.getAccounts(),
    // Pick up balance/last-synced updates from the 5-minute background sync.
    refetchInterval: 60_000,
  });

  const { data: users } = useQuery<User[]>({
    queryKey: ['users'],
    queryFn: () => api.getUsers(),
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

  const syncAllMutation = useMutation({
    mutationFn: (opts: { full?: boolean; sinceDays?: number } = {}) =>
      api.syncAllAccounts(opts.full ?? false, opts.sinceDays) as Promise<SyncResult[]>,
    onSuccess: (results) => {
      const ok = results.filter((r) => r.success).length;
      const failed = results.length - ok;
      const added = results.reduce((s, r) => s + (r.transactions_added ?? 0), 0);
      setSyncAllMsg(
        `✓ Synced ${ok}/${results.length} account${results.length === 1 ? '' : 's'}` +
          ` — +${added} new txns${failed ? `, ${failed} failed` : ''}`
      );
      // Surface per-account results in each row too.
      setMessages((m) => {
        const next = { ...m };
        for (const r of results) {
          next[r.account_id] = r.success
            ? `✓ Synced: +${r.transactions_added} new, ${r.transactions_updated} updated`
            : `✗ ${r.error ?? 'Sync failed'}`;
        }
        return next;
      });
      queryClient.invalidateQueries({ queryKey: ['accounts'] });
    },
    onError: (err: unknown) => {
      setSyncAllMsg(`✗ ${err instanceof Error ? err.message : 'Sync all failed'}`);
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

  // Stable display order so rows don't reshuffle on every resync:
  // group by owner (Daixu shared pool first, then each user), and within a
  // group sort by account type, then name, then id.
  const userName = (id: number) => users?.find((u) => u.id === id)?.name ?? `User ${id}`;
  const groups = (() => {
    const byGroup = new Map<string, { label: string; order: number; rows: Account[] }>();
    for (const a of accounts ?? []) {
      const key = a.is_shared ? 'daixu' : `user-${a.user_id}`;
      const label = a.is_shared ? 'Daixu (shared)' : userName(a.user_id);
      // Daixu first (order -1), then users in ascending id order.
      const order = a.is_shared ? -1 : a.user_id;
      if (!byGroup.has(key)) byGroup.set(key, { label, order, rows: [] });
      byGroup.get(key)!.rows.push(a);
    }
    const sorted = [...byGroup.values()].sort((x, y) => x.order - y.order);
    for (const g of sorted) {
      g.rows.sort(
        (x, y) =>
          x.account_type.localeCompare(y.account_type) ||
          x.name.localeCompare(y.name) ||
          x.id - y.id
      );
    }
    return sorted;
  })();

  return (
    <div className="px-4 py-6 space-y-4">
      <div className="flex items-start justify-between flex-wrap gap-3">
        <h1 className="text-2xl sm:text-3xl font-bold text-gray-900">Accounts</h1>
        <div className="flex flex-col items-end gap-1">
          <div className="flex gap-2">
            <button
              onClick={() => { setSyncAllMsg(''); syncAllMutation.mutate({}); }}
              disabled={syncAllMutation.isPending}
              title="Sync all accounts now"
              className="inline-flex items-center gap-2 px-4 py-2 text-sm rounded-md bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <RefreshCcw className={`h-4 w-4 ${syncAllMutation.isPending ? 'animate-spin' : ''}`} />
              {syncAllMutation.isPending ? 'Syncing all…' : 'Sync All'}
            </button>
            <button
              onClick={() => { setSyncAllMsg(''); syncAllMutation.mutate({ sinceDays: 89 }); }}
              disabled={syncAllMutation.isPending}
              title="Re-pull the last 90 days for every account (stays within the TrueLayer consent window that rejects older history)"
              className="inline-flex items-center gap-2 px-4 py-2 text-sm rounded-md border border-blue-600 text-blue-700 hover:bg-blue-50 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <RefreshCcw className={`h-4 w-4 ${syncAllMutation.isPending ? 'animate-spin' : ''}`} />
              Refresh 90d
            </button>
            <button
              onClick={() => {
                if (window.confirm('Full re-sync re-pulls full history for every account and corrects existing transactions (e.g. card signs). Some banks reject history older than 90 days — use "Refresh 90d" for those. Continue?')) {
                  setSyncAllMsg(''); syncAllMutation.mutate({ full: true });
                }
              }}
              disabled={syncAllMutation.isPending}
              title="Re-pull full history and correct existing transactions"
              className="inline-flex items-center gap-2 px-4 py-2 text-sm rounded-md border border-blue-600 text-blue-700 hover:bg-blue-50 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <RefreshCcw className={`h-4 w-4 ${syncAllMutation.isPending ? 'animate-spin' : ''}`} />
              Full re-sync
            </button>
          </div>
          {syncAllMsg && (
            <span className={`text-xs ${syncAllMsg.startsWith('✓') ? 'text-green-600' : 'text-red-600'}`}>
              {syncAllMsg}
            </span>
          )}
        </div>
      </div>
      <p className="text-xs text-gray-400">Accounts also sync automatically in the background every 5 minutes.</p>

      {isLoading ? (
        <p className="text-gray-500">Loading…</p>
      ) : (
        <div className="bg-white rounded-lg shadow-sm overflow-x-auto">
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
              {groups.map((g) => [
                <tr key={`hdr-${g.label}`} className="bg-gray-50">
                  <td
                    colSpan={6}
                    className="px-4 py-2 text-xs font-semibold uppercase tracking-wider text-gray-500"
                  >
                    {g.label}
                  </td>
                </tr>,
                ...g.rows.map((a) => (
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
                )),
              ])}
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
