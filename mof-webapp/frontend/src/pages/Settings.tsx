import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Save, Plus, Trash2, Pencil } from 'lucide-react';
import { api, KeyPair, ProviderFieldDef } from '../services/api';

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
    </div>
  );
}
