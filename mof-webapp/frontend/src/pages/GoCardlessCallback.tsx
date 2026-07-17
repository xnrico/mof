import { useEffect, useState } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { useQuery, useMutation } from '@tanstack/react-query';
import { CheckCircle, AlertCircle, Loader } from 'lucide-react';
import { api, formatCurrency } from '../services/api';

interface GCAccount {
  id: string;
  name: string;
  iban: string | null;
  currency: string;
  balance: number | null;
}

interface Requisition {
  requisition_id: string;
  status: string;
  institution_id: string;
  accounts: GCAccount[];
}

export default function GoCardlessCallback() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const mofAccountId = Number(params.get('account_id'));
  const [linked, setLinked] = useState(false);
  const [linkError, setLinkError] = useState('');

  const { data: req, isLoading, error } = useQuery<Requisition>({
    queryKey: ['gc-requisition', mofAccountId],
    queryFn: () => api.getGCRequisition(mofAccountId),
    enabled: !!mofAccountId,
    retry: 2,
  });

  const setAccount = useMutation({
    mutationFn: (gcAccountId: string) =>
      api.setGCAccount({
        mof_account_id: mofAccountId,
        gc_account_id: gcAccountId,
        requisition_id: req!.requisition_id,
      }),
    onSuccess: () => setLinked(true),
    onError: (e: unknown) =>
      setLinkError(e instanceof Error ? e.message : 'Failed to link account'),
  });

  if (!mofAccountId) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="bg-white rounded-lg shadow p-8 max-w-md w-full text-center">
          <AlertCircle className="h-12 w-12 text-red-500 mx-auto mb-4" />
          <h2 className="text-xl font-semibold text-gray-900 mb-2">Missing account ID</h2>
          <p className="text-gray-500 mb-4">No account_id in the callback URL.</p>
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
          <p className="text-gray-500 mb-6">Your bank is connected and ready to sync.</p>
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
          Select which bank account to link to your Ministry of Finance account.
        </p>

        {isLoading && (
          <div className="flex items-center gap-3 text-gray-500 py-8 justify-center">
            <Loader className="h-5 w-5 animate-spin" />
            Loading your accounts…
          </div>
        )}

        {error && (
          <div className="flex items-center gap-2 text-red-600 bg-red-50 p-4 rounded-md">
            <AlertCircle className="h-5 w-5 flex-shrink-0" />
            <span>Could not load accounts. Your bank authorisation may still be in progress — wait a moment and refresh.</span>
          </div>
        )}

        {req && req.status !== 'LN' && (
          <div className="flex items-center gap-2 text-amber-600 bg-amber-50 p-4 rounded-md mb-4">
            <AlertCircle className="h-5 w-5 flex-shrink-0" />
            <span>Requisition status: <strong>{req.status}</strong> — bank authorisation may be pending. Refresh the page in a moment.</span>
          </div>
        )}

        {req?.accounts && req.accounts.length > 0 && (
          <div className="space-y-3">
            {req.accounts.map((a) => (
              <div
                key={a.id}
                className="flex items-center justify-between border border-gray-200 rounded-lg p-4 hover:border-blue-300"
              >
                <div>
                  <div className="font-medium text-gray-900">{a.name}</div>
                  {a.iban && <div className="text-xs text-gray-400 font-mono">{a.iban}</div>}
                  <div className="text-sm text-gray-500">
                    {a.balance != null ? formatCurrency(a.balance, a.currency) : a.currency}
                  </div>
                </div>
                <button
                  onClick={() => setAccount.mutate(a.id)}
                  disabled={setAccount.isPending}
                  className="px-4 py-2 bg-blue-600 text-white text-sm rounded-md hover:bg-blue-700 disabled:opacity-50"
                >
                  {setAccount.isPending && setAccount.variables === a.id ? 'Linking…' : 'Use this account'}
                </button>
              </div>
            ))}
          </div>
        )}

        {linkError && (
          <p className="mt-4 text-sm text-red-600">{linkError}</p>
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
