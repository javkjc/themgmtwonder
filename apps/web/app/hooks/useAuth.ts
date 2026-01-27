'use client';

import { useState, useEffect, useCallback } from 'react';
import { apiFetchJson, isUnauthorized, isNetworkError } from '../lib/api';

export type Me = {
  userId: string;
  email: string;
  mustChangePassword: boolean;
  role: string;
  isAdmin: boolean;
};

export type AuthState = {
  me: Me | null;
  loading: boolean;
  initialLoad: boolean;
  error: string | null;
};

export type AuthActions = {
  login: (email: string, password: string) => Promise<boolean>;
  register: (email: string, password: string) => Promise<boolean>;
  logout: () => Promise<void>;
  changePassword: (currentPassword: string, newPassword: string) => Promise<boolean>;
  clearError: () => void;
  refreshMe: () => Promise<void>;
  requestPasswordReset: (
    email: string,
  ) => Promise<{ success: boolean; resetToken?: string | null; expiresAt?: string | null; error?: string }>;
  resetPasswordWithToken: (
    token: string,
    newPassword: string,
  ) => Promise<{ success: boolean; error?: string }>;
};

export function useAuth(): AuthState & AuthActions {
  const [me, setMe] = useState<Me | null>(null);
  const [loading, setLoading] = useState(true);
  const [initialLoad, setInitialLoad] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const clearError = useCallback(() => {
    setError(null);
  }, []);

  const refreshMe = useCallback(async () => {
    try {
      const meJson = await apiFetchJson('/auth/me');
      setMe(meJson);
    } catch (e: any) {
      if (isUnauthorized(e)) {
        setMe(null);
        setError(null);
        return;
      }
      if (isNetworkError(e)) {
        setMe(null);
        setError('API not reachable. Is the API container running on http://localhost:3000 ?');
        return;
      }
      setMe(null);
      setError(e?.message || 'Failed to fetch user');
    }
  }, []);

  const login = useCallback(async (email: string, password: string): Promise<boolean> => {
    setError(null);
    try {
      await apiFetchJson('/auth/login', {
        method: 'POST',
        body: JSON.stringify({ email, password }),
      });
      await refreshMe();
      return true;
    } catch (e: any) {
      if (isNetworkError(e)) {
        setError('API not reachable. Is the API container running?');
        return false;
      }
      setError(e?.message || 'Login failed. Check email/password.');
      return false;
    }
  }, [refreshMe]);

  const register = useCallback(async (email: string, password: string): Promise<boolean> => {
    setError(null);
    try {
      await apiFetchJson('/auth/register', {
        method: 'POST',
        body: JSON.stringify({ email, password }),
      });

      // auto-login after register
      await apiFetchJson('/auth/login', {
        method: 'POST',
        body: JSON.stringify({ email, password }),
      });

      await refreshMe();
      return true;
    } catch (e: any) {
      if (isNetworkError(e)) {
        setError('API not reachable. Is the API container running?');
        return false;
      }
      if (e?.status === 409) {
        setError('User/Email is unavailable. Please choose another.');
        return false;
      }
      setError(e?.message || 'Register failed.');
      return false;
    }
  }, [refreshMe]);

  const logout = useCallback(async () => {
    setError(null);
    try {
      await apiFetchJson('/auth/logout', { method: 'POST', body: JSON.stringify({}) });
    } catch {
      // even if logout request fails, clear UI state
    } finally {
      setMe(null);
    }
  }, []);

  const changePassword = useCallback(async (currentPassword: string, newPassword: string): Promise<boolean> => {
    setError(null);

    if (!currentPassword || !newPassword) {
      setError('Please fill in all password fields.');
      return false;
    }
    if (newPassword.length < 8) {
      setError('New password must be at least 8 characters.');
      return false;
    }

    try {
      await apiFetchJson('/auth/change-password', {
        method: 'POST',
        body: JSON.stringify({ currentPassword, newPassword }),
      });

      // API clears cookie -> you are logged out now
      setMe(null);
      setError(null);
      return true;
    } catch (e: any) {
      if (isUnauthorized(e)) {
        setError('Current password is incorrect, or session expired.');
        return false;
      }
      setError(e?.message || 'Change password failed.');
      return false;
    }
  }, []);

  const requestPasswordReset = useCallback(
    async (
      email: string,
    ): Promise<{
      success: boolean;
      resetToken?: string | null;
      expiresAt?: string | null;
      error?: string;
    }> => {
      try {
        const res = await apiFetchJson('/auth/forgot-password', {
          method: 'POST',
          body: JSON.stringify({ email }),
        });
        return {
          success: true,
          resetToken: (res as any)?.resetToken ?? null,
          expiresAt: (res as any)?.expiresAt ?? null,
        };
      } catch (e: any) {
        return {
          success: false,
          error: e?.message || 'Unable to start password reset.',
        };
      }
    },
    [],
  );

  const resetPasswordWithToken = useCallback(
    async (
      token: string,
      newPassword: string,
    ): Promise<{ success: boolean; error?: string }> => {
      try {
        await apiFetchJson('/auth/reset-password', {
          method: 'POST',
          body: JSON.stringify({ token, newPassword }),
        });
        return { success: true };
      } catch (e: any) {
        return {
          success: false,
          error: e?.message || 'Reset password failed.',
        };
      }
    },
    [],
  );

  // Initial auth check
  useEffect(() => {
    const checkAuth = async () => {
      setLoading(true);
      try {
        const meJson = await apiFetchJson('/auth/me');
        setMe(meJson);
      } catch (e: any) {
        if (isUnauthorized(e)) {
          setMe(null);
          setError(null);
        } else if (isNetworkError(e)) {
          setMe(null);
          setError('API not reachable. Is the API container running on http://localhost:3000 ?');
        } else {
          setMe(null);
          setError(e?.message || 'Failed');
        }
      } finally {
        setLoading(false);
        setInitialLoad(false);
      }
    };

    checkAuth();
  }, []);

  return {
    me,
    loading,
    initialLoad,
    error,
    login,
    register,
    logout,
    changePassword,
    clearError,
    refreshMe,
    requestPasswordReset,
    resetPasswordWithToken,
  };
}
