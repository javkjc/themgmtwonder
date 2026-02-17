'use client';

import { useEffect, useState, useCallback } from 'react';
import { apiFetchJson, isUnauthorized, isForbidden } from '../lib/api';
import type { Me } from '../types';
import Layout from '../components/Layout';
import ForcePasswordChange from '../components/ForcePasswordChange';
import { useToast } from '../components/ToastProvider';

type User = {
  id: string;
  email: string;
  createdAt: string;
  role: string;
  mustChangePassword: boolean;
  isAdmin: boolean;
};

export default function AdminPage() {
  const [me, setMe] = useState<Me | null>(null);
  const [loading, setLoading] = useState(true);
  const [authError, setAuthError] = useState<string | null>(null);

  // Toast
  const { showToast } = useToast();

  // User management state
  const [users, setUsers] = useState<User[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [loadingUsers, setLoadingUsers] = useState(false);

  // Reset password modal state
  const [resetModal, setResetModal] = useState<{ user: User; tempPassword?: string } | null>(null);
  const [resetting, setResetting] = useState(false);

  // Check auth on mount
  useEffect(() => {
    const checkAuth = async () => {
      try {
        const meJson = (await apiFetchJson('/auth/me')) as Me;
        setMe(meJson);
      } catch (e: any) {
        if (isUnauthorized(e)) {
          setMe(null);
        }
      } finally {
        setLoading(false);
      }
    };
    checkAuth();
  }, []);

  // Load users when auth is confirmed
  useEffect(() => {
    if (me && me.role === 'admin') {
      loadUsers();
    }
  }, [me]);

  const loadUsers = async (query?: string) => {
    setLoadingUsers(true);
    try {
      const url = query ? `/admin/users?q=${encodeURIComponent(query)}` : '/admin/users';
      const data = await apiFetchJson(url);
      setUsers(data as User[]);
    } catch (e: any) {
      if (isForbidden(e)) {
        showToast('Access denied: Admin privileges required', 'error');
        setTimeout(() => { window.location.href = '/'; }, 1500);
        return;
      }
      showToast(e?.message || 'Failed to load users', 'error');
    } finally {
      setLoadingUsers(false);
    }
  };

  const handleSearch = useCallback(() => {
    loadUsers(searchQuery);
  }, [searchQuery]);

  // ESC key handler for reset password modal
  useEffect(() => {
    if (!resetModal) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setResetModal(null);
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [resetModal]);

  const handleResetPassword = async (userId: string) => {
    setResetting(true);
    try {
      const result = await apiFetchJson(`/admin/users/${userId}/reset-password`, {
        method: 'POST',
        body: JSON.stringify({}),
      });
      // Update modal with temp password
      if (resetModal) {
        setResetModal({ ...resetModal, tempPassword: (result as any).tempPassword });
      }
      // Refresh users list
      loadUsers(searchQuery);
    } catch (e: any) {
      if (isForbidden(e)) {
        showToast('Access denied: Admin privileges required', 'error');
        setTimeout(() => { window.location.href = '/'; }, 1500);
        return;
      }
      showToast(e?.message || 'Failed to reset password', 'error');
    } finally {
      setResetting(false);
    }
  };

  const handleToggleAdmin = async (userId: string, currentIsAdmin: boolean) => {
    // Prevent self-demotion
    if (userId === me?.userId && currentIsAdmin) {
      showToast('You cannot demote yourself from admin', 'error');
      return;
    }

    try {
      await apiFetchJson(`/admin/users/${userId}/toggle-admin`, {
        method: 'POST',
        body: JSON.stringify({ isAdmin: !currentIsAdmin }),
      });
      showToast(currentIsAdmin ? 'Admin access removed' : 'Admin access granted', 'success');
      // Refresh users list
      loadUsers(searchQuery);
    } catch (e: any) {
      if (isForbidden(e)) {
        showToast('Access denied: Admin privileges required', 'error');
        setTimeout(() => { window.location.href = '/'; }, 1500);
        return;
      }
      showToast(e?.message || 'Failed to update admin status', 'error');
    }
  };

  const logout = async () => {
    try {
      await apiFetchJson('/auth/logout', { method: 'POST', body: JSON.stringify({}) });
    } catch {
      // Ignore
    } finally {
      setMe(null);
      window.location.href = '/';
    }
  };

  // Force password change handler
  const forceChangePassword = async (currentPassword: string, newPassword: string): Promise<boolean> => {
    try {
      await apiFetchJson('/auth/change-password', {
        method: 'POST',
        body: JSON.stringify({ currentPassword, newPassword }),
      });
      setMe(null);
      return true;
    } catch (e: any) {
      if (isUnauthorized(e)) {
        setAuthError('Current password is incorrect, or session expired.');
        return false;
      }
      setAuthError(e?.message || 'Change password failed.');
      return false;
    }
  };

  if (loading) {
    return null;
  }

  if (!me) {
    if (typeof window !== 'undefined') {
      window.location.href = '/';
    }
    return null;
  }

  // Force password change if required
  if (me.mustChangePassword) {
    return (
      <ForcePasswordChange
        email={me.email}
        onChangePassword={forceChangePassword}
        error={authError}
      />
    );
  }

  // Check admin access
  if (!me.isAdmin) {
    if (typeof window !== 'undefined') {
      window.location.href = '/';
    }
    return null;
  }

  return (
    <Layout currentPage="admin" userEmail={me.email} userRole={me.role} isAdmin={me.isAdmin} onLogout={logout}>
      {/* Header */}
      <div style={{ marginBottom: 32 }}>
        <h1 style={{ fontSize: 28, fontWeight: 700, fontFamily: 'var(--font-heading)', letterSpacing: '-0.025em', margin: 0, marginBottom: 8, color: 'var(--text-primary)' }}>
          User Management
        </h1>
        <p style={{ color: 'var(--text-muted)', margin: 0 }}>
          Search for users and reset passwords
        </p>
      </div>

      {/* Search Section */}
      <div style={{
        background: 'var(--surface)',
        borderRadius: 12,
        boxShadow: '0 1px 3px rgba(0,0,0,0.1)',
        padding: 24,
        marginBottom: 24,
      }}>
        <div style={{ display: 'flex', gap: 12 }}>
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
            placeholder="Search by email..."
            data-testid="admin-search-input"
            style={{
              flex: 1,
              padding: '10px 14px',
              border: '1px solid var(--border)',
              borderRadius: 6,
              fontSize: 14,
              outline: 'none',
            }}
          />
          <button
            onClick={handleSearch}
            disabled={loadingUsers}
            data-testid="admin-search-button"
            style={{
              padding: '10px 20px',
              background: '#F43F5E',
              color: 'white',
              border: 'none',
              borderRadius: 6,
              fontSize: 14,
              fontWeight: 500,
              cursor: loadingUsers ? 'not-allowed' : 'pointer',
              opacity: loadingUsers ? 0.7 : 1,
            }}
          >
            {loadingUsers ? 'Searching...' : 'Search'}
          </button>
        </div>
      </div>

      {/* Users Table */}
      <div style={{
        background: 'var(--surface)',
        borderRadius: 12,
        boxShadow: '0 1px 3px rgba(0,0,0,0.1)',
        overflow: 'hidden',
      }}>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr style={{ background: 'var(--surface-secondary)', borderBottom: '1px solid #e5e5e5' }}>
              <th style={{ padding: '12px 16px', textAlign: 'left', fontSize: 13, fontWeight: 600, color: 'var(--text-secondary)' }}>Email</th>
              <th style={{ padding: '12px 16px', textAlign: 'left', fontSize: 13, fontWeight: 600, color: 'var(--text-secondary)' }}>Admin</th>
              <th style={{ padding: '12px 16px', textAlign: 'left', fontSize: 13, fontWeight: 600, color: 'var(--text-secondary)' }}>Status</th>
              <th style={{ padding: '12px 16px', textAlign: 'left', fontSize: 13, fontWeight: 600, color: 'var(--text-secondary)' }}>Created</th>
              <th style={{ padding: '12px 16px', textAlign: 'right', fontSize: 13, fontWeight: 600, color: 'var(--text-secondary)' }}>Actions</th>
            </tr>
          </thead>
          <tbody>
            {users.length === 0 ? (
              <tr>
                <td colSpan={5} style={{ padding: 24, textAlign: 'center', color: 'var(--text-muted)' }}>
                  {loadingUsers ? 'Loading...' : 'No users found'}
                </td>
              </tr>
            ) : (
              users.map((user) => (
                <tr key={user.id} style={{ borderBottom: '1px solid #e5e5e5' }}>
                  <td style={{ padding: '12px 16px', fontSize: 14 }}>
                    {user.email}
                    {user.id === me.userId && (
                      <span style={{ marginLeft: 8, fontSize: 11, background: '#dbeafe', color: '#BE123C', padding: '2px 6px', borderRadius: 4 }}>
                        You
                      </span>
                    )}
                  </td>
                  <td style={{ padding: '12px 16px', fontSize: 14 }}>
                    <span style={{
                      padding: '2px 8px',
                      borderRadius: 4,
                      fontSize: 12,
                      background: user.isAdmin ? '#fef3c7' : '#e5e5e5',
                      color: user.isAdmin ? '#92400e' : '#525252',
                    }}>
                      {user.isAdmin ? 'Yes' : 'No'}
                    </span>
                  </td>
                  <td style={{ padding: '12px 16px', fontSize: 14 }}>
                    {user.mustChangePassword ? (
                      <span style={{ color: '#dc2626', fontSize: 12 }}>Temp Password</span>
                    ) : (
                      <span style={{ color: '#16a34a', fontSize: 12 }}>Active</span>
                    )}
                  </td>
                  <td style={{ padding: '12px 16px', fontSize: 14, color: 'var(--text-muted)' }}>
                    {new Date(user.createdAt).toLocaleDateString()}
                  </td>
                  <td style={{ padding: '12px 16px', textAlign: 'right' }}>
                    <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
                      <button
                        onClick={() => handleToggleAdmin(user.id, user.isAdmin)}
                        disabled={user.id === me.userId && user.isAdmin}
                        data-testid={`admin-toggle-admin-${user.id}`}
                        style={{
                          padding: '6px 12px',
                          background: user.isAdmin ? '#fef2f2' : '#f0fdf4',
                          color: user.isAdmin ? '#dc2626' : '#16a34a',
                          border: user.isAdmin ? '1px solid #fecaca' : '1px solid #bbf7d0',
                          borderRadius: 4,
                          fontSize: 12,
                          cursor: (user.id === me.userId && user.isAdmin) ? 'not-allowed' : 'pointer',
                          opacity: (user.id === me.userId && user.isAdmin) ? 0.5 : 1,
                        }}
                        title={user.id === me.userId && user.isAdmin ? 'You cannot demote yourself' : undefined}
                      >
                        {user.isAdmin ? 'Remove Admin' : 'Make Admin'}
                      </button>
                      {user.id !== me.userId && (
                        <button
                          onClick={() => setResetModal({ user })}
                          data-testid={`admin-reset-password-${user.id}`}
                          style={{
                            padding: '6px 12px',
                            background: '#fef2f2',
                            color: '#dc2626',
                            border: '1px solid #fecaca',
                            borderRadius: 4,
                            fontSize: 12,
                            cursor: 'pointer',
                          }}
                        >
                          Reset Password
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Reset Password Modal */}
      {resetModal && (
        <div style={{
          position: 'fixed',
          inset: 0,
          background: 'rgba(0,0,0,0.5)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 1000,
        }}>
          <div style={{
            background: 'var(--surface)',
            borderRadius: 12,
            padding: 24,
            width: '100%',
            maxWidth: 400,
            margin: 16,
          }}>
            {resetModal.tempPassword ? (
              <>
                <h3 style={{ margin: 0, marginBottom: 16, color: 'var(--text-primary)' }}>Password Reset Complete</h3>
                <p style={{ margin: 0, marginBottom: 8, color: 'var(--text-muted)', fontSize: 14 }}>
                  A temporary password has been generated for <strong>{resetModal.user.email}</strong>
                </p>
                <div style={{
                  background: '#f0fdf4',
                  border: '1px solid #bbf7d0',
                  borderRadius: 8,
                  padding: 16,
                  marginTop: 16,
                  marginBottom: 16,
                }}>
                  <div style={{ fontSize: 12, color: '#15803d', marginBottom: 4 }}>Temporary Password:</div>
                  <div style={{
                    fontFamily: 'monospace',
                    fontSize: 18,
                    fontWeight: 600,
                    color: '#166534',
                    wordBreak: 'break-all',
                  }}>
                    {resetModal.tempPassword}
                  </div>
                </div>
                <p style={{ margin: 0, fontSize: 13, color: '#dc2626' }}>
                  Make sure to copy this password! The user will be required to change it on next login.
                </p>
                <button
                  onClick={() => setResetModal(null)}
                  style={{
                    width: '100%',
                    marginTop: 16,
                    padding: '10px 16px',
                    background: '#F43F5E',
                    color: 'white',
                    border: 'none',
                    borderRadius: 6,
                    fontSize: 14,
                    cursor: 'pointer',
                  }}
                >
                  Done
                </button>
              </>
            ) : (
              <>
                <h3 style={{ margin: 0, marginBottom: 16, color: 'var(--text-primary)' }}>Reset Password</h3>
                <p style={{ margin: 0, marginBottom: 16, color: 'var(--text-muted)', fontSize: 14 }}>
                  Are you sure you want to reset the password for <strong>{resetModal.user.email}</strong>?
                </p>
                <p style={{ margin: 0, marginBottom: 16, fontSize: 13, color: '#dc2626' }}>
                  This will generate a temporary password that the user must change on their next login.
                </p>
                <div style={{ display: 'flex', gap: 12 }}>
                  <button
                    onClick={() => setResetModal(null)}
                    disabled={resetting}
                    style={{
                      flex: 1,
                      padding: '10px 16px',
                      background: 'var(--surface)',
                      color: 'var(--text-secondary)',
                      border: '1px solid var(--border)',
                      borderRadius: 6,
                      fontSize: 14,
                      cursor: resetting ? 'not-allowed' : 'pointer',
                    }}
                  >
                    Cancel
                  </button>
                  <button
                    onClick={() => handleResetPassword(resetModal.user.id)}
                    disabled={resetting}
                    style={{
                      flex: 1,
                      padding: '10px 16px',
                      background: '#dc2626',
                      color: 'white',
                      border: 'none',
                      borderRadius: 6,
                      fontSize: 14,
                      cursor: resetting ? 'not-allowed' : 'pointer',
                      opacity: resetting ? 0.7 : 1,
                    }}
                  >
                    {resetting ? 'Resetting...' : 'Reset Password'}
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </Layout>
  );
}
