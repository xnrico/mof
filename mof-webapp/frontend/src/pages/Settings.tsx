import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Save, CheckCircle, AlertCircle, ExternalLink, Loader } from 'lucide-react';
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

// ---- TrueLayer Bank Linking Section ----

function TrueLayerLinkSection() {
  const { data: accounts } = useQuery<Account[]>({
    queryKey: ['accounts', 'all'],
    queryFn: () => api.getAccounts(),
  });

  const tlAccounts = (accounts ?? []).filter((a) => a.provider === 'TrueLayer');
  const [mofAccountId, setMofAccountId] = useState<number | ''>('');
  const [redirecting, setRedirecting] = useState(false);
  const [error, setError] = useState('');

  async function handleConnect() {
    if (!mofAccountId) return;
    setError('');
    setRedirecting(true);
    try {
      const origin = window.location.origin;
      const data = await api.getTrueLayerLinkUrl(mofAccountId as number, origin);
      window.location.href = data.auth_url;
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Failed to start TrueLayer auth');
      setRedirecting(false);
    }
  }

  return (
    <div className="bg-white rounded-lg shadow-sm p-6 space-y-4">
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">
          Which account are you linking?
        </label>
        <select
          value={mofAccountId}
          onChange={(e) => { setMofAccountId(e.target.value === '' ? '' : Number(e.target.value)); setError(''); }}
          className="w-full px-3 py-2 rounded-md border border-gray-300 text-sm bg-white"
        >
          <option value="">Select a TrueLayer account…</option>
          {tlAccounts.map((a) => (
            <option key={a.id} value={a.id}>{a.name} ({a.currency})</option>
          ))}
        </select>
        {tlAccounts.length === 0 && (
          <p className="text-xs text-amber-600 mt-1">
            No TrueLayer accounts found. Add one with provider "TrueLayer" via the API first.
          </p>
        )}
      </div>

      {mofAccountId !== '' && (
        <div className="bg-blue-50 rounded-md p-4 space-y-3">
          <p className="text-sm text-gray-700">
            You'll be redirected to TrueLayer to select your bank and authorise read-only access.
            After completing the bank's auth flow you'll be brought back to confirm the account.
          </p>
          <button
            onClick={handleConnect}
            disabled={redirecting}
            className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white text-sm rounded-md hover:bg-blue-700 disabled:opacity-50"
          >
            {redirecting
              ? <><Loader className="h-4 w-4 animate-spin" /> Redirecting to TrueLayer…</>
              : <><ExternalLink className="h-4 w-4" /> Connect via TrueLayer</>
            }
          </button>
          {error && <p className="text-sm text-red-600">{error}</p>}
        </div>
      )}
    </div>
  );
}

// ---- GoCardless Bank Linking Section ----

interface Institution { id: string; name: string; logo: string | null; }

function GoCardlessLinkSection() {
  const [mofAccountId, setMofAccountId] = useState<number | ''>('');
  const [country, setCountry] = useState('GB');
  const [search, setSearch] = useState('');
  const [selectedInstitution, setSelectedInstitution] = useState<Institution | null>(null);
  const [redirecting, setRedirecting] = useState(false);

  const { data: accounts } = useQuery<Account[]>({
    queryKey: ['accounts', 'all'],
    queryFn: () => api.getAccounts(),
  });

  const gcAccounts = (accounts ?? []).filter((a) => a.provider === 'GoCardless');

  const { data: institutions, isLoading: loadingBanks, error: bankError } = useQuery<Institution[]>({
    queryKey: ['institutions', country],
    queryFn: () => api.getInstitutions(country),
    enabled: true,
    staleTime: 5 * 60 * 1000,
  });

  const filtered = (institutions ?? []).filter((i) =>
    i.name.toLowerCase().includes(search.toLowerCase())
  );

  const linkMutation = useMutation({
    mutationFn: () =>
      api.createGCLink({
        account_id: mofAccountId as number,
        institution_id: selectedInstitution!.id,
        redirect_base_url: `${window.location.protocol}//${window.location.hostname}:${window.location.port || (window.location.protocol === 'https:' ? '443' : '80')}`,
      }),
    onSuccess: (data) => {
      setRedirecting(true);
      window.location.href = data.auth_url;
    },
  });

  return (
    <div className="bg-white rounded-lg shadow-sm p-6 space-y-4">
      {/* Step 1: Select MoF account */}
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">
          1. Which account are you linking?
        </label>
        <select
          value={mofAccountId}
          onChange={(e) => { setMofAccountId(e.target.value === '' ? '' : Number(e.target.value)); setSelectedInstitution(null); }}
          className="w-full px-3 py-2 rounded-md border border-gray-300 text-sm bg-white"
        >
          <option value="">Select a GoCardless account…</option>
          {gcAccounts.map((a) => (
            <option key={a.id} value={a.id}>{a.name} ({a.currency})</option>
          ))}
        </select>
        {gcAccounts.length === 0 && (
          <p className="text-xs text-amber-600 mt-1">No GoCardless accounts found. Create one via the API or seed script first.</p>
        )}
      </div>

      {mofAccountId !== '' && (
        <>
          {/* Step 2: Country */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">2. Country</label>
            <select
              value={country}
              onChange={(e) => { setCountry(e.target.value); setSelectedInstitution(null); setSearch(''); }}
              className="w-full px-3 py-2 rounded-md border border-gray-300 text-sm bg-white"
            >
              {['GB','DE','FR','ES','IT','NL','BE','SE','NO','DK','FI','PL','AT','IE','PT'].map((c) => (
                <option key={c} value={c}>{c}</option>
              ))}
            </select>
          </div>

          {/* Step 3: Bank picker */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">3. Select your bank</label>
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search banks…"
              className="w-full px-3 py-2 rounded-md border border-gray-300 text-sm mb-2"
            />
            {loadingBanks && (
              <div className="flex items-center gap-2 text-gray-500 text-sm py-4 justify-center">
                <Loader className="h-4 w-4 animate-spin" /> Loading banks…
              </div>
            )}
            {bankError && (
              <p className="text-sm text-red-600">
                <AlertCircle className="inline h-4 w-4 mr-1" />
                Could not load banks — check GoCardless Secret ID/Key in Provider API Keys above.
              </p>
            )}
            <div className="max-h-56 overflow-y-auto border border-gray-200 rounded-md divide-y divide-gray-100">
              {filtered.slice(0, 50).map((inst) => (
                <button
                  key={inst.id}
                  onClick={() => setSelectedInstitution(inst)}
                  className={`w-full flex items-center gap-3 px-3 py-2 text-left hover:bg-blue-50 ${selectedInstitution?.id === inst.id ? 'bg-blue-50 border-l-4 border-blue-500' : ''}`}
                >
                  {inst.logo
                    ? <img src={inst.logo} alt="" className="h-6 w-6 object-contain flex-shrink-0" />
                    : <div className="h-6 w-6 bg-gray-200 rounded flex-shrink-0" />
                  }
                  <span className="text-sm text-gray-900">{inst.name}</span>
                  {selectedInstitution?.id === inst.id && (
                    <CheckCircle className="h-4 w-4 text-blue-600 ml-auto flex-shrink-0" />
                  )}
                </button>
              ))}
              {!loadingBanks && filtered.length === 0 && (
                <p className="text-sm text-gray-500 p-3">No banks found for "{search}"</p>
              )}
            </div>
          </div>

          {/* Step 4: Connect */}
          {selectedInstitution && (
            <div className="bg-blue-50 rounded-md p-4 space-y-3">
              <p className="text-sm text-gray-700">
                You'll be redirected to <strong>{selectedInstitution.name}</strong> to authorise
                read-only access. After completing the bank's auth flow you'll be brought back here
                to confirm the account.
              </p>
              <button
                onClick={() => linkMutation.mutate()}
                disabled={linkMutation.isPending || redirecting}
                className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white text-sm rounded-md hover:bg-blue-700 disabled:opacity-50"
              >
                {redirecting || linkMutation.isPending
                  ? <><Loader className="h-4 w-4 animate-spin" /> Redirecting…</>
                  : <><ExternalLink className="h-4 w-4" /> Connect to {selectedInstitution.name}</>
                }
              </button>
              {linkMutation.isError && (
                <p className="text-sm text-red-600">
                  {linkMutation.error instanceof Error ? linkMutation.error.message : 'Failed to create link'}
                </p>
              )}
            </div>
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

      <section className="space-y-3">
        <h2 className="text-xl font-semibold text-gray-800">Link GoCardless Bank Account</h2>
        <p className="text-sm text-gray-500">
          Connect a UK/EU bank account via GoCardless Open Banking. You'll be redirected
          to your bank to authorise access, then brought back here to confirm.
        </p>
        <GoCardlessLinkSection />
      </section>

      <section className="space-y-3">
        <h2 className="text-xl font-semibold text-gray-800">Link TrueLayer Bank Account (UK)</h2>
        <p className="text-sm text-gray-500">
          Connect a UK bank account via TrueLayer Open Banking. You'll be redirected
          to your bank to authorise read-only access, then brought back here to confirm.
        </p>
        <TrueLayerLinkSection />
      </section>
    </div>
  );
}
