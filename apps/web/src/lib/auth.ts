import { create } from 'zustand';
import { api } from './api';

interface User {
  id: string;
  name: string;
  role: 'SUPER_ADMIN' | 'BRANCH_ADMIN' | 'COLLECTOR' | 'CUSTOMER';
  orgId: string;
  branchId?: string | null;
}

interface AuthState {
  user: User | null;
  isLoading: boolean;
  login: (phone: string, password: string, type: 'staff' | 'customer') => Promise<void>;
  register: (data: { name: string; phone: string; email?: string; password: string }) => Promise<void>;
  logout: () => void;
  hydrate: () => void;
}

export const useAuth = create<AuthState>((set) => ({
  user: null,
  isLoading: true,

  login: async (phone, password, type) => {
    const endpoint = type === 'staff' ? '/auth/staff/login' : '/auth/customer/login';
    const data = await api.post<{ accessToken: string; user: User }>(endpoint, { phone, password });
    localStorage.setItem('access_token', data.accessToken);
    localStorage.setItem('user', JSON.stringify(data.user));
    set({ user: data.user });
  },

  register: async (payload) => {
    const data = await api.post<{ accessToken: string; user: User }>(
      '/auth/customer/register',
      payload,
    );
    localStorage.setItem('access_token', data.accessToken);
    localStorage.setItem('user', JSON.stringify(data.user));
    set({ user: { ...data.user, role: 'CUSTOMER' } });
  },

  logout: () => {
    localStorage.removeItem('access_token');
    localStorage.removeItem('user');
    set({ user: null });
    window.location.href = '/login';
  },

  hydrate: () => {
    const stored = localStorage.getItem('user');
    if (stored) {
      try {
        set({ user: JSON.parse(stored), isLoading: false });
      } catch {
        set({ isLoading: false });
      }
    } else {
      set({ isLoading: false });
    }
  },
}));
