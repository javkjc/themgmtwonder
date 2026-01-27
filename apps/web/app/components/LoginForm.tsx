'use client';

import { useState, useEffect } from 'react';
import { useToast } from './ToastProvider';

type AuthMode = 'login' | 'register' | 'forgot' | 'reset';

type LoginFormProps = {
  onLogin: (email: string, password: string) => Promise<boolean>;
  onRegister: (email: string, password: string) => Promise<boolean>;
  onRequestReset: (
    email: string,
  ) => Promise<{ success: boolean; resetToken?: string | null; expiresAt?: string | null; error?: string }>;
  onResetPassword: (
    token: string,
    newPassword: string,
  ) => Promise<{ success: boolean; error?: string }>;
  error: string | null;
  loading: boolean;
  onClearError: () => void;
};

export default function LoginForm({
  onLogin,
  onRegister,
  onRequestReset,
  onResetPassword,
  error,
  loading,
  onClearError,
}: LoginFormProps) {
  const { showToast } = useToast();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [resetEmail, setResetEmail] = useState('');
  const [resetTokenInput, setResetTokenInput] = useState('');
  const [resetNewPassword, setResetNewPassword] = useState('');
  const [devResetToken, setDevResetToken] = useState<string | null>(null);
  const [devResetExpiresAt, setDevResetExpiresAt] = useState<string | null>(
    null,
  );
  const [requestingReset, setRequestingReset] = useState(false);
  const [resettingPassword, setResettingPassword] = useState(false);
  const [authMode, setAuthMode] = useState<AuthMode>('login');

  // Check for password change success message from sessionStorage
  useEffect(() => {
    const passwordChangeSuccess = sessionStorage.getItem('passwordChangeSuccess');
    if (passwordChangeSuccess) {
      showToast('Password changed successfully! Please log in with your new password.', 'success');
      sessionStorage.removeItem('passwordChangeSuccess');
    }
  }, [showToast]);

  const handleSubmit = async () => {
    if (authMode === 'login') {
      await onLogin(email, password);
    } else if (authMode === 'register') {
      await onRegister(email, password);
    } else if (authMode === 'forgot') {
      await handleForgotSubmit();
    } else {
      await handleResetSubmit();
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') handleSubmit();
  };

  const handleForgotSubmit = async () => {
    if (!resetEmail.trim()) {
      showToast('Please enter your email address.', 'error');
      return;
    }

    setRequestingReset(true);
    const result = await onRequestReset(resetEmail.trim());
    setRequestingReset(false);

    if (result.success) {
      showToast(
        'If the account exists, a reset link has been generated.',
        'success',
      );
      setDevResetToken(result.resetToken ?? null);
      setDevResetExpiresAt(result.expiresAt ?? null);
      if (result.resetToken) {
        setResetTokenInput(result.resetToken);
      }
      setAuthMode('reset');
    } else {
      showToast(result.error || 'Unable to start password reset.', 'error');
    }
  };

  const handleResetSubmit = async () => {
    if (!resetTokenInput.trim() || !resetNewPassword.trim()) {
      showToast('Enter the reset token and your new password.', 'error');
      return;
    }
    if (resetNewPassword.length < 8) {
      showToast('New password must be at least 8 characters.', 'error');
      return;
    }

    setResettingPassword(true);
    const result = await onResetPassword(
      resetTokenInput.trim(),
      resetNewPassword,
    );
    setResettingPassword(false);

    if (result.success) {
      showToast(
        'Password reset successful. Please log in with your new password.',
        'success',
      );
      setAuthMode('login');
      setPassword('');
      setResetNewPassword('');
      setResetTokenInput('');
      setDevResetToken(null);
      setDevResetExpiresAt(null);
      onClearError();
    } else {
      showToast(result.error || 'Reset password failed.', 'error');
    }
  };

  const switchMode = (mode: AuthMode) => {
    setAuthMode(mode);
    onClearError();
    if (mode !== 'reset') {
      setResetTokenInput('');
      setResetNewPassword('');
      setDevResetToken(null);
      setDevResetExpiresAt(null);
    }
    if (mode !== 'forgot') {
      setResetEmail('');
    }
  };

  const toggleAuthMode = () => {
    switchMode(authMode === 'login' ? 'register' : 'login');
  };

  return (
    <div style={{
      minHeight: '100vh',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
      fontFamily: 'system-ui',
    }}>
      <div style={{
        background: 'white',
        padding: 48,
        borderRadius: 16,
        boxShadow: '0 20px 60px rgba(0,0,0,0.3)',
        width: '100%',
        maxWidth: 440,
      }}>
        {/* Logo/Brand */}
        <div style={{ textAlign: 'center', marginBottom: 32 }}>
          <h1 style={{
            fontSize: 32,
            fontWeight: 700,
            margin: 0,
            marginBottom: 8,
            background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
            WebkitBackgroundClip: 'text',
            WebkitTextFillColor: 'transparent',
            backgroundClip: 'text',
          }}>
            TaskFlow
          </h1>
          <p style={{ color: '#64748b', margin: 0, fontSize: 14 }}>
            {authMode === 'login'
              ? 'Welcome back! Please login to continue.'
              : authMode === 'register'
                ? 'Create your account to get started.'
                : authMode === 'forgot'
                  ? 'Request a password reset link.'
                  : 'Reset your password using the token.'}
          </p>
        </div>

        {/* Error Message */}
        {error && (authMode === 'login' || authMode === 'register') && (
          <div style={{
            background: '#fee2e2',
            color: '#991b1b',
            padding: 12,
            borderRadius: 8,
            marginBottom: 20,
            fontSize: 14,
          }}>
            {error}
          </div>
        )}

        {/* Form */}
        <div style={{ display: 'grid', gap: 16 }}>
          {(authMode === 'login' || authMode === 'register') && (
            <>
              <div>
                <label style={{
                  display: 'block',
                  fontSize: 13,
                  fontWeight: 500,
                  marginBottom: 8,
                  color: '#475569'
                }}>
                  Email
                </label>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="Enter your email"
                  onKeyDown={handleKeyDown}
                  style={{
                    width: '100%',
                    padding: '12px 16px',
                    border: '1px solid #e2e8f0',
                    borderRadius: 8,
                    fontSize: 14,
                    outline: 'none',
                    transition: 'border-color 0.2s',
                  }}
                  onFocus={(e) => e.currentTarget.style.borderColor = '#3b82f6'}
                  onBlur={(e) => e.currentTarget.style.borderColor = '#e2e8f0'}
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
                  Password
                </label>
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Enter your password"
                  onKeyDown={handleKeyDown}
                  style={{
                    width: '100%',
                    padding: '12px 16px',
                    border: '1px solid #e2e8f0',
                    borderRadius: 8,
                    fontSize: 14,
                    outline: 'none',
                    transition: 'border-color 0.2s',
                  }}
                  onFocus={(e) => e.currentTarget.style.borderColor = '#3b82f6'}
                  onBlur={(e) => e.currentTarget.style.borderColor = '#e2e8f0'}
                />
              </div>

              <button
                onClick={handleSubmit}
                disabled={loading}
                style={{
                  width: '100%',
                  padding: '12px 16px',
                  background: loading ? '#cbd5e1' : 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
                  color: 'white',
                  border: 'none',
                  borderRadius: 8,
                  fontSize: 15,
                  fontWeight: 600,
                  cursor: loading ? 'not-allowed' : 'pointer',
                  marginTop: 8,
                  transition: 'transform 0.2s, box-shadow 0.2s',
                }}
                onMouseOver={(e) => {
                  if (!loading) {
                    e.currentTarget.style.transform = 'translateY(-2px)';
                    e.currentTarget.style.boxShadow = '0 10px 20px rgba(102, 126, 234, 0.4)';
                  }
                }}
                onMouseOut={(e) => {
                  e.currentTarget.style.transform = 'translateY(0)';
                  e.currentTarget.style.boxShadow = 'none';
                }}
              >
                {loading ? 'Please wait...' : (authMode === 'login' ? 'Login' : 'Create Account')}
              </button>

              <div style={{ textAlign: 'center', marginTop: 8 }}>
                <button
                  type="button"
                  onClick={toggleAuthMode}
                  style={{
                    background: 'none',
                    border: 'none',
                    color: '#667eea',
                    fontSize: 14,
                    cursor: 'pointer',
                    textDecoration: 'underline',
                  }}
                >
                  {authMode === 'login'
                    ? "Don't have an account? Register"
                    : 'Already have an account? Login'}
                </button>
              </div>

              <div style={{
                textAlign: 'center',
                marginTop: 4,
                display: 'flex',
                justifyContent: 'center',
                gap: 6,
                flexWrap: 'wrap',
              }}>
                <button
                  type="button"
                  onClick={() => switchMode('forgot')}
                  style={{
                    background: 'none',
                    border: 'none',
                    color: '#0ea5e9',
                    fontSize: 13,
                    cursor: 'pointer',
                    textDecoration: 'underline',
                  }}
                >
                  Forgot password?
                </button>
                <span style={{ color: '#cbd5e1' }}>•</span>
                <button
                  type="button"
                  onClick={() => switchMode('reset')}
                  style={{
                    background: 'none',
                    border: 'none',
                    color: '#0ea5e9',
                    fontSize: 13,
                    cursor: 'pointer',
                    textDecoration: 'underline',
                  }}
                >
                  Have a reset token?
                </button>
              </div>
            </>
          )}

          {authMode === 'forgot' && (
            <>
              <div>
                <label style={{
                  display: 'block',
                  fontSize: 13,
                  fontWeight: 500,
                  marginBottom: 8,
                  color: '#475569'
                }}>
                  Account email
                </label>
                <input
                  type="email"
                  value={resetEmail}
                  onChange={(e) => setResetEmail(e.target.value)}
                  placeholder="Enter the email you registered with"
                  onKeyDown={handleKeyDown}
                  style={{
                    width: '100%',
                    padding: '12px 16px',
                    border: '1px solid #e2e8f0',
                    borderRadius: 8,
                    fontSize: 14,
                    outline: 'none',
                    transition: 'border-color 0.2s',
                  }}
                  onFocus={(e) => e.currentTarget.style.borderColor = '#3b82f6'}
                  onBlur={(e) => e.currentTarget.style.borderColor = '#e2e8f0'}
                />
              </div>

              <button
                onClick={handleForgotSubmit}
                disabled={requestingReset}
                style={{
                  width: '100%',
                  padding: '12px 16px',
                  background: requestingReset ? '#cbd5e1' : '#0ea5e9',
                  color: 'white',
                  border: 'none',
                  borderRadius: 8,
                  fontSize: 15,
                  fontWeight: 600,
                  cursor: requestingReset ? 'not-allowed' : 'pointer',
                  marginTop: 4,
                  transition: 'transform 0.2s, box-shadow 0.2s',
                }}
                onMouseOver={(e) => {
                  if (!requestingReset) {
                    e.currentTarget.style.transform = 'translateY(-2px)';
                    e.currentTarget.style.boxShadow = '0 10px 20px rgba(14, 165, 233, 0.35)';
                  }
                }}
                onMouseOut={(e) => {
                  e.currentTarget.style.transform = 'translateY(0)';
                  e.currentTarget.style.boxShadow = 'none';
                }}
              >
                {requestingReset ? 'Sending...' : 'Send reset link'}
              </button>

              {devResetToken && (
                <div style={{
                  background: '#f8fafc',
                  border: '1px solid #e2e8f0',
                  borderRadius: 8,
                  padding: 12,
                  marginTop: 8,
                }}>
                  <div style={{ fontSize: 12, color: '#475569', marginBottom: 6 }}>Dev reset token (copy and paste below):</div>
                  <div style={{
                    fontFamily: 'monospace',
                    fontSize: 16,
                    fontWeight: 600,
                    color: '#0f172a',
                    wordBreak: 'break-all',
                  }}>
                    {devResetToken}
                  </div>
                  {devResetExpiresAt && (
                    <div style={{ marginTop: 4, fontSize: 12, color: '#475569' }}>
                      Expires: {new Date(devResetExpiresAt).toLocaleString()}
                    </div>
                  )}
                </div>
              )}

              <div style={{
                textAlign: 'center',
                marginTop: 8,
                display: 'flex',
                justifyContent: 'center',
                gap: 6,
                flexWrap: 'wrap',
              }}>
                <button
                  type="button"
                  onClick={() => switchMode('login')}
                  style={{
                    background: 'none',
                    border: 'none',
                    color: '#667eea',
                    fontSize: 13,
                    cursor: 'pointer',
                    textDecoration: 'underline',
                  }}
                >
                  Back to login
                </button>
                <span style={{ color: '#cbd5e1' }}>•</span>
                <button
                  type="button"
                  onClick={() => switchMode('reset')}
                  style={{
                    background: 'none',
                    border: 'none',
                    color: '#667eea',
                    fontSize: 13,
                    cursor: 'pointer',
                    textDecoration: 'underline',
                  }}
                >
                  Already have a token?
                </button>
              </div>
            </>
          )}

          {authMode === 'reset' && (
            <>
              <div>
                <label style={{
                  display: 'block',
                  fontSize: 13,
                  fontWeight: 500,
                  marginBottom: 8,
                  color: '#475569'
                }}>
                  Reset token
                </label>
                <input
                  type="text"
                  value={resetTokenInput}
                  onChange={(e) => setResetTokenInput(e.target.value)}
                  placeholder="Paste the reset token"
                  onKeyDown={handleKeyDown}
                  style={{
                    width: '100%',
                    padding: '12px 16px',
                    border: '1px solid #e2e8f0',
                    borderRadius: 8,
                    fontSize: 14,
                    outline: 'none',
                    transition: 'border-color 0.2s',
                  }}
                  onFocus={(e) => e.currentTarget.style.borderColor = '#3b82f6'}
                  onBlur={(e) => e.currentTarget.style.borderColor = '#e2e8f0'}
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
                  New password
                </label>
                <input
                  type="password"
                  value={resetNewPassword}
                  onChange={(e) => setResetNewPassword(e.target.value)}
                  placeholder="Enter a new password"
                  onKeyDown={handleKeyDown}
                  style={{
                    width: '100%',
                    padding: '12px 16px',
                    border: '1px solid #e2e8f0',
                    borderRadius: 8,
                    fontSize: 14,
                    outline: 'none',
                    transition: 'border-color 0.2s',
                  }}
                  onFocus={(e) => e.currentTarget.style.borderColor = '#3b82f6'}
                  onBlur={(e) => e.currentTarget.style.borderColor = '#e2e8f0'}
                />
              </div>

              {devResetToken && (
                <div style={{
                  background: '#f8fafc',
                  border: '1px solid #e2e8f0',
                  borderRadius: 8,
                  padding: 12,
                  marginTop: 4,
                }}>
                  <div style={{ fontSize: 12, color: '#475569', marginBottom: 6 }}>Dev reset token in case you need it:</div>
                  <div style={{
                    fontFamily: 'monospace',
                    fontSize: 16,
                    fontWeight: 600,
                    color: '#0f172a',
                    wordBreak: 'break-all',
                  }}>
                    {devResetToken}
                  </div>
                  {devResetExpiresAt && (
                    <div style={{ marginTop: 4, fontSize: 12, color: '#475569' }}>
                      Expires: {new Date(devResetExpiresAt).toLocaleString()}
                    </div>
                  )}
                </div>
              )}

              <button
                onClick={handleResetSubmit}
                disabled={resettingPassword}
                style={{
                  width: '100%',
                  padding: '12px 16px',
                  background: resettingPassword ? '#cbd5e1' : 'linear-gradient(135deg, #10b981 0%, #059669 100%)',
                  color: 'white',
                  border: 'none',
                  borderRadius: 8,
                  fontSize: 15,
                  fontWeight: 600,
                  cursor: resettingPassword ? 'not-allowed' : 'pointer',
                  marginTop: 8,
                  transition: 'transform 0.2s, box-shadow 0.2s',
                }}
                onMouseOver={(e) => {
                  if (!resettingPassword) {
                    e.currentTarget.style.transform = 'translateY(-2px)';
                    e.currentTarget.style.boxShadow = '0 10px 20px rgba(16, 185, 129, 0.35)';
                  }
                }}
                onMouseOut={(e) => {
                  e.currentTarget.style.transform = 'translateY(0)';
                  e.currentTarget.style.boxShadow = 'none';
                }}
              >
                {resettingPassword ? 'Resetting...' : 'Reset password'}
              </button>

              <div style={{
                textAlign: 'center',
                marginTop: 8,
                display: 'flex',
                justifyContent: 'center',
                gap: 6,
                flexWrap: 'wrap',
              }}>
                <button
                  type="button"
                  onClick={() => switchMode('login')}
                  style={{
                    background: 'none',
                    border: 'none',
                    color: '#667eea',
                    fontSize: 13,
                    cursor: 'pointer',
                    textDecoration: 'underline',
                  }}
                >
                  Back to login
                </button>
                <span style={{ color: '#cbd5e1' }}>•</span>
                <button
                  type="button"
                  onClick={() => switchMode('forgot')}
                  style={{
                    background: 'none',
                    border: 'none',
                    color: '#667eea',
                    fontSize: 13,
                    cursor: 'pointer',
                    textDecoration: 'underline',
                  }}
                >
                  Request a new token
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
