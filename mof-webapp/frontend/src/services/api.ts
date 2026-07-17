import axios from 'axios';

// VITE_API_URL can be set at build time for custom deployments.
// Otherwise, derive the backend URL from the current hostname at runtime —
// always port 8000 on the same host, regardless of which port/proxy serves
// the frontend. This makes it work from localhost, LAN IP, or a domain.
const API_BASE_URL =
  import.meta.env.VITE_API_URL ||
  `${window.location.protocol}//${window.location.hostname}:8000/api`;

const client = axios.create({
  baseURL: API_BASE_URL,
  headers: {
    'Content-Type': 'application/json',
  },
});

export const api = {
  // Users
  getUsers: async () => {
    const response = await client.get('/users');
    return response.data;
  },

  createUser: async (data: { name: string; email?: string }) => {
    const response = await client.post('/users', data);
    return response.data;
  },

  getUser: async (userId: number) => {
    const response = await client.get(`/users/${userId}`);
    return response.data;
  },

  addIncomeSource: async (userId: number, data: any) => {
    const response = await client.post(`/users/${userId}/income`, data);
    return response.data;
  },

  getIncomeSources: async (userId: number) => {
    const response = await client.get(`/users/${userId}/income`);
    return response.data;
  },

  // Accounts
  getAccounts: async (userId?: number) => {
    const params = userId ? { user_id: userId } : {};
    const response = await client.get('/accounts', { params });
    return response.data;
  },

  createAccount: async (data: any) => {
    const response = await client.post('/accounts', data);
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
    const response = await client.get('/transactions', { params });
    return response.data;
  },

  getTransaction: async (transactionId: number) => {
    const response = await client.get(`/transactions/${transactionId}`);
    return response.data;
  },

  updateTransaction: async (transactionId: number, data: any) => {
    const response = await client.patch(`/transactions/${transactionId}`, data);
    return response.data;
  },

  getCategorySummary: async (userId: number, params?: {
    start_date?: string;
    end_date?: string;
    currency?: string;
  }) => {
    const response = await client.get('/transactions/summary/by-category', {
      params: { user_id: userId, ...params }
    });
    return response.data;
  },

  // Sync
  syncAccount: async (accountId: number) => {
    const response = await client.post(`/sync/account/${accountId}`);
    return response.data;
  },

  syncAllAccounts: async () => {
    const response = await client.post('/sync/all');
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

const CURRENCY_SYMBOLS: Record<string, string> = { GBP: '£', USD: '$' };

export function formatCurrency(amount: number | null | undefined, currency = 'GBP'): string {
  const symbol = CURRENCY_SYMBOLS[currency] ?? '';
  if (amount === null || amount === undefined) return `${symbol}—`;
  return `${symbol}${amount.toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}
