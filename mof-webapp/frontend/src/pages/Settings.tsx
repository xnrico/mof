import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Save, CheckCircle, AlertCircle } from 'lucide-react';
import { api, Account, ProviderSettings } from '../services/api';

// ---- Provider Keys Section ----

function ProviderBadge({ provider }: { provider: string }) {
  const colors: Record<string, string> = {
    Plaid: 'bg-indigo-100 text-indigo-800',
    GoCardless: 'bg-emerald-100 text-emerald-800',
    IBKR: 'bg-amber-100 text-amber-800',
    Trading212: 'bg-sky-100 text-sky-800',
  };
  return (
    <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${colors[provider] ?? 'bg-gray-100 text-gray-800'}`}>
      {provider}
    </span>
  );
}

function ProviderCard({ ps, onSave }: { ps: ProviderSettings; onSave: (vals: Record<string, string>) => void }) {
  const [draft, setDraft] = useState<Record<string, string>>({});
  const [saved, setSaved] = useState(false);

  function handleSave() {
    onSave(draft);
    setDraft({});
    setSaved(true);
    setTimeout(() => setSaved(false), 2500);
  }

  const isDirty = Object.keys(draft).some((k) => draft[k] !== '');

  return (
    <div className="bg-white rounded-lg shadow-sm p-5 space-y-4">
      <div className="flex items-center justify-between">
        <ProviderBadge provider={ps.provider} />
        {saved && (
          <span className="flex items-center gap-1 text-green-600 text-sm">
            <CheckCircle className="h-4 w-4" /> Saved
          </span>
        )}
      </div>

      <div className="space-y-3">
        {ps.fields.map((f) => (
          <div key={f.key}>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              {f.label}
              {f.is_set && !f.secret && (
                <span className="ml-2 text-xs text-gray-400">(currently set)</span>
              )}
              {f.is_set && f.secret && (
                <span className="ml-2 text-xs text-green-600">● active</span>
              )}
              {!f.is_set && (
                <span className="ml-2 text-xs text-amber-500">
                  <AlertCircle className="inline h-3 w-3 mr-0.5" />not set
                </span>
              )}
            </label>
            <input
              type={f.secret ? 'password' : 'text'}
              placeholder={f.secret ? (f.is_set ? '••••••• (leave blank to keep)' : 'Enter value…') : (f.value ?? '')}
              value={draft[f.key] ?? ''}
              onChange={(e) => setDraft((d) => ({ ...d, [f.key]: e.target.value }))}
              className="w-full px-3 py-2 rounded-md border border-gray-300 text-sm"
            />
          </div>
        ))}
      </div>

      <button
        onClick={handleSave}
        disabled={!isDirty}
        className="flex items-center gap-2 px-4 py-2 rounded-md bg-blue-600 text-white text-sm font-medium hover:bg-blue-700 disabled:opacity-40 disabled:cursor-not-allowed"
      >
        <Save className="h-4 w-4" />
        Save {ps.provider} Keys
      </button>
    </div>
  );
}

function ProviderKeysSection() {
  const queryClient = useQueryClient();
  const { data: providers, isLoading } = useQuery<ProviderSettings[]>({
    queryKey: ['provider-settings'],
    queryFn: () => api.getProviderSettings(),
  });

  const mutation = useMutation({
    mutationFn: (values: Record<string, string>) => api.updateProviderSettings(values),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['provider-settings'] }),
  });

  if (isLoading) return <p className="text-gray-500 text-sm">Loading provider settings…</p>;

  return (
    <div className="space-y-4">
      {(providers ?? []).map((ps) => (
        <ProviderCard key={ps.provider} ps={ps} onSave={(vals) => mutation.mutate(vals)} />
      ))}
    </div>
  );
}

// ---- Per-Account Integration Section ----

function AccountIntegrationSection() {
  const queryClient = useQueryClient();
  const [accountId, setAccountId] = useState<number | ''>('');
  const [accessToken, setAccessToken] = useState('');
  const [itemId, setItemId] = useState('');
  const [configData, setConfigData] = useState('');
  const [message, setMessage] = useState('');

  const { data: accounts } = useQuery<Account[]>({
    queryKey: ['accounts', 'all'],
    queryFn: () => api.getAccounts(),
  });

  const selected = accounts?.find((a) => a.id === accountId);

  const mutation = useMutation({
    mutationFn: () =>
      api.configureIntegration(accountId as number, {
        provider: selected?.provider,
        access_token: accessToken || null,
        item_id: itemId || null,
        config_data: configData || null,
      }),
    onSuccess: () => {
      setMessage('✓ Integration saved');
      setAccessToken(''); setItemId(''); setConfigData('');
      queryClient.invalidateQueries({ queryKey: ['accounts'] });
    },
    onError: (err: unknown) => {
      setMessage(`✗ ${err instanceof Error ? err.message : 'Save failed'}`);
    },
  });

  return (
    <div className="bg-white rounded-lg shadow-sm p-6 space-y-4">
      <h2 className="text-lg font-semibold text-gray-900">Link Account to Integration</h2>
      <p className="text-sm text-gray-500">
        Assign a per-account access token / item ID so the sync can pull transactions for that account.
      </p>

      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">Account</label>
        <select
          value={accountId}
          onChange={(e) => { setAccountId(e.target.value === '' ? '' : Number(e.target.value)); setMessage(''); }}
          className="w-full px-3 py-2 rounded-md border border-gray-300 text-sm bg-white"
        >
          <option value="">Select an account…</option>
          {(accounts ?? []).map((a) => (
            <option key={a.id} value={a.id}>{a.name} ({a.provider})</option>
          ))}
        </select>
      </div>

      {selected && (
        <>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Access Token / API Key
            </label>
            <input
              type="password"
              value={accessToken}
              onChange={(e) => setAccessToken(e.target.value)}
              placeholder={selected.provider === 'Trading212' ? 'Trading 212 API key' : 'Access token'}
              className="w-full px-3 py-2 rounded-md border border-gray-300 text-sm"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Item ID / Requisition ID <span className="text-gray-400">(Plaid / GoCardless)</span>
            </label>
            <input
              type="text"
              value={itemId}
              onChange={(e) => setItemId(e.target.value)}
              className="w-full px-3 py-2 rounded-md border border-gray-300 text-sm"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Config Data <span className="text-gray-400">(JSON — e.g. IBKR host/port)</span>
            </label>
            <textarea
              value={configData}
              onChange={(e) => setConfigData(e.target.value)}
              rows={3}
              placeholder='{"account_id": "...", "host": "127.0.0.1", "port": 7497}'
              className="w-full px-3 py-2 rounded-md border border-gray-300 text-sm font-mono"
            />
          </div>
          <button
            onClick={() => mutation.mutate()}
            disabled={mutation.isPending}
            className="flex items-center gap-2 px-4 py-2 rounded-md bg-blue-600 text-white text-sm font-medium hover:bg-blue-700 disabled:opacity-50"
          >
            <Save className="h-4 w-4" />
            {mutation.isPending ? 'Saving…' : 'Save Integration'}
          </button>
          {message && (
            <p className={`text-sm ${message.startsWith('✓') ? 'text-green-600' : 'text-red-600'}`}>{message}</p>
          )}
        </>
      )}
    </div>
  );
}

// ---- Page ----

export default function Settings() {
  return (
    <div className="px-4 py-6 space-y-8 max-w-2xl">
      <h1 className="text-3xl font-bold text-gray-900">Settings</h1>

      <section className="space-y-3">
        <h2 className="text-xl font-semibold text-gray-800">Provider API Keys</h2>
        <p className="text-sm text-gray-500">
          Global credentials for each integration provider. Secrets are stored server-side and never
          echoed back. Leave a secret field blank to keep the current value.
        </p>
        <ProviderKeysSection />
      </section>

      <section className="space-y-3">
        <h2 className="text-xl font-semibold text-gray-800">Account Linking</h2>
        <AccountIntegrationSection />
      </section>
    </div>
  );
}
