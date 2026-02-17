'use client';

import { useState, useEffect } from 'react';
import { useToast } from './ToastProvider';
import { Button } from './ui/Button';
import { Input } from './ui/Input';

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
  initialLoad?: boolean;
};

export default function LoginForm({
  onLogin,
  onRegister,
  onRequestReset,
  onResetPassword,
  error,
  loading,
  onClearError,
  initialLoad = false,
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
    if (initialLoad) return;

    const passwordChangeSuccess = sessionStorage.getItem('passwordChangeSuccess');
    if (passwordChangeSuccess) {
      showToast('Password changed successfully! Please log in with your new password.', 'success');
      sessionStorage.removeItem('passwordChangeSuccess');
    }
  }, [showToast, initialLoad]);

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
    <div className="min-h-screen flex items-center justify-center p-6 bg-mono-950">
      {/* Login card */}
      <div className="relative w-full max-w-md">
        <div className="bg-white rounded-md border border-mono-800 p-8">
          {/* Logo/Brand */}
          <div className="text-center mb-8">
            <div className="inline-flex items-center justify-center w-12 h-12 bg-coral-500 rounded-md mb-4">
              <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" />
              </svg>
            </div>
            <h1 className="text-2xl font-tight font-bold text-mono-50 tracking-tight mb-2">
              TaskFlow
            </h1>
            <p className="text-sm text-mono-500">
              {authMode === 'login'
                ? 'Welcome back! Sign in to continue'
                : authMode === 'register'
                  ? 'Create your account'
                  : authMode === 'forgot'
                    ? 'Reset your password'
                    : 'Enter your reset token'}
            </p>
          </div>

          {/* Error Message */}
          {error && (authMode === 'login' || authMode === 'register') && (
            <div className="bg-red-50 border border-red-200 text-red-800 px-4 py-3 rounded-md mb-6 text-sm">
              <div className="flex items-start">
                <svg className="w-5 h-5 mr-2 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
                </svg>
                <span>{error}</span>
              </div>
            </div>
          )}

          {/* Form */}
          <div className="space-y-4">
            {(authMode === 'login' || authMode === 'register') && (
              <>
                <Input
                  label="Email"
                  type="email"
                  data-testid="auth-email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@example.com"
                  onKeyDown={handleKeyDown}
                  fullWidth
                />

                <Input
                  label="Password"
                  type="password"
                  data-testid="auth-password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  onKeyDown={handleKeyDown}
                  fullWidth
                />

                <Button
                  onClick={handleSubmit}
                  disabled={loading}
                  data-testid="auth-submit"
                  variant="primary"
                  size="lg"
                  className="w-full mt-6"
                >
                  {loading ? (
                    <span className="flex items-center justify-center">
                      <svg className="animate-spin -ml-1 mr-2 h-4 w-4" fill="none" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                      </svg>
                      Processing...
                    </span>
                  ) : (
                    authMode === 'login' ? 'Sign In' : 'Create Account'
                  )}
                </Button>

                <div className="relative my-6">
                  <div className="absolute inset-0 flex items-center">
                    <div className="w-full border-t border-mono-800"></div>
                  </div>
                  <div className="relative flex justify-center text-sm">
                    <span className="px-4 bg-white text-mono-500">
                      {authMode === 'login' ? "Don't have an account?" : 'Already have an account?'}
                    </span>
                  </div>
                </div>

                <Button
                  type="button"
                  onClick={toggleAuthMode}
                  data-testid="auth-toggle-mode"
                  variant="secondary"
                  size="md"
                  className="w-full"
                >
                  {authMode === 'login' ? 'Create Account' : 'Sign In'}
                </Button>

                <div className="flex items-center justify-center gap-4 mt-4 text-sm">
                  <button
                    type="button"
                    onClick={() => switchMode('forgot')}
                    className="text-coral-500 hover:text-coral-600 font-medium transition-colors"
                  >
                    Forgot password?
                  </button>
                  <span className="text-mono-700">|</span>
                  <button
                    type="button"
                    onClick={() => switchMode('reset')}
                    className="text-coral-500 hover:text-coral-600 font-medium transition-colors"
                  >
                    Have a token?
                  </button>
                </div>
              </>
            )}

            {authMode === 'forgot' && (
              <>
                <Input
                  label="Email Address"
                  type="email"
                  value={resetEmail}
                  onChange={(e) => setResetEmail(e.target.value)}
                  placeholder="you@example.com"
                  onKeyDown={handleKeyDown}
                  fullWidth
                />

                <Button
                  onClick={handleForgotSubmit}
                  disabled={requestingReset}
                  variant="primary"
                  size="lg"
                  className="w-full mt-6"
                >
                  {requestingReset ? 'Sending...' : 'Send Reset Link'}
                </Button>

                {devResetToken && (
                  <div className="bg-amber-50 border border-amber-200 rounded-md p-4 mt-4">
                    <div className="text-xs font-medium text-amber-800 uppercase tracking-wide mb-2">
                      Development Reset Token
                    </div>
                    <div className="font-mono text-sm text-amber-900 break-all select-all bg-white border border-amber-100 rounded px-3 py-2">
                      {devResetToken}
                    </div>
                    {devResetExpiresAt && (
                      <div className="mt-2 text-xs text-amber-700">
                        Expires: {new Date(devResetExpiresAt).toLocaleString()}
                      </div>
                    )}
                  </div>
                )}

                <div className="text-center mt-6">
                  <button
                    type="button"
                    onClick={() => switchMode('login')}
                    className="text-sm text-mono-500 hover:text-mono-50 transition-colors"
                  >
                    ← Back to sign in
                  </button>
                </div>
              </>
            )}

            {authMode === 'reset' && (
              <>
                <Input
                  label="Reset Token"
                  type="text"
                  value={resetTokenInput}
                  onChange={(e) => setResetTokenInput(e.target.value)}
                  placeholder="Paste your reset token"
                  onKeyDown={handleKeyDown}
                  fullWidth
                />

                <Input
                  label="New Password"
                  type="password"
                  value={resetNewPassword}
                  onChange={(e) => setResetNewPassword(e.target.value)}
                  placeholder="••••••••"
                  onKeyDown={handleKeyDown}
                  fullWidth
                />

                {devResetToken && (
                  <div className="bg-amber-50 border border-amber-200 rounded-md p-4 mt-4">
                    <div className="text-xs font-medium text-amber-800 uppercase tracking-wide mb-2">
                      Development Reset Token
                    </div>
                    <div className="font-mono text-sm text-amber-900 break-all select-all bg-white border border-amber-100 rounded px-3 py-2">
                      {devResetToken}
                    </div>
                    {devResetExpiresAt && (
                      <div className="mt-2 text-xs text-amber-700">
                        Expires: {new Date(devResetExpiresAt).toLocaleString()}
                      </div>
                    )}
                  </div>
                )}

                <Button
                  onClick={handleResetSubmit}
                  disabled={resettingPassword}
                  variant="primary"
                  size="lg"
                  className="w-full mt-6"
                >
                  {resettingPassword ? 'Resetting...' : 'Reset Password'}
                </Button>

                <div className="text-center mt-6">
                  <button
                    type="button"
                    onClick={() => switchMode('login')}
                    className="text-sm text-mono-500 hover:text-mono-50 transition-colors"
                  >
                    ← Back to sign in
                  </button>
                </div>
              </>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="text-center mt-6">
          <p className="text-xs text-mono-600">
            Secure • Reliable • Professional
          </p>
        </div>
      </div>
    </div>
  );
}
