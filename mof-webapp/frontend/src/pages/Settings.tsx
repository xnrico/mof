import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Save, ExternalLink, Loader, Plus, Trash2, Pencil } from 'lucide-react';
import { api, Account, KeyPair, ProviderFieldDef } from '../services/api';

// ---- Provider Key Pairs Section ----

function KeyPairRow({ pair, fields, onDelete }: {
  pair: KeyPair;
  fields: ProviderFieldDef[];
  onDelete: () => void;
}) {
  const queryClient = useQueryClient();
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(pair.name);
  const [draft, setDraft] = useState<Record<string, string>>({});
  const [saved, setSaved] = useState(false);

  const updateMutation = useMutation({
    mutationFn: () => api.updateKeyPair(pair.id, { name, credentials: draft }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['key-pairs'] });
      setEditing(false); setDraft({});
      setSaved(true); setTimeout(() => setSaved(false), 2000);
    },
  });

  return (
    <div className="border border-gray-200 rounded-md p-3 space-y-2">
      {editing ? (
        <>
          <input value={name} onChange={e => setName(e.target.value)}
            className="w-full px-2 py-1 text-sm border border-gray-300 rounded" placeholder="Name" />
          {fields.map(f => (
            <div key={f.key}>
              <label className="block text-xs text-gray-500 mb-0.5">{f.label}</label>
              <input
                type={f.secret ? 'password' : 'text'}
                value={draft[f.key] ?? ''}
                onChange={e => setDraft(d => ({ ...d, [f.key]: e.target.value }))}
                placeholder={f.secret && pair.credentials_masked[f.key]?.is_set ? '••••• (leave blank to keep)' : ''}
                className="w-full px-2 py-1 text-sm border border-gray-300 rounded"
              />
            </div>
          ))}
          <div className="flex gap-2 pt-1">
            <button onClick={() => updateMutation.mutate()} disabled={updateMutation.isPending}
              className="px-3 py-1 text-xs bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50">
              Save
            </button>
            <button onClick={() => { setEditing(false); setDraft({}); }}
              className="px-3 py-1 text-xs text-gray-600 hover:text-gray-800">Cancel</button>
          </div>
        </>
      ) : (
        <div className="flex items-center justify-between">
          <div>
            <span className="text-sm font-medium text-gray-900">{pair.name}</span>
            <span className="ml-2 text-xs text-gray-400">
              {fields.map(f => {
                const m = pair.credentials_masked[f.key];
                if (!m) return null;
                return (
                  <span key={f.key} className={`mr-2 ${m.is_set ? 'text-green-600' : 'text-amber-500'}`}>
                    {f.label}: {f.secret ? (m.is_set ? '●' : '○') : (m.value || '—')}
                  </span>
                );
              })}
            </span>
            {saved && <span className="ml-2 text-xs text-green-600">✓ saved</span>}
          </div>
          <div className="flex gap-1">
            <button onClick={() => setEditing(true)} className="p-1 text-gray-400 hover:text-blue-600">
              <Pencil className="h-3.5 w-3.5" />
            </button>
            <button onClick={onDelete} className="p-1 text-gray-400 hover:text-red-600">
              <Trash2 className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function KeyPairsSection() {
  const queryClient = useQueryClient();
  const [addingProvider, setAddingProvider] = useState<string | null>(null);
  const [newName, setNewName] = useState('');
  const [newCreds, setNewCreds] = useState<Record<string, string>>({});

  const { data: keyPairs } = useQuery<KeyPair[]>({ queryKey: ['key-pairs'], queryFn: () => api.listKeyPairs() });
  const { data: providerFields } = useQuery<Record<string, ProviderFieldDef[]>>({
    queryKey: ['key-pair-providers'], queryFn: () => api.getKeyPairProviders(),
  });

  const createMutation = useMutation({
    mutationFn: () => api.createKeyPair({ provider: addingProvider!, name: newName, credentials: newCreds }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['key-pairs'] });
      setAddingProvider(null); setNewName(''); setNewCreds({});
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: number) => api.deleteKeyPair(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['key-pairs'] }),
  });

  const PROVIDERS = Object.keys(providerFields ?? {}).filter(p => p !== 'Manual');

  return (
    <div className="bg-white rounded-lg shadow-sm p-5 space-y-4">
      {PROVIDERS.map(provider => {
        const fields = (providerFields ?? {})[provider] ?? [];
        const pairs = (keyPairs ?? []).filter(kp => kp.provider === provider);
        return (
          <div key={provider}>
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm font-semibold text-gray-700">{provider}</span>
              <button onClick={() => { setAddingProvider(provider); setNewName(''); setNewCreds({}); }}
                className="flex items-center gap-1 text-xs text-blue-600 hover:text-blue-800">
                <Plus className="h-3 w-3" /> Add pair
              </button>
            </div>

            {addingProvider === provider && (
              <div className="border border-blue-200 rounded-md p-3 mb-2 space-y-2 bg-blue-50">
                <input value={newName} onChange={e => setNewName(e.target.value)}
                  className="w-full px-2 py-1 text-sm border border-gray-300 rounded"
                  placeholder={`Name (e.g. "${provider} Sandbox")`} />
                {fields.map(f => (
                  <div key={f.key}>
                    <label className="block text-xs text-gray-500 mb-0.5">{f.label}</label>
                    <input type={f.secret ? 'password' : 'text'}
                      value={newCreds[f.key] ?? ''}
                      onChange={e => setNewCreds(d => ({ ...d, [f.key]: e.target.value }))}
                      className="w-full px-2 py-1 text-sm border border-gray-300 rounded" />
                  </div>
                ))}
                <div className="flex gap-2 pt-1">
                  <button onClick={() => createMutation.mutate()} disabled={!newName || createMutation.isPending}
                    className="px-3 py-1 text-xs bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50">
                    <Save className="inline h-3 w-3 mr-1" />Create
                  </button>
                  <button onClick={() => setAddingProvider(null)} className="px-3 py-1 text-xs text-gray-600">Cancel</button>
                </div>
              </div>
            )}

            {pairs.length === 0 && addingProvider !== provider && (
              <p className="text-xs text-gray-400 italic">No key pairs yet</p>
            )}
            <div className="space-y-2">
              {pairs.map(kp => (
                <KeyPairRow key={kp.id} pair={kp} fields={fields}
                  onDelete={() => { if (window.confirm(`Delete "${kp.name}"?`)) deleteMutation.mutate(kp.id); }} />
              ))}
            </div>
          </div>
        );
      })}
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

// ---- Page ----

export default function Settings() {
  return (
    <div className="px-4 py-6 space-y-8 max-w-2xl">
      <h1 className="text-3xl font-bold text-gray-900">Settings</h1>

      <section className="space-y-3">
        <h2 className="text-xl font-semibold text-gray-800">Provider Key Pairs</h2>
        <p className="text-sm text-gray-500">
          Named credential sets per provider. Assign a key pair to an account in the Manage tab
          to use specific credentials for that account (useful for mixing sandbox/live tokens).
        </p>
        <KeyPairsSection />
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
