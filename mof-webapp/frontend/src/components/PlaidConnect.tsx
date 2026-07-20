import { useEffect, useState } from 'react';
import { usePlaidLink } from 'react-plaid-link';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link, RefreshCw } from 'lucide-react';
import { api, formatCurrency, Account, KeyPair, PlaidLinkAccount } from '../services/api';

interface ExchangeResult {
  access_token: string;
  item_id: string;
  accounts: PlaidLinkAccount[];
}

export default function PlaidConnect({ account }: { account: Account }) {
  const queryClient = useQueryClient();
  const [linkToken, setLinkToken] = useState<string | null>(null);
  const [exchange, setExchange] = useState<ExchangeResult | null>(null);
  const [message, setMessage] = useState('');
  const [loading, setLoading] = useState(false);
  const [pairId, setPairId] = useState<number | ''>('');

  const { data: keyPairs } = useQuery<KeyPair[]>({
    queryKey: ['key-pairs', 'Plaid'],
    queryFn: () => api.listKeyPairs('Plaid'),
  });

  const kpId = pairId === '' ? undefined : pairId;

  const exchangeMutation = useMutation({
    mutationFn: (publicToken: string) => api.exchangePlaidPublicToken(publicToken, kpId),
    onSuccess: (data) => setExchange(data),
    onError: (e: unknown) => setMessage(`✗ ${e instanceof Error ? e.message : 'Exchange failed'}`),
  });

  const { open, ready } = usePlaidLink({
    token: linkToken,
    onSuccess: (publicToken) => {
      setMessage('');
      exchangeMutation.mutate(publicToken);
    },
    onExit: (err) => {
      if (err) setMessage(`✗ ${err.display_message || err.error_message || 'Link cancelled'}`);
      setLinkToken(null);
    },
  });

  // Once a link token is fetched and the widget is ready, open it automatically.
  useEffect(() => {
    if (linkToken && ready) open();
  }, [linkToken, ready, open]);

  async function handleConnect() {
    setLoading(true);
    setMessage('');
    setExchange(null);
    try {
      const { link_token } = await api.createPlaidLinkToken(account.id, kpId);
      setLinkToken(link_token);
    } catch (e: unknown) {
      setMessage(`✗ ${e instanceof Error ? e.message : 'Could not start Plaid'}`);
    } finally {
      setLoading(false);
    }
  }

  const setAccountMutation = useMutation({
    mutationFn: (acc: PlaidLinkAccount) =>
      api.setPlaidAccount({
        mof_account_id: account.id,
        plaid_account_id: acc.account_id,
        access_token: exchange!.access_token,
        item_id: exchange!.item_id,
        key_pair_id: kpId,
      }),
    onSuccess: () => {
      setMessage('✓ Account linked — ready to sync');
      setExchange(null);
      queryClient.invalidateQueries({ queryKey: ['accounts'] });
    },
    onError: (e: unknown) => setMessage(`✗ ${e instanceof Error ? e.message : 'Failed to link'}`),
  });

  const busy = loading || exchangeMutation.isPending;

  return (
    <div className="space-y-3">
      <div>
        <label className="block text-xs font-medium text-gray-600 mb-1">Key Pair (Client ID / Secret)</label>
        <select value={pairId}
          onChange={e => setPairId(e.target.value === '' ? '' : Number(e.target.value))}
          className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm bg-white">
          <option value="">— use global app settings —</option>
          {(keyPairs ?? []).map(kp => (
            <option key={kp.id} value={kp.id}>{kp.name}</option>
          ))}
        </select>
        <p className="text-[11px] text-gray-400 mt-1">
          Add pairs (with env = sandbox/production) under Settings → Key Pairs.
        </p>
      </div>
      <button
        onClick={handleConnect}
        disabled={busy}
        className="flex items-center gap-2 px-3 py-1.5 text-sm bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50"
      >
        {busy ? <RefreshCw className="h-4 w-4 animate-spin" /> : <Link className="h-4 w-4" />}
        {busy ? 'Connecting…' : 'Connect with Plaid'}
      </button>

      {exchange?.accounts && exchange.accounts.length > 0 && (
        <div className="space-y-2">
          <p className="text-xs text-gray-500">Select which account to link:</p>
          {exchange.accounts.map((a) => (
            <div key={a.account_id}
              className="flex items-center justify-between border border-gray-200 rounded-md p-3 bg-white">
              <div>
                <div className="font-medium text-sm text-gray-900">
                  {a.display_name}{a.mask ? ` ••${a.mask}` : ''}
                </div>
                <div className="text-xs text-gray-400">{a.account_type}</div>
                {a.balance != null && (
                  <div className="text-xs text-gray-600 mt-0.5">
                    {formatCurrency(a.balance, a.currency)}
                  </div>
                )}
              </div>
              <button
                onClick={() => setAccountMutation.mutate(a)}
                disabled={setAccountMutation.isPending}
                className="px-3 py-1.5 text-sm bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50 flex-shrink-0 ml-3"
              >
                {setAccountMutation.isPending && setAccountMutation.variables?.account_id === a.account_id
                  ? 'Linking…' : 'Use this'}
              </button>
            </div>
          ))}
        </div>
      )}

      {message && (
        <p className={`text-xs ${message.startsWith('✓') ? 'text-green-600' : 'text-red-600'}`}>{message}</p>
      )}
    </div>
  );
}
