import axios from 'axios';

// Use the same origin as the page (works through any reverse proxy).
// Set VITE_API_URL at build time to override (e.g. when backend is on a
// different host entirely).
const API_BASE_URL = import.meta.env.VITE_API_URL || `${window.location.origin}/api`;

const client = axios.create({
  baseURL: API_BASE_URL,
  headers: {
    'Content-Type': 'application/json',
  },
});

export const api = {
  // Users
  getUsers: async () => {
    const response = await client.get('/users/');
    return response.data;
  },

  createUser: async (data: { name: string; email?: string }) => {
    const response = await client.post('/users/', data);
    return response.data;
  },

  getUser: async (userId: number) => {
    const response = await client.get(`/users/${userId}`);
    return response.data;
  },

  addIncomeSource: async (userId: number, data: any) => {
    const response = await client.post(`/users/${userId}/income/`, data);
    return response.data;
  },

  getIncomeSources: async (userId: number) => {
    const response = await client.get(`/users/${userId}/income/`);
    return response.data;
  },

  // Accounts
  getAccounts: async (userId?: number) => {
    const params = userId ? { user_id: userId } : {};
    const response = await client.get('/accounts/', { params });
    return response.data;
  },

  createAccount: async (data: any) => {
    const response = await client.post('/accounts/', data);
    return response.data;
  },

  getAccount: async (accountId: number) => {
    const response = await client.get(`/accounts/${accountId}`);
    return response.data;
  },

  configureIntegration: async (accountId: number, data: any) => {
    const response = await client.post(`/accounts/${accountId}/integration`, data);
    return response.data;
  },

  deleteAccount: async (accountId: number) => {
    const response = await client.delete(`/accounts/${accountId}`);
    return response.data;
  },

  // Transactions
  getTransactions: async (params?: {
    account_id?: number;
    category?: string;
    start_date?: string;
    end_date?: string;
    limit?: number;
    offset?: number;
  }) => {
    const response = await client.get('/transactions/', { params });
    return response.data;
  },

  getTransaction: async (transactionId: number) => {
    const response = await client.get(`/transactions/${transactionId}`);
    return response.data;
  },

  updateTransaction: async (transactionId: number, data: { category_override?: string; notes?: string; is_hidden?: boolean }) => {
    const response = await client.patch(`/transactions/${transactionId}`, data);
    return response.data;
  },

  bulkCategorize: async (vendorKey: string, category: string): Promise<{ updated: number }> => {
    const response = await client.post('/transactions/bulk-categorize', { vendor_key: vendorKey, category });
    return response.data;
  },

  getCategorySummary: async (userId: number, params?: {
    start_date?: string;
    end_date?: string;
    currency?: string;
    expenses_only?: boolean;
  }) => {
    const response = await client.get('/transactions/summary/by-category', {
      params: { user_id: userId, ...params }
    });
    return response.data;
  },

  // Sync
  syncAccount: async (accountId: number, full = false, sinceDays?: number) => {
    const params: Record<string, unknown> = { full };
    if (sinceDays != null) params.since_days = sinceDays;
    const response = await client.post(`/sync/account/${accountId}`, null, { params });
    return response.data;
  },

  syncAllAccounts: async (full = false, sinceDays?: number) => {
    const params: Record<string, unknown> = { full };
    if (sinceDays != null) params.since_days = sinceDays;
    const response = await client.post('/sync/all', null, { params });
    return response.data;
  },

  getSyncStatus: async (accountId: number) => {
    const response = await client.get(`/sync/status/${accountId}`);
    return response.data;
  },

  // Provider settings
  getProviderSettings: async () => {
    const response = await client.get('/settings/providers');
    return response.data;
  },

  updateProviderSettings: async (values: Record<string, string>) => {
    const response = await client.put('/settings/providers', { values });
    return response.data;
  },

  // TrueLayer bank linking
  getTrueLayerLinkUrl: async (accountId: number, redirectBaseUrl: string) => {
    const response = await client.get('/truelayer/link', {
      params: { account_id: accountId, redirect_base_url: redirectBaseUrl },
    });
    return response.data;
  },

  exchangeTrueLayerCode: async (data: { account_id: number; code: string; redirect_uri: string }) => {
    const response = await client.post('/truelayer/exchange', data);
    return response.data;
  },

  setTrueLayerAccount: async (data: {
    mof_account_id: number;
    tl_account_id: string;
    access_token: string;
    refresh_token: string;
    token_expires_in?: number;
    is_card?: boolean;
  }) => {
    const response = await client.post('/truelayer/set-account', data);
    return response.data;
  },

  // Exchange rates (GBP <-> USD)
  getFxRates: async () => {
    const response = await client.get('/fx/rates');
    return response.data as {
      GBP_USD: number; USD_GBP: number; updated_at: string | null; stale: boolean;
    };
  },

  // Plaid bank linking (USD accounts)
  createPlaidLinkToken: async (accountId: number, keyPairId?: number) => {
    const response = await client.post('/plaid/link-token', {
      account_id: accountId, key_pair_id: keyPairId,
    });
    return response.data as { link_token: string };
  },

  exchangePlaidPublicToken: async (publicToken: string, keyPairId?: number) => {
    const response = await client.post('/plaid/exchange', {
      public_token: publicToken, key_pair_id: keyPairId,
    });
    return response.data as {
      access_token: string;
      item_id: string;
      accounts: PlaidLinkAccount[];
    };
  },

  setPlaidAccount: async (data: {
    mof_account_id: number;
    plaid_account_id: string;
    access_token: string;
    item_id: string;
    key_pair_id?: number;
  }) => {
    const response = await client.post('/plaid/set-account', data);
    return response.data;
  },

  // Account management
  updateAccount: async (accountId: number, data: {
    name?: string; account_type?: string; currency?: string;
    provider?: string; is_active?: boolean; is_shared?: boolean;
  }) => {
    const response = await client.put(`/accounts/${accountId}`, data);
    return response.data;
  },

  // Provider key pairs
  listKeyPairs: async (provider?: string) => {
    const response = await client.get('/key-pairs/', { params: provider ? { provider } : {} });
    return response.data;
  },
  createKeyPair: async (data: { provider: string; name: string; credentials: Record<string, string> }) => {
    const response = await client.post('/key-pairs/', data);
    return response.data;
  },
  updateKeyPair: async (id: number, data: { name?: string; credentials?: Record<string, string>; is_active?: boolean }) => {
    const response = await client.put(`/key-pairs/${id}`, data);
    return response.data;
  },
  deleteKeyPair: async (id: number) => {
    const response = await client.delete(`/key-pairs/${id}`);
    return response.data;
  },
  getKeyPairProviders: async () => {
    const response = await client.get('/key-pairs/providers');
    return response.data;
  },
};

export default api;

// ---- Shared types ----
export interface User {
  id: number;
  name: string;
  email: string | null;
  created_at: string;
}

export interface IncomeSource {
  id: number;
  name: string;
  amount: number;
  currency: string;
  frequency: string;
  is_active: boolean;
}

export interface Account {
  id: number;
  user_id: number;
  name: string;
  account_type: string;
  currency: string;
  provider: string;
  current_balance: number | null;
  last_synced_at: string | null;
  is_active: boolean;
  is_shared: boolean;
}

export interface PlaidLinkAccount {
  account_id: string;
  display_name: string;
  account_type: string;
  mask: string | null;
  currency: string;
  balance: number | null;
  available: number | null;
}

export interface Transaction {
  id: number;
  account_id: number;
  external_transaction_id: string | null;
  description: string;
  amount: number;
  currency: string;
  category: string;
  transaction_date: string;
  merchant_name: string | null;
  notes: string | null;
  category_override: string | null;
  is_hidden: boolean;
}

export interface CategorySummary {
  category: string;
  total: number;
  count: number;
}

export interface SyncResult {
  account_id: number;
  success: boolean;
  transactions_added: number;
  transactions_updated: number;
  error: string | null;
}

export interface ProviderField {
  key: string;
  label: string;
  secret: boolean;
  value: string | null;
  is_set: boolean;
}

export interface ProviderSettings {
  provider: string;
  fields: ProviderField[];
}

export interface KeyPairFieldMask {
  value: string | null;
  is_set: boolean;
  is_secret: boolean;
}

export interface KeyPair {
  id: number;
  provider: string;
  name: string;
  credentials_masked: Record<string, KeyPairFieldMask>;
  is_active: boolean;
  created_at: string;
}

export interface ProviderFieldDef {
  key: string;
  label: string;
  secret: boolean;
}

const CURRENCY_SYMBOLS: Record<string, string> = { GBP: '£', USD: '$' };

export function formatCurrency(amount: number | null | undefined, currency = 'GBP'): string {
  const symbol = CURRENCY_SYMBOLS[currency] ?? '';
  if (amount === null || amount === undefined) return `${symbol}—`;
  return `${symbol}${amount.toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}
