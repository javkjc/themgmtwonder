'use client';

import { useEffect, useState, useCallback } from 'react';
import { apiFetchJson, isUnauthorized } from '../../lib/api';
import { fetchMlMetrics, MlMetrics } from '../../lib/api/admin';
import type { Me } from '../../types';
import Layout from '../../components/Layout';
import ForcePasswordChange from '../../components/ForcePasswordChange';
import { useToast } from '../../components/ToastProvider';

export default function MlMetricsPage() {
    const formatDateLocal = (date: Date) => {
        const year = date.getFullYear();
        const month = String(date.getMonth() + 1).padStart(2, '0');
        const day = String(date.getDate()).padStart(2, '0');
        return `${year}-${month}-${day}`;
    };

    const defaultEndDate = formatDateLocal(new Date());
    const defaultStartDate = formatDateLocal(new Date(Date.now() - 14 * 24 * 60 * 60 * 1000));

    const [me, setMe] = useState<Me | null>(null);
    const [loading, setLoading] = useState(true);
    const [authError, setAuthError] = useState<string | null>(null);

    // Metrics state
    const [metrics, setMetrics] = useState<MlMetrics | null>(null);
    const [loadingMetrics, setLoadingMetrics] = useState(false);
    const [startDate, setStartDate] = useState(defaultStartDate);
    const [endDate, setEndDate] = useState(defaultEndDate);

    const { showToast } = useToast();

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

    const loadMetrics = useCallback(async () => {
        setLoadingMetrics(true);
        try {
            if (startDate && endDate && startDate > endDate) {
                return;
            }
            const data = await fetchMlMetrics(startDate || undefined, endDate || undefined);
            setMetrics(data);
        } catch (e: any) {
            showToast(e?.message || 'Failed to load ML metrics', 'error');
        } finally {
            setLoadingMetrics(false);
        }
    }, [startDate, endDate, showToast]);

    // Redirect unauthenticated/non-admin users after auth resolves
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

    // Auto-load and refresh every 15s for admins
    useEffect(() => {
        if (!me || !me.isAdmin || me.mustChangePassword) return;
        loadMetrics();
        const intervalId = window.setInterval(() => {
            loadMetrics();
        }, 15000);
        return () => window.clearInterval(intervalId);
    }, [me, loadMetrics]);

    if (loading) return null;

    if (!me) return null;

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

    const formatPercent = (val: number) => `${(val * 100).toFixed(1)}%`;
    const isDateRangeInvalid = Boolean(startDate && endDate && startDate > endDate);

    return (
        <Layout currentPage="adminMl" userEmail={me.email} userRole={me.role} isAdmin={me.isAdmin} onLogout={logout}>
            <div style={{ marginBottom: 32 }}>
                <h1 style={{ fontSize: 28, fontWeight: 700, fontFamily: 'var(--font-heading)', letterSpacing: '-0.025em', margin: 0, marginBottom: 8, color: 'var(--text-primary)' }}>
                    ML Performance Evaluation
                </h1>
                <p style={{ color: 'var(--text-muted)', margin: 0 }}>
                    Monitor suggestion quality and model performance across all baselines
                </p>
            </div>

            {/* Filters */}
            <div style={{
                background: 'var(--surface)',
                borderRadius: 12,
                boxShadow: '0 1px 3px rgba(0,0,0,0.1)',
                padding: 24,
                marginBottom: 32,
                display: 'flex',
                alignItems: 'flex-end',
                gap: 16,
                flexWrap: 'wrap',
            }}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                    <label style={{ fontSize: 13, fontWeight: 500, color: 'var(--text-secondary)' }}>Start Date</label>
                    <input
                        type="date"
                        value={startDate}
                        onChange={(e) => setStartDate(e.target.value)}
                        style={{
                            padding: '8px 12px',
                            border: '1px solid var(--border)',
                            borderRadius: 6,
                            fontSize: 14,
                            outline: 'none',
                            color: 'var(--text-primary)',
                        }}
                    />
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                    <label style={{ fontSize: 13, fontWeight: 500, color: 'var(--text-secondary)' }}>End Date</label>
                    <input
                        type="date"
                        value={endDate}
                        onChange={(e) => setEndDate(e.target.value)}
                        style={{
                            padding: '8px 12px',
                            border: '1px solid var(--border)',
                            borderRadius: 6,
                            fontSize: 14,
                            outline: 'none',
                            color: 'var(--text-primary)',
                        }}
                    />
                </div>
                <button
                    onClick={loadMetrics}
                    disabled={loadingMetrics || isDateRangeInvalid}
                    style={{
                        padding: '10px 24px',
                        background: '#F43F5E',
                        color: 'white',
                        border: 'none',
                        borderRadius: 6,
                        fontSize: 14,
                        fontWeight: 500,
                        cursor: loadingMetrics ? 'not-allowed' : 'pointer',
                        height: 40,
                        transition: 'all 0.2s',
                        opacity: loadingMetrics ? 0.7 : 1,
                        display: 'flex',
                        alignItems: 'center',
                        gap: 8,
                    }}
                >
                    {loadingMetrics ? 'Refreshing...' : 'Refresh'}
                </button>
                {isDateRangeInvalid && (
                    <div style={{ color: '#ef4444', fontSize: 12, fontWeight: 500 }}>
                        Start date must be on or before end date.
                    </div>
                )}
            </div>

            {metrics && (
                <>
                    {/* KPI Cards */}
                    <div style={{
                        display: 'grid',
                        gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
                        gap: 24,
                        marginBottom: 32,
                    }}>
                        {[
                            { label: 'Acceptance Rate', value: formatPercent(metrics.acceptRate), color: '#10b981', gradient: 'linear-gradient(135deg, #10b981 0%, #059669 100%)' },
                            { label: 'Modification Rate', value: formatPercent(metrics.modifyRate), color: '#f59e0b', gradient: 'linear-gradient(135deg, #f59e0b 0%, #d97706 100%)' },
                            { label: 'Clear Rate', value: formatPercent(metrics.clearRate), color: '#ef4444', gradient: 'linear-gradient(135deg, #ef4444 0%, #dc2626 100%)' },
                            { label: 'Top-1 Accuracy', value: formatPercent(metrics.top1Accuracy), color: '#F43F5E', gradient: 'linear-gradient(135deg, #F43F5E 0%, #E11D48 100%)' },
                        ].map((kpi, idx) => (
                            <div key={idx} style={{
                                background: 'var(--surface)',
                                borderRadius: 16,
                                padding: 24,
                                boxShadow: '0 4px 6px -1px rgba(0,0,0,0.1), 0 2px 4px -1px rgba(0,0,0,0.06)',
                                position: 'relative',
                                overflow: 'hidden',
                                transition: 'transform 0.2s ease',
                            }}
                                onMouseOver={(e) => e.currentTarget.style.transform = 'translateY(-4px)'}
                                onMouseOut={(e) => e.currentTarget.style.transform = 'translateY(0)'}
                            >
                                <div style={{
                                    position: 'absolute',
                                    top: 0,
                                    left: 0,
                                    width: 4,
                                    height: '100%',
                                    background: kpi.gradient,
                                }} />
                                <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-muted)', marginBottom: 8, textTransform: 'uppercase', letterSpacing: '0.025em' }}>
                                    {kpi.label}
                                </div>
                                <div style={{ fontSize: 32, fontWeight: 700, color: 'var(--text-primary)' }}>
                                    {kpi.value}
                                </div>
                                <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 4 }}>
                                    Based on {metrics.totalActed} actions
                                </div>
                            </div>
                        ))}
                    </div>

                    {/* Field Confusion Table */}
                    <div style={{
                        background: 'var(--surface)',
                        borderRadius: 12,
                        boxShadow: '0 1px 3px rgba(0,0,0,0.1)',
                        overflow: 'hidden',
                    }}>
                        <div style={{ padding: '20px 24px', borderBottom: '1px solid #e5e5e5', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                            <h2 style={{ fontSize: 18, fontWeight: 600, color: 'var(--text-primary)', margin: 0 }}>
                                Confusion by Field (Top 10 by Error Rate)
                            </h2>
                        </div>
                        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                            <thead>
                                <tr style={{ background: 'var(--surface-secondary)', borderBottom: '1px solid #e5e5e5' }}>
                                    <th style={{ padding: '12px 24px', textAlign: 'left', fontSize: 13, fontWeight: 600, color: 'var(--text-secondary)' }}>Field Key</th>
                                    <th style={{ padding: '12px 24px', textAlign: 'center', fontSize: 13, fontWeight: 600, color: 'var(--text-secondary)' }}>Accepted</th>
                                    <th style={{ padding: '12px 24px', textAlign: 'center', fontSize: 13, fontWeight: 600, color: 'var(--text-secondary)' }}>Modified</th>
                                    <th style={{ padding: '12px 24px', textAlign: 'center', fontSize: 13, fontWeight: 600, color: 'var(--text-secondary)' }}>Cleared</th>
                                    <th style={{ padding: '12px 24px', textAlign: 'right', fontSize: 13, fontWeight: 600, color: 'var(--text-secondary)' }}>Accuracy</th>
                                </tr>
                            </thead>
                            <tbody>
                                {metrics.fieldConfusion.length === 0 ? (
                                    <tr>
                                        <td colSpan={5} style={{ padding: 48, textAlign: 'center', color: 'var(--text-muted)' }}>
                                            No field interactions recorded for this period.
                                        </td>
                                    </tr>
                                ) : (
                                    metrics.fieldConfusion.slice(0, 10).map((field, idx) => (
                                        <tr key={idx} style={{ borderBottom: '1px solid #f5f5f5', transition: 'background 0.2s' }}
                                            onMouseOver={(e) => e.currentTarget.style.background = '#fafafa'}
                                            onMouseOut={(e) => e.currentTarget.style.background = 'transparent'}
                                        >
                                            <td style={{ padding: '16px 24px', fontSize: 14, fontWeight: 500, color: 'var(--text-primary)' }}>
                                                {field.fieldKey}
                                            </td>
                                            <td style={{ padding: '16px 24px', textAlign: 'center', fontSize: 14, color: '#10b981' }}>
                                                {field.accepted}
                                            </td>
                                            <td style={{ padding: '16px 24px', textAlign: 'center', fontSize: 14, color: '#f59e0b' }}>
                                                {field.modified}
                                            </td>
                                            <td style={{ padding: '16px 24px', textAlign: 'center', fontSize: 14, color: '#ef4444' }}>
                                                {field.cleared}
                                            </td>
                                            <td style={{ padding: '16px 24px', textAlign: 'right', fontSize: 14 }}>
                                                <span style={{
                                                    padding: '4px 8px',
                                                    borderRadius: 6,
                                                    background: field.accuracy > 0.8 ? '#ecfdf5' : field.accuracy > 0.5 ? '#fffbeb' : '#fef2f2',
                                                    color: field.accuracy > 0.8 ? '#065f46' : field.accuracy > 0.5 ? '#92400e' : '#991b1b',
                                                    fontWeight: 600,
                                                }}>
                                                    {formatPercent(field.accuracy)}
                                                </span>
                                            </td>
                                        </tr>
                                    ))
                                )}
                            </tbody>
                        </table>
                    </div>
                </>
            )}

            {loadingMetrics && !metrics && (
                <div style={{ display: 'flex', justifyContent: 'center', padding: 100 }}>
                    <div style={{
                        width: 40,
                        height: 40,
                        border: '3px solid #e5e5e5',
                        borderTopColor: '#F43F5E',
                        borderRadius: '50%',
                        animation: 'spin 1s linear infinite',
                    }} />
                    <style>{`
            @keyframes spin {
              to { transform: rotate(360deg); }
            }
          `}</style>
                </div>
            )}
        </Layout>
    );
}
