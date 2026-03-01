/**
 * AuthContext.tsx — Global Authentication State Provider
 * =======================================================
 * Provides JWT-based authentication state across the entire React app.
 *
 * Storage strategy:
 *   - `token`  → localStorage `synergy_token`
 *   - `user`   → localStorage `synergy_user` (JSON-serialised)
 *   Both are hydrated synchronously on boot so there's zero flicker.
 *
 * Exports:
 *   AuthProvider   — Wrap <App /> with this to inject the context.
 *   useAuth()      — Hook to access { user, token, login, logout, isAuthenticated }.
 *
 * Usage:
 *   const { user, login, logout, isAuthenticated } = useAuth();
 */

import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react';
import { apiClient } from '@/lib/api';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface AuthUser {
  email: string;
  name: string;
  role: 'Admin' | 'Sales_Rep';
  bu: string | null;
}

interface LoginPayload {
  email: string;
  password: string;
}

interface LoginResponse {
  access_token: string;
  token_type: string;
  user: AuthUser;
}

interface AuthContextValue {
  /** The currently authenticated user, or null if not logged in. */
  user: AuthUser | null;
  /** Raw JWT access token, or null if not authenticated. */
  token: string | null;
  /** True when a valid token and user are present in state. */
  isAuthenticated: boolean;
  /**
   * Send credentials to POST /api/auth/login.
   * Sets token + user globally on success.
   * Throws on invalid credentials so the caller can display an error.
   */
  login: (payload: LoginPayload) => Promise<void>;
  /** Clears token and user from state and localStorage. */
  logout: () => void;
}

// ---------------------------------------------------------------------------
// Storage Keys
// ---------------------------------------------------------------------------

const STORAGE_TOKEN_KEY = 'synergy_token';
const STORAGE_USER_KEY = 'synergy_user';

// ---------------------------------------------------------------------------
// Context
// ---------------------------------------------------------------------------

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

// ---------------------------------------------------------------------------
// Provider
// ---------------------------------------------------------------------------

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [token, setToken] = useState<string | null>(() =>
    localStorage.getItem(STORAGE_TOKEN_KEY),
  );
  const [user, setUser] = useState<AuthUser | null>(() => {
    const raw = localStorage.getItem(STORAGE_USER_KEY);
    if (!raw) return null;
    try {
      return JSON.parse(raw) as AuthUser;
    } catch {
      return null;
    }
  });

  // Sync token to the Axios interceptor whenever it changes.
  // The actual injection is handled in api.ts — this effect ensures the
  // in-module token reference is always current.
  useEffect(() => {
    if (token) {
      localStorage.setItem(STORAGE_TOKEN_KEY, token);
    } else {
      localStorage.removeItem(STORAGE_TOKEN_KEY);
    }
  }, [token]);

  useEffect(() => {
    if (user) {
      localStorage.setItem(STORAGE_USER_KEY, JSON.stringify(user));
    } else {
      localStorage.removeItem(STORAGE_USER_KEY);
    }
  }, [user]);

  const login = useCallback(async (payload: LoginPayload): Promise<void> => {
    const response = await apiClient.post<LoginResponse>(
      '/api/auth/login',
      payload,
    );
    const { access_token, user: userProfile } = response.data;
    setToken(access_token);
    setUser(userProfile);
    // Persist immediately so page refreshes don't lose state.
    localStorage.setItem(STORAGE_TOKEN_KEY, access_token);
    localStorage.setItem(STORAGE_USER_KEY, JSON.stringify(userProfile));
  }, []);

  const logout = useCallback(() => {
    setToken(null);
    setUser(null);
    localStorage.removeItem(STORAGE_TOKEN_KEY);
    localStorage.removeItem(STORAGE_USER_KEY);
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({
      user,
      token,
      isAuthenticated: !!token && !!user,
      login,
      logout,
    }),
    [user, token, login, logout],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

/**
 * Access the global authentication context.
 * Must be used inside <AuthProvider>.
 *
 * @example
 *   const { user, login, logout, isAuthenticated } = useAuth();
 */
// eslint-disable-next-line react-refresh/only-export-components
export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error('useAuth() must be used within an <AuthProvider>.');
  }
  return ctx;
}
