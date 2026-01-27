'use client';

import { useEffect, useState, useCallback } from 'react';
import { apiFetchJson, isUnauthorized, isNetworkError } from '../lib/api';
import type { Me } from '../types';
import Layout from '../components/Layout';
import ForcePasswordChange from '../components/ForcePasswordChange';

export default function ProfilePage() {
  const [me, setMe] = useState<Me | null>(null);
  const [loading, setLoading] = useState(true);

  // Change password form state
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [changingPassword, setChangingPassword] = useState(false);
  const [passwordError, setPasswordError] = useState<string | null>(null);
  const [passwordSuccess, setPasswordSuccess] = useState(false);

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

  const handleChangePassword = useCallback(async () => {
    setPasswordError(null);
    setPasswordSuccess(false);

    // Validation
    if (!currentPassword || !newPassword || !confirmPassword) {
      setPasswordError('Please fill in all fields.');
      return;
    }

    if (newPassword.length < 8) {
      setPasswordError('New password must be at least 8 characters.');
      return;
    }

    if (newPassword !== confirmPassword) {
      setPasswordError('New passwords do not match.');
      return;
    }

    setChangingPassword(true);

    try {
      await apiFetchJson('/auth/change-password', {
        method: 'POST',
        body: JSON.stringify({
          currentPassword,
          newPassword,
        }),
      });

      setPasswordSuccess(true);
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');

      // Force logout after successful password change
      setTimeout(async () => {
        try {
          await apiFetchJson('/auth/logout', { method: 'POST', body: JSON.stringify({}) });
        } catch {
          // Ignore logout errors
        }
        window.location.href = '/?message=password_changed';
      }, 2000);
    } catch (e: any) {
      if (isUnauthorized(e)) {
        setPasswordError('Current password is incorrect.');
        return;
      }
      if (isNetworkError(e)) {
        setPasswordError('Network error. Please try again.');
        return;
      }
      setPasswordError(e?.message || 'Failed to change password.');
    } finally {
      setChangingPassword(false);
    }
  }, [currentPassword, newPassword, confirmPassword]);

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

  if (loading) {
    return null;
  }

  if (!me) {
    if (typeof window !== 'undefined') {
      window.location.href = '/';
    }
    return null;
  }

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
        setPasswordError('Current password is incorrect, or session expired.');
        return false;
      }
      setPasswordError(e?.message || 'Change password failed.');
      return false;
    }
  };

  // Force password change if required
  if (me.mustChangePassword) {
    return (
      <ForcePasswordChange
        email={me.email}
        onChangePassword={forceChangePassword}
        error={passwordError}
      />
    );
  }

  return (
    <Layout currentPage="profile" userEmail={me.email} userRole={me.role} isAdmin={me.isAdmin} onLogout={logout}>
      {/* Header */}
      <div style={{ marginBottom: 32 }}>
        <h1 style={{ fontSize: 28, fontWeight: 600, margin: 0, marginBottom: 8, color: '#1e293b' }}>
          Profile & Settings
        </h1>
        <p style={{ color: '#64748b', margin: 0 }}>
          Manage your account settings
        </p>
      </div>

      {/* Account Info Card */}
      <div style={{
        background: 'white',
        borderRadius: 12,
        boxShadow: '0 1px 3px rgba(0,0,0,0.1)',
        padding: 24,
        marginBottom: 24,
      }}>
        <h2 style={{ fontSize: 18, fontWeight: 600, margin: 0, marginBottom: 16, color: '#1e293b' }}>
          Account Information
        </h2>

        <div style={{ display: 'grid', gap: 12 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <div style={{
              width: 48,
              height: 48,
              borderRadius: '50%',
              background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: 'white',
              fontSize: 20,
              fontWeight: 600,
            }}>
              {me.email.charAt(0).toUpperCase()}
            </div>
            <div>
              <div style={{ fontSize: 14, fontWeight: 500, color: '#1e293b' }}>
                {me.email}
              </div>
              <div style={{ fontSize: 12, color: '#64748b' }}>
                User ID: {me.userId.substring(0, 8)}...
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Change Password Card */}
      <div style={{
        background: 'white',
        borderRadius: 12,
        boxShadow: '0 1px 3px rgba(0,0,0,0.1)',
        padding: 24,
      }}>
        <h2 style={{ fontSize: 18, fontWeight: 600, margin: 0, marginBottom: 16, color: '#1e293b' }}>
          Change Password
        </h2>

        {passwordSuccess && (
          <div style={{
            background: '#d1fae5',
            color: '#065f46',
            padding: 12,
            borderRadius: 8,
            marginBottom: 16,
            fontSize: 14,
            fontWeight: 500,
          }}>
            Password changed successfully! Redirecting to login...
          </div>
        )}

        {passwordError && (
          <div style={{
            background: '#fee2e2',
            color: '#991b1b',
            padding: 12,
            borderRadius: 8,
            marginBottom: 16,
            fontSize: 14,
          }}>
            {passwordError}
          </div>
        )}

        <div style={{ display: 'grid', gap: 16, maxWidth: 400 }}>
          <div>
            <label style={{
              display: 'block',
              fontSize: 13,
              fontWeight: 500,
              marginBottom: 8,
              color: '#475569'
            }}>
              Current Password
            </label>
            <input
              type="password"
              value={currentPassword}
              onChange={(e) => setCurrentPassword(e.target.value)}
              disabled={changingPassword || passwordSuccess}
              style={{
                width: '100%',
                padding: '10px 14px',
                border: '1px solid #e2e8f0',
                borderRadius: 6,
                fontSize: 14,
                outline: 'none',
              }}
            />
          </div>

          <div>
            <label style={{
              display: 'block',
              fontSize: 13,
              fontWeight: 500,
              marginBottom: 8,
              color: '#475569'
            }}>
              New Password
            </label>
            <input
              type="password"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              disabled={changingPassword || passwordSuccess}
              placeholder="At least 8 characters"
              style={{
                width: '100%',
                padding: '10px 14px',
                border: '1px solid #e2e8f0',
                borderRadius: 6,
                fontSize: 14,
                outline: 'none',
              }}
            />
          </div>

          <div>
            <label style={{
              display: 'block',
              fontSize: 13,
              fontWeight: 500,
              marginBottom: 8,
              color: '#475569'
            }}>
              Confirm New Password
            </label>
            <input
              type="password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              disabled={changingPassword || passwordSuccess}
              onKeyDown={(e) => {
                if (e.key === 'Enter') handleChangePassword();
              }}
              style={{
                width: '100%',
                padding: '10px 14px',
                border: '1px solid #e2e8f0',
                borderRadius: 6,
                fontSize: 14,
                outline: 'none',
              }}
            />
          </div>

          <button
            onClick={handleChangePassword}
            disabled={changingPassword || passwordSuccess || !currentPassword || !newPassword || !confirmPassword}
            style={{
              padding: '10px 20px',
              background: (changingPassword || passwordSuccess || !currentPassword || !newPassword || !confirmPassword)
                ? '#cbd5e1'
                : '#3b82f6',
              color: 'white',
              border: 'none',
              borderRadius: 6,
              fontSize: 14,
              fontWeight: 500,
              cursor: (changingPassword || passwordSuccess || !currentPassword || !newPassword || !confirmPassword)
                ? 'not-allowed'
                : 'pointer',
              marginTop: 8,
            }}
          >
            {changingPassword ? 'Changing...' : 'Change Password'}
          </button>
        </div>
      </div>
    </Layout>
  );
}
