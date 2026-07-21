import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Plus, Pencil, Trash2, Link, ChevronDown, ChevronRight, RefreshCw } from 'lucide-react';
import { api, Account, KeyPair, formatCurrency } from '../services/api';
import PlaidConnect from '../components/PlaidConnect';

const ACCOUNT_TYPES = ['Checking', 'Savings', 'Brokerage', 'Credit Card', 'Other'];
const CURRENCIES = ['GBP', 'USD'];
const PROVIDERS = ['TrueLayer', 'Trading212', 'Plaid', 'IBKR', 'Manual'];

// ---- Account Form ----

interface AccountFormData {
  name: string; currency: string; account_type: string;
  provider: string; user_id: number; is_shared: boolean;
}

// Sentinel select value for the shared ("Daixu") pool.
const SHARED_OWNER = 'shared';

function AccountForm({ initial, users, onSave, onCancel }: {
  initial?: Partial<AccountFormData & { id: number; is_shared: boolean }>;
  users: { id: number; name: string }[];
  onSave: (d: AccountFormData & { id?: number }) => void;
  onCancel: () => void;
}) {
  const [form, setForm] = useState<AccountFormData>({
    name: initial?.name ?? '',
    currency: initial?.currency ?? 'GBP',
    account_type: initial?.account_type ?? 'Checking',
    provider: initial?.provider ?? 'TrueLayer',
    user_id: initial?.user_id ?? users[0]?.id ?? 1,
    is_shared: initial?.is_shared ?? false,
  });

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">Name</label>
          <input className="sov-input"
            value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} />
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">Owner</label>
          <select className="sov-input"
            value={form.is_shared ? SHARED_OWNER : form.user_id}
            onChange={e => {
              const v = e.target.value;
              if (v === SHARED_OWNER) {
                setForm(f => ({ ...f, is_shared: true }));
              } else {
                setForm(f => ({ ...f, is_shared: false, user_id: Number(v) }));
              }
            }}>
            {users.map(u => <option key={u.id} value={u.id}>{u.name}</option>)}
            <option value={SHARED_OWNER}>Daixu (Shared)</option>
          </select>
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">Currency</label>
          <select className="sov-input"
            value={form.currency} onChange={e => setForm(f => ({ ...f, currency: e.target.value }))}>
            {CURRENCIES.map(c => <option key={c}>{c}</option>)}
          </select>
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">Type</label>
          <select className="sov-input"
            value={form.account_type} onChange={e => setForm(f => ({ ...f, account_type: e.target.value }))}>
            {ACCOUNT_TYPES.map(t => <option key={t}>{t}</option>)}
          </select>
        </div>
        <div className="col-span-2">
          <label className="block text-xs font-medium text-gray-600 mb-1">Provider</label>
          <select className="sov-input"
            value={form.provider} onChange={e => setForm(f => ({ ...f, provider: e.target.value }))}>
            {PROVIDERS.map(p => <option key={p}>{p}</option>)}
          </select>
        </div>
      </div>
      <div className="flex justify-end gap-2 pt-2">
        <button onClick={onCancel} className="px-3 py-1.5 text-sm text-gray-600 hover:text-gray-800">Cancel</button>
        <button onClick={() => onSave({ ...form, id: initial?.id })}
          disabled={!form.name}
          className="sov-btn px-4 py-1.5">
          {initial?.id ? 'Save Changes' : 'Add Account'}
        </button>
      </div>
    </div>
  );
}

// ---- Connection Panel ----

function ConnectionPanel({ account }: { account: Account }) {
  const queryClient = useQueryClient();
  const [expanded, setExpanded] = useState(false);
  const [selectedPairId, setSelectedPairId] = useState<number | ''>('');
  const [accessToken, setAccessToken] = useState('');
  const [message, setMessage] = useState('');
  const [redirecting, setRedirecting] = useState(false);

  const { data: keyPairs } = useQuery<KeyPair[]>({
    queryKey: ['key-pairs', account.provider],
    queryFn: () => api.listKeyPairs(account.provider),
    enabled: expanded,
  });

  const saveMutation = useMutation({
    mutationFn: () => api.configureIntegration(account.id, {
      provider: account.provider,
      key_pair_id: selectedPairId === '' ? undefined : selectedPairId,
      access_token: accessToken || undefined,
    }),
    onSuccess: () => { setMessage('✓ Integration saved'); queryClient.invalidateQueries({ queryKey: ['accounts'] }); },
    onError: (e: unknown) => setMessage(`✗ ${e instanceof Error ? e.message : 'Failed'}`),
  });

  async function handleTrueLayerConnect() {
    setRedirecting(true);
    try {
      const data = await api.getTrueLayerLinkUrl(account.id, window.location.origin);
      window.location.href = data.auth_url;
    } catch (e: unknown) {
      setMessage(`✗ ${e instanceof Error ? e.message : 'Failed'}`);
      setRedirecting(false);
    }
  }

  const isTrueLayer = account.provider === 'TrueLayer';
  const isPlaid = account.provider === 'Plaid';

  return (
    <div className="border-t border-gray-100">
      <button onClick={() => setExpanded(e => !e)}
        className="w-full flex items-center gap-2 px-4 py-2 text-left text-sm text-gray-600 hover:bg-gray-50">
        {expanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
        <Link className="h-4 w-4" /> Set up connection
        {account.provider !== 'Manual' && <span className="ml-auto text-xs text-gray-400">{account.provider}</span>}
      </button>

      {expanded && isPlaid && (
        <div className="px-4 pb-4 pt-1 bg-gray-50">
          <PlaidConnect account={account} />
        </div>
      )}

      {expanded && !isPlaid && (
        <div className="px-4 pb-4 space-y-3 bg-gray-50">
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Key Pair</label>
            <select value={selectedPairId}
              onChange={e => setSelectedPairId(e.target.value === '' ? '' : Number(e.target.value))}
              className="sov-input">
              <option value="">— use global app settings —</option>
              {(keyPairs ?? []).map(kp => (
                <option key={kp.id} value={kp.id}>{kp.name}</option>
              ))}
            </select>
          </div>

          {!isTrueLayer && (
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">
                Access Token / API Key
              </label>
              <input type="password" value={accessToken}
                onChange={e => setAccessToken(e.target.value)}
                placeholder="Leave blank to keep existing"
                className="sov-input" />
            </div>
          )}

          <div className="flex gap-2">
            {isTrueLayer ? (
              <button onClick={handleTrueLayerConnect} disabled={redirecting}
                className="sov-btn px-3 py-1.5">
                {redirecting ? <RefreshCw className="h-4 w-4 animate-spin" /> : <Link className="h-4 w-4" />}
                {redirecting ? 'Redirecting…' : 'Connect Bank'}
              </button>
            ) : (
              <button onClick={() => saveMutation.mutate()} disabled={saveMutation.isPending}
                className="sov-btn px-3 py-1.5">
                {saveMutation.isPending ? 'Saving…' : 'Save Connection'}
              </button>
            )}
          </div>
          {message && <p className={`text-xs ${message.startsWith('✓') ? 'text-green-600' : 'text-red-600'}`}>{message}</p>}
        </div>
      )}
    </div>
  );
}

// ---- Account Card ----

function AccountCard({ account, users, isEditing, onEdit, onCancelEdit, onSave, onDelete, userName }: {
  account: Account;
  users: { id: number; name: string }[];
  isEditing: boolean;
  onEdit: () => void;
  onCancelEdit: () => void;
  onSave: (d: AccountFormData & { id?: number }) => void;
  onDelete: () => void;
  userName: (userId: number) => string;
}) {
  return (
    <div className="sov-card overflow-hidden">
      {isEditing ? (
        <div className="p-5 border-b border-gray-100">
          <h2 className="text-base font-semibold text-gray-900 mb-4">Edit Account</h2>
          <AccountForm initial={account} users={users} onSave={onSave} onCancel={onCancelEdit} />
        </div>
      ) : (
        <div className="flex items-center gap-4 p-4">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="font-semibold text-gray-900">{account.name}</span>
              {[account.provider, account.account_type, account.currency].map(tag => (
                <span key={tag} className="text-xs bg-gray-100 text-gray-600 px-2 py-0.5 rounded-full">{tag}</span>
              ))}
            </div>
            <div className="text-sm text-gray-500 mt-0.5">
              {account.is_shared
                ? <span className="text-purple-600 font-medium">Daixu (Shared)</span>
                : userName(account.user_id)}
              {account.current_balance != null && (
                <span className="ml-3 font-medium text-gray-700">{formatCurrency(account.current_balance, account.currency)}</span>
              )}
              {account.last_synced_at && (
                <span className="ml-3 text-gray-400">synced {new Date(account.last_synced_at).toLocaleDateString()}</span>
              )}
            </div>
          </div>
          <div className="flex gap-1 flex-shrink-0">
            <button onClick={onEdit} className="p-1.5 text-gray-400 hover:text-blue-600 rounded">
              <Pencil className="h-4 w-4" />
            </button>
            <button onClick={onDelete} className="p-1.5 text-gray-400 hover:text-red-600 rounded">
              <Trash2 className="h-4 w-4" />
            </button>
          </div>
        </div>
      )}
      {account.provider !== 'Manual' && <ConnectionPanel account={account} />}
    </div>
  );
}

// ---- Main Manage Page ----

export default function Manage() {
  const queryClient = useQueryClient();
  const [showAdd, setShowAdd] = useState(false);
  const [editAccount, setEditAccount] = useState<Account | null>(null);

  const { data: users } = useQuery({ queryKey: ['users'], queryFn: () => api.getUsers() });
  const { data: accounts, isLoading } = useQuery<Account[]>({
    queryKey: ['accounts', 'all'],
    queryFn: () => api.getAccounts(),
  });

  const createMutation = useMutation({
    mutationFn: (d: Parameters<typeof api.createAccount>[0]) => api.createAccount(d),
    onSuccess: () => { setShowAdd(false); queryClient.invalidateQueries({ queryKey: ['accounts'] }); },
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, ...d }: { id: number } & Parameters<typeof api.updateAccount>[1]) =>
      api.updateAccount(id, d),
    onSuccess: () => { setEditAccount(null); queryClient.invalidateQueries({ queryKey: ['accounts'] }); },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: number) => api.deleteAccount(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['accounts'] }),
  });

  function userName(userId: number) {
    return (users as { id: number; name: string }[] | undefined)?.find(u => u.id === userId)?.name ?? '';
  }

  // Group cards by owner (Daixu shared pool first, then each user in id order),
  // and within an owner by account category (type), then name. Mirrors the
  // grouping on the Accounts page so both views read the same way.
  const ownerGroups = (() => {
    const byOwner = new Map<string, { label: string; order: number; rows: Account[] }>();
    for (const a of accounts ?? []) {
      const key = a.is_shared ? 'daixu' : `user-${a.user_id}`;
      const label = a.is_shared ? 'Daixu (Shared)' : userName(a.user_id);
      const order = a.is_shared ? -1 : a.user_id;
      if (!byOwner.has(key)) byOwner.set(key, { label, order, rows: [] });
      byOwner.get(key)!.rows.push(a);
    }
    const owners = [...byOwner.values()].sort((x, y) => x.order - y.order);
    // Split each owner's rows into category sub-groups (by account_type).
    return owners.map(owner => {
      const byCat = new Map<string, Account[]>();
      for (const a of owner.rows) {
        if (!byCat.has(a.account_type)) byCat.set(a.account_type, []);
        byCat.get(a.account_type)!.push(a);
      }
      const categories = [...byCat.entries()]
        .sort((a, b) => a[0].localeCompare(b[0]))
        .map(([category, rows]) => ({
          category,
          rows: rows.sort((x, y) => x.name.localeCompare(y.name) || x.id - y.id),
        }));
      return { ...owner, categories };
    });
  })();

  return (
    <div className="px-4 py-6 space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <h1 className="text-2xl sm:text-3xl font-bold text-gray-900">Manage Accounts</h1>
        <button onClick={() => setShowAdd(true)}
          className="sov-btn">
          <Plus className="h-4 w-4" /> Add Account
        </button>
      </div>

      {showAdd && (
        <div className="sov-card p-5">
          <h2 className="text-base font-semibold text-gray-900 mb-4">New Account</h2>
          <AccountForm users={users ?? []} onSave={d => createMutation.mutate(d)} onCancel={() => setShowAdd(false)} />
        </div>
      )}

      {isLoading ? <p className="text-gray-500">Loading…</p> : (
        <div className="space-y-8">
          {ownerGroups.map(owner => (
            <div key={owner.label} className="space-y-4">
              <div className="flex items-center gap-3">
                <h2 className="text-lg font-bold text-gray-900">{owner.label}</h2>
                <div className="flex-1 border-t border-gray-200" />
              </div>
              {owner.categories.map(cat => (
                <div key={cat.category} className="space-y-2">
                  <h3 className="text-xs font-semibold uppercase tracking-wider text-gray-400 pl-1">
                    {cat.category}
                  </h3>
                  {cat.rows.map(account => (
                    <AccountCard
                      key={account.id}
                      account={account}
                      users={users ?? []}
                      isEditing={editAccount?.id === account.id}
                      onEdit={() => setEditAccount(account)}
                      onCancelEdit={() => setEditAccount(null)}
                      onSave={d => updateMutation.mutate({ id: account.id, ...d })}
                      onDelete={() => { if (window.confirm(`Delete "${account.name}"?`)) deleteMutation.mutate(account.id); }}
                      userName={userName}
                    />
                  ))}
                </div>
              ))}
            </div>
          ))}
          {accounts?.length === 0 && (
            <div className="bg-white rounded-lg shadow-sm p-8 text-center text-gray-500">
              No accounts yet. Click "Add Account" to create one.
            </div>
          )}
        </div>
      )}
    </div>
  );
}
