'use client';

import { type CSSProperties, useCallback, useEffect, useMemo, useState } from 'react';
import Layout from '../../components/Layout';
import ForcePasswordChange from '../../components/ForcePasswordChange';
import { apiFetchJson, isUnauthorized } from '../../lib/api';
import type { Me } from '../../types';
import {
  AliasRule,
  approveAliasRule,
  fetchAliasRules,
  rejectAliasRule,
} from '../../lib/api/rules';
import { useToast } from '../../components/ToastProvider';

export default function AdminRulesPage() {
  const [me, setMe] = useState<Me | null>(null);
  const [loading, setLoading] = useState(true);
  const [authError, setAuthError] = useState<string | null>(null);
  const [rules, setRules] = useState<AliasRule[]>([]);
  const [loadingRules, setLoadingRules] = useState(false);
  const [actionLoadingId, setActionLoadingId] = useState<string | null>(null);
  const [activationMessage, setActivationMessage] = useState<string | null>(null);
  const { showToast } = useToast();

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

  const loadRules = useCallback(async () => {
    setLoadingRules(true);
    try {
      const data = await fetchAliasRules('proposed');
      setRules(data);
    } catch (e: any) {
      showToast(e?.message || 'Failed to load proposed rules', 'error');
    } finally {
      setLoadingRules(false);
    }
  }, [showToast]);

  useEffect(() => {
    if (loading) return;
    if (!me) {
      if (typeof window !== 'undefined') window.location.href = '/';
      return;
    }
    if (!me.mustChangePassword && !me.isAdmin) {
      if (typeof window !== 'undefined') window.location.href = '/';
    }
  }, [loading, me]);

  useEffect(() => {
    if (!me || !me.isAdmin || me.mustChangePassword) return;
    loadRules();
    const intervalId = window.setInterval(() => {
      loadRules();
    }, 30000);
    return () => window.clearInterval(intervalId);
  }, [me, loadRules]);

  const groupedRules = useMemo(() => {
    const grouped = new Map<string, AliasRule[]>();
    for (const rule of rules) {
      const current = grouped.get(rule.vendorId) ?? [];
      current.push(rule);
      grouped.set(rule.vendorId, current);
    }
    return [...grouped.entries()];
  }, [rules]);

  const onApprove = async (ruleId: string) => {
    setActionLoadingId(ruleId);
    setActivationMessage(null);
    try {
      await approveAliasRule(ruleId);
      setRules((prev) => prev.filter((rule) => rule.id !== ruleId));
      setActivationMessage('Rule activated');
      window.setTimeout(() => setActivationMessage(null), 2000);
    } catch (e: any) {
      showToast(e?.message || 'Failed to approve rule', 'error');
    } finally {
      setActionLoadingId(null);
    }
  };

  const onReject = async (ruleId: string) => {
    setActionLoadingId(ruleId);
    setActivationMessage(null);
    try {
      await rejectAliasRule(ruleId);
      setRules((prev) => prev.filter((rule) => rule.id !== ruleId));
    } catch (e: any) {
      showToast(e?.message || 'Failed to reject rule', 'error');
    } finally {
      setActionLoadingId(null);
    }
  };

  const logout = async () => {
    try {
      await apiFetchJson('/auth/logout', { method: 'POST', body: JSON.stringify({}) });
    } catch {
      // ignore
    } finally {
      setMe(null);
      window.location.href = '/';
    }
  };

  const forceChangePassword = async (
    currentPassword: string,
    newPassword: string,
  ): Promise<boolean> => {
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

  if (loading || !me) return null;

  if (me.mustChangePassword) {
    return (
      <ForcePasswordChange
        email={me.email}
        onChangePassword={forceChangePassword}
        error={authError}
      />
    );
  }

  if (!me.isAdmin) return null;

  return (
    <Layout
      currentPage="adminMl"
      userEmail={me.email}
      userRole={me.role}
      isAdmin={me.isAdmin}
      onLogout={logout}
    >
      <div style={{ marginBottom: 20 }}>
        <h1
          style={{
            fontSize: 28,
            fontWeight: 700,
            fontFamily: 'var(--font-heading)',
            letterSpacing: '-0.025em',
            margin: 0,
            marginBottom: 6,
            color: 'var(--text-primary)',
          }}
        >
          Rule Management — Proposed Aliases
        </h1>
        <p style={{ margin: 0, color: 'var(--text-muted)' }}>
          Review and approve vendor-scoped alias rules before they enter production.
        </p>
        {activationMessage && (
          <div style={{ marginTop: 10, color: '#059669', fontWeight: 600 }}>
            {activationMessage}
          </div>
        )}
      </div>

      {loadingRules && rules.length === 0 ? (
        <div style={{ color: 'var(--text-muted)' }}>Loading proposed rules...</div>
      ) : null}

      {!loadingRules && rules.length === 0 ? (
        <div
          style={{
            background: 'var(--surface)',
            border: '1px solid var(--border)',
            borderRadius: 12,
            padding: 20,
            color: 'var(--text-secondary)',
          }}
        >
          No pending rules. The system is up to date.
        </div>
      ) : null}

      {groupedRules.map(([vendorId, vendorRules]) => (
        <section key={vendorId} style={{ marginBottom: 24 }}>
          <h2 style={{ marginBottom: 10, color: 'var(--text-primary)' }}>{vendorId}</h2>
          <div
            style={{
              background: 'var(--surface)',
              border: '1px solid var(--border)',
              borderRadius: 12,
              overflowX: 'auto',
            }}
          >
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ background: 'var(--surface-secondary)' }}>
                  <th style={headerCellStyle}>Field Key</th>
                  <th style={headerCellStyle}>Rule</th>
                  <th style={headerCellStyle}>Corrections</th>
                  <th style={headerCellStyle}>Proposed</th>
                  <th style={headerCellStyle}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {vendorRules.map((rule) => (
                  <tr key={rule.id} style={{ borderTop: '1px solid var(--border)' }}>
                    <td style={bodyCellStyle}>{rule.fieldKey}</td>
                    <td style={bodyCellStyle}>
                      {rule.rawPattern} {'->'} {rule.correctedValue}
                    </td>
                    <td style={bodyCellStyle}>
                      {rule.correctionEventCount} corrections
                    </td>
                    <td style={bodyCellStyle}>
                      {new Date(rule.proposedAt).toLocaleString()}
                    </td>
                    <td style={bodyCellStyle}>
                      <div style={{ display: 'flex', gap: 8 }}>
                        <button
                          onClick={() => onApprove(rule.id)}
                          disabled={actionLoadingId === rule.id}
                          style={approveButtonStyle}
                        >
                          Approve
                        </button>
                        <button
                          onClick={() => onReject(rule.id)}
                          disabled={actionLoadingId === rule.id}
                          style={rejectButtonStyle}
                        >
                          Reject
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      ))}
    </Layout>
  );
}

const headerCellStyle: CSSProperties = {
  textAlign: 'left',
  padding: '12px 14px',
  fontSize: 13,
  color: 'var(--text-secondary)',
  whiteSpace: 'nowrap',
};

const bodyCellStyle: CSSProperties = {
  padding: '12px 14px',
  fontSize: 14,
  color: 'var(--text-primary)',
  verticalAlign: 'top',
};

const approveButtonStyle: CSSProperties = {
  border: '1px solid #16a34a',
  color: '#166534',
  borderRadius: 6,
  background: '#f0fdf4',
  padding: '6px 10px',
  cursor: 'pointer',
  fontWeight: 600,
};

const rejectButtonStyle: CSSProperties = {
  border: '1px solid #ef4444',
  color: '#991b1b',
  borderRadius: 6,
  background: '#fef2f2',
  padding: '6px 10px',
  cursor: 'pointer',
  fontWeight: 600,
};
