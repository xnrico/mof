import axios from 'axios';

const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000/api';

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
};

export default api;
