import { useEffect, useRef, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { RefreshCw } from 'lucide-react';
import {
  api, formatCurrency, Account, KeyPair,
  SophtronAccount, SophtronJob,
} from '../services/api';

type Step = 'institution' | 'creds' | 'mfa' | 'accounts';

export default function SophtronConnect({ account }: { account: Account }) {
  const queryClient = useQueryClient();
  const [pairId, setPairId] = useState<number | ''>('');
  const [step, setStep] = useState<Step>('institution');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');

  const [instQuery, setInstQuery] = useState('');
  const [instResults, setInstResults] = useState<{ id: string; name: string }[]>([]);
  const [inst, setInst] = useState<{ id: string; name: string } | null>(null);

  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [pin, setPin] = useState('');

  const [jobId, setJobId] = useState<string | null>(null);
  const [uiId, setUiId] = useState<string | null>(null);
  const [job, setJob] = useState<SophtronJob | null>(null);
  const [mfaText, setMfaText] = useState('');

  const [accounts, setAccounts] = useState<SophtronAccount[]>([]);
  const pollRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const { data: keyPairs } = useQuery<KeyPair[]>({
    queryKey: ['key-pairs', 'Sophtron'],
    queryFn: () => api.listKeyPairs('Sophtron'),
  });
  const kpId = pairId === '' ? undefined : pairId;

  useEffect(() => () => { if (pollRef.current) clearTimeout(pollRef.current); }, []);

  const fail = (e: unknown, prefix: string) =>
    setMessage(`✗ ${prefix}: ${e instanceof Error ? e.message : 'failed'}`);

  async function searchInstitutions() {
    setBusy(true); setMessage('');
    try {
      setInstResults(await api.searchSophtronInstitutions(instQuery, kpId));
    } catch (e) { fail(e, 'Search'); } finally { setBusy(false); }
  }

  // Poll the job until it needs MFA, succeeds, or fails.
  function pollJob(id: string) {
    pollRef.current = setTimeout(async () => {
      try {
        const j = await api.getSophtronJob(id, kpId);
        setJob(j);
        if (j.state === 'mfa') { setStep('mfa'); setMfaText(''); setBusy(false); }
        else if (j.state === 'success') { setBusy(false); await loadAccounts(); }
        else if (j.state === 'failed') { setBusy(false); setMessage('✗ Login failed at the bank.'); }
        else pollJob(id); // pending
      } catch (e) { setBusy(false); fail(e, 'Job check'); }
    }, 3000);
  }

  async function login() {
    setBusy(true); setMessage('');
    try {
      const r = await api.sophtronLogin({
        institution_id: inst!.id, username, password, pin, key_pair_id: kpId,
      });
      setJobId(r.job_id); setUiId(r.user_institution_id);
      setMessage('Connecting to your bank…');
      pollJob(r.job_id);
    } catch (e) { setBusy(false); fail(e, 'Login'); }
  }

  async function submitMfa(extra: Record<string, unknown>) {
    if (!jobId) return;
    setBusy(true); setMessage('Submitting…');
    try {
      await api.answerSophtronMfa(jobId, { key_pair_id: kpId, ...extra });
      setMessage('Verifying…');
      pollJob(jobId);
    } catch (e) { setBusy(false); fail(e, 'MFA'); }
  }

  async function loadAccounts() {
    if (!uiId) return;
    setBusy(true); setMessage('');
    try {
      setAccounts(await api.getSophtronAccounts(uiId, kpId));
      setStep('accounts');
    } catch (e) { fail(e, 'Accounts'); } finally { setBusy(false); }
  }

  async function linkAccount(a: SophtronAccount) {
    setBusy(true); setMessage('');
    try {
      await api.setSophtronAccount({
        mof_account_id: account.id, sophtron_account_id: a.account_id,
        user_institution_id: uiId!, key_pair_id: kpId,
      });
      setMessage(`✓ Linked ${a.name}`);
      queryClient.invalidateQueries({ queryKey: ['accounts'] });
    } catch (e) { fail(e, 'Link'); } finally { setBusy(false); }
  }

  const input = 'w-full px-3 py-2 border border-gray-300 rounded-md text-sm bg-white';
  const btn = 'px-3 py-1.5 text-sm bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50';

  return (
    <div className="space-y-3">
      <div>
        <label className="block text-xs font-medium text-gray-600 mb-1">Key Pair (API User ID / Access Key)</label>
        <select value={pairId} disabled={step !== 'institution'}
          onChange={e => setPairId(e.target.value === '' ? '' : Number(e.target.value))}
          className={input}>
          <option value="">— use global app settings —</option>
          {(keyPairs ?? []).map(kp => <option key={kp.id} value={kp.id}>{kp.name}</option>)}
        </select>
      </div>

      <p className="text-[11px] text-amber-700 bg-amber-50 border border-amber-200 rounded p-2">
        Sophtron connects with your bank username and password. These are sent to
        Sophtron to establish the link and are not stored by this app.
      </p>

      {step === 'institution' && (
        <div className="space-y-2">
          <div className="flex gap-2">
            <input className={input} placeholder="Search bank (e.g. HSBC)" value={instQuery}
              onChange={e => setInstQuery(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && searchInstitutions()} />
            <button className={btn} disabled={busy || !instQuery} onClick={searchInstitutions}>Search</button>
          </div>
          {instResults.map(i => (
            <button key={i.id} onClick={() => { setInst(i); setStep('creds'); }}
              className="block w-full text-left px-3 py-2 text-sm border border-gray-200 rounded-md hover:bg-gray-50">
              {i.name}
            </button>
          ))}
        </div>
      )}

      {step === 'creds' && inst && (
        <div className="space-y-2">
          <div className="text-sm text-gray-700">Sign in to <span className="font-medium">{inst.name}</span></div>
          <input className={input} placeholder="Bank username" value={username}
            autoComplete="off" onChange={e => setUsername(e.target.value)} />
          <input className={input} type="password" placeholder="Bank password" value={password}
            autoComplete="off" onChange={e => setPassword(e.target.value)} />
          <input className={input} placeholder="PIN (if required)" value={pin}
            onChange={e => setPin(e.target.value)} />
          <div className="flex gap-2">
            <button className={btn} disabled={busy || !username || !password} onClick={login}>Connect</button>
            <button className="px-3 py-1.5 text-sm text-gray-500 hover:text-gray-700"
              onClick={() => { setStep('institution'); setInst(null); }}>Back</button>
          </div>
        </div>
      )}

      {step === 'mfa' && job?.mfa && (
        <div className="space-y-2">
          {job.mfa.type === 'security_question' && (
            <>
              <div className="text-sm text-gray-700">Security question(s): {job.mfa.questions}</div>
              <input className={input} placeholder='Answer(s) — e.g. ["ans1","ans2"]' value={mfaText}
                onChange={e => setMfaText(e.target.value)} />
              <button className={btn} disabled={busy} onClick={() => submitMfa({ security_answer: mfaText })}>Submit</button>
            </>
          )}
          {job.mfa.type === 'token_method' && (
            <>
              <div className="text-sm text-gray-700">Choose how to receive a verification code:</div>
              <div className="text-xs text-gray-500 break-words">{job.mfa.options}</div>
              <input className={input} placeholder="Paste the exact option string" value={mfaText}
                onChange={e => setMfaText(e.target.value)} />
              <button className={btn} disabled={busy} onClick={() => submitMfa({ token_choice: mfaText })}>Send code</button>
            </>
          )}
          {job.mfa.type === 'token_input' && (
            <>
              <div className="text-sm text-gray-700">Enter the verification code you received:</div>
              <input className={input} placeholder="Code" value={mfaText}
                onChange={e => setMfaText(e.target.value)} />
              <button className={btn} disabled={busy} onClick={() => submitMfa({ token_input: mfaText })}>Verify</button>
            </>
          )}
          {job.mfa.type === 'token_phone_verify' && (
            <>
              <div className="text-sm text-gray-700">Answer the call and read: <span className="font-medium">{job.mfa.read}</span></div>
              <button className={btn} disabled={busy} onClick={() => submitMfa({ verify_phone: true })}>I've done this</button>
            </>
          )}
          {job.mfa.type === 'captcha' && (
            <>
              <div className="text-sm text-gray-700">Enter the captcha:</div>
              {job.mfa.image && <img alt="captcha" src={job.mfa.image.startsWith('data:') ? job.mfa.image : `data:image/png;base64,${job.mfa.image}`} className="border rounded" />}
              <input className={input} placeholder="Captcha" value={mfaText}
                onChange={e => setMfaText(e.target.value)} />
              <button className={btn} disabled={busy} onClick={() => submitMfa({ captcha_input: mfaText })}>Submit</button>
            </>
          )}
        </div>
      )}

      {step === 'accounts' && (
        <div className="space-y-2">
          <div className="text-sm font-medium text-gray-700">Choose the account to link:</div>
          {accounts.length === 0 && <div className="text-sm text-gray-500">No accounts returned.</div>}
          {accounts.map(a => (
            <button key={a.account_id} disabled={busy} onClick={() => linkAccount(a)}
              className="flex items-center justify-between w-full px-3 py-2 text-sm border border-gray-200 rounded-md hover:bg-gray-50 disabled:opacity-50">
              <span>
                {a.name}{a.mask ? ` ••${a.mask}` : ''}
                <span className="text-gray-400"> · {a.account_type}</span>
              </span>
              <span className="text-gray-700">{formatCurrency(a.balance ?? 0, a.currency)}</span>
            </button>
          ))}
        </div>
      )}

      {busy && (
        <div className="flex items-center gap-2 text-sm text-gray-500">
          <RefreshCw className="h-4 w-4 animate-spin" /> Working…
        </div>
      )}
      {message && <div className="text-sm text-gray-700">{message}</div>}
    </div>
  );
}
