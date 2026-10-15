// ====================================================================
// ArtoCamello — Auth Context (Global State)
// ====================================================================
import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { User, UserRole } from '@/domain/types';
import {
  getCurrentAuth, getCurrentUser, login as loginService,
  logout as logoutService, register as registerService,
  updateRole as updateRoleService,
  AuthState,
} from '@/services/authService';

interface AuthContextType {
  auth: AuthState;
  user: User | null;
  login: (email: string, password: string) => Promise<User>;
  register: (data: { email: string; password: string; fullName: string; role: UserRole; phone?: string }) => Promise<{ requiresVerification: boolean, message: string; user?: User }>;
  updateRole: (role: 'client' | 'pro') => Promise<User>;
  logout: () => void;
  isClient: boolean;
  isPro: boolean;
  isGuest: boolean;
  refresh: () => void;
}

const AuthContext = createContext<AuthContextType | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [auth, setAuth] = useState<AuthState>(getCurrentAuth());
  const [user, setUser] = useState<User | null>(getCurrentUser());

  const refresh = useCallback(() => {
    setAuth(getCurrentAuth());
    setUser(getCurrentUser());
  }, []);

  useEffect(() => {
    const handler = () => refresh();
    window.addEventListener('auth-status-changed', handler);
    return () => window.removeEventListener('auth-status-changed', handler);
  }, [refresh]);

  const login = useCallback(async (email: string, password: string) => {
    const u = await loginService(email, password);
    refresh();
    return u;
  }, [refresh]);

  const register = useCallback(async (data: { email: string; password: string; fullName: string; role: UserRole; phone?: string }) => {
    const response = await registerService(data);
    refresh();
    return response;
  }, [refresh]);

  const updateRole = useCallback(async (role: 'client' | 'pro') => {
    const u = await updateRoleService(role);
    refresh();
    return u;
  }, [refresh]);

  const logout = useCallback(() => {
    logoutService();
    refresh();
  }, [refresh]);

  const value: AuthContextType = {
    auth,
    user,
    login,
    register,
    updateRole,
    logout,
    isClient: auth.role === UserRole.CLIENT,
    isPro: auth.role === UserRole.PROFESSIONAL,
    isGuest: !auth.isAuthenticated,
    refresh,
  };

  return React.createElement(AuthContext.Provider, { value }, children);
}

export function useAuth(): AuthContextType {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
