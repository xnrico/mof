import { useEffect, useState } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { useMutation } from '@tanstack/react-query';
import { CheckCircle, AlertCircle, Loader } from 'lucide-react';
import { api, formatCurrency } from '../services/api';

interface TLAccount {
  account_id: string;
  display_name: string;
  account_type: string;
  currency: string;
  balance: number | null;
  available: number | null;
  account_number: { iban?: string; number?: string; sort_code?: string };
  is_card: boolean;
}

interface ExchangeResult {
  access_token: string;
  refresh_token: string;
  expires_in: number;
  accounts: TLAccount[];
}

export default function TrueLayerCallback() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  // TrueLayer returns account_id via the OAuth 'state' parameter
  const mofAccountId = Number(params.get('state'));
  const code = params.get('code');
  const error = params.get('error');

  const [exchangeResult, setExchangeResult] = useState<ExchangeResult | null>(null);
  const [linked, setLinked] = useState(false);
  const [linkError, setLinkError] = useState('');

  // redirect_uri must match exactly what was registered in TrueLayer Console
  // and what was sent in the auth request (no query params)
  const redirectUri = `${window.location.origin}/truelayer/callback`;

  const exchangeMutation = useMutation({
    mutationFn: () =>
      api.exchangeTrueLayerCode({ account_id: mofAccountId, code: code!, redirect_uri: redirectUri }),
    onSuccess: (data) => setExchangeResult(data),
    onError: (e: unknown) =>
      setLinkError(e instanceof Error ? e.message : 'Token exchange failed'),
  });

  const setAccountMutation = useMutation({
    mutationFn: (acc: TLAccount) =>
      api.setTrueLayerAccount({
        mof_account_id: mofAccountId,
        tl_account_id: acc.account_id,
        access_token: exchangeResult!.access_token,
        refresh_token: exchangeResult!.refresh_token,
        token_expires_in: exchangeResult!.expires_in,
        is_card: acc.is_card,
      }),
    onSuccess: () => setLinked(true),
    onError: (e: unknown) =>
      setLinkError(e instanceof Error ? e.message : 'Failed to save account'),
  });

  // Auto-exchange the code on mount
  useEffect(() => {
    if (code && mofAccountId && !exchangeResult && !linkError) {
      exchangeMutation.mutate();
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 p-4">
        <div className="bg-white rounded-lg shadow p-8 max-w-md w-full text-center">
          <AlertCircle className="h-12 w-12 text-red-500 mx-auto mb-4" />
          <h2 className="text-xl font-semibold text-gray-900 mb-2">Authorisation failed</h2>
          <p className="text-gray-500 mb-4">TrueLayer returned: <code className="text-red-600">{error}</code></p>
          <button onClick={() => navigate('/settings')} className="text-blue-600 hover:underline">
            Back to Settings
          </button>
        </div>
      </div>
    );
  }

  if (!code || !mofAccountId) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="bg-white rounded-lg shadow p-8 max-w-md w-full text-center">
          <AlertCircle className="h-12 w-12 text-red-500 mx-auto mb-4" />
          <h2 className="text-xl font-semibold text-gray-900 mb-2">Invalid callback</h2>
          <p className="text-gray-500 mb-4">Missing code or account_id in the callback URL.</p>
          <button onClick={() => navigate('/settings')} className="text-blue-600 hover:underline">
            Back to Settings
          </button>
        </div>
      </div>
    );
  }

  if (linked) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="bg-white rounded-lg shadow p-8 max-w-md w-full text-center">
          <CheckCircle className="h-12 w-12 text-green-500 mx-auto mb-4" />
          <h2 className="text-xl font-semibold text-gray-900 mb-2">Bank account linked!</h2>
          <p className="text-gray-500 mb-6">Your account is connected and ready to sync.</p>
          <button
            onClick={() => navigate('/accounts')}
            className="px-6 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700"
          >
            Go to Accounts
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 p-4">
      <div className="bg-white rounded-lg shadow p-8 max-w-lg w-full">
        <h2 className="text-2xl font-bold text-gray-900 mb-2">Bank Connected</h2>
        <p className="text-gray-500 mb-6">
          Select which account to link to your Ministry of Finance account.
        </p>

        {(exchangeMutation.isPending) && (
          <div className="flex items-center gap-3 text-gray-500 py-8 justify-center">
            <Loader className="h-5 w-5 animate-spin" />
            Exchanging authorisation code…
          </div>
        )}

        {linkError && (
          <div className="flex items-center gap-2 text-red-600 bg-red-50 p-4 rounded-md mb-4">
            <AlertCircle className="h-5 w-5 flex-shrink-0" />
            <span>{linkError}</span>
          </div>
        )}

        {exchangeResult?.accounts && exchangeResult.accounts.length > 0 && (
          <div className="space-y-3">
            {exchangeResult.accounts.map((a) => (
              <div
                key={a.account_id}
                className="flex items-center justify-between border border-gray-200 rounded-lg p-4 hover:border-blue-300"
              >
                <div>
                  <div className="font-medium text-gray-900 flex items-center gap-2">
                    {a.display_name}
                    {a.is_card && (
                      <span className="px-1.5 py-0.5 rounded text-[10px] font-medium bg-purple-100 text-purple-700">
                        CARD
                      </span>
                    )}
                  </div>
                  <div className="text-xs text-gray-400">{a.account_type}</div>
                  {a.account_number?.iban && (
                    <div className="text-xs text-gray-400 font-mono">{a.account_number.iban}</div>
                  )}
                  {a.account_number?.sort_code && (
                    <div className="text-xs text-gray-400">
                      {a.account_number.sort_code} / {a.account_number.number}
                    </div>
                  )}
                  <div className="text-sm text-gray-600 mt-1">
                    {a.balance != null
                      ? `Balance: ${formatCurrency(a.balance, a.currency)}`
                      : a.currency}
                    {a.available != null && a.available !== a.balance && (
                      <span className="ml-2 text-gray-400">(available: {formatCurrency(a.available, a.currency)})</span>
                    )}
                  </div>
                </div>
                <button
                  onClick={() => setAccountMutation.mutate(a)}
                  disabled={setAccountMutation.isPending}
                  className="px-4 py-2 bg-blue-600 text-white text-sm rounded-md hover:bg-blue-700 disabled:opacity-50 flex-shrink-0 ml-4"
                >
                  {setAccountMutation.isPending && setAccountMutation.variables?.account_id === a.account_id
                    ? 'Linking…'
                    : 'Use this account'}
                </button>
              </div>
            ))}
          </div>
        )}

        <button
          onClick={() => navigate('/settings')}
          className="mt-6 text-sm text-gray-500 hover:text-gray-700"
        >
          ← Back to Settings
        </button>
      </div>
    </div>
  );
}
