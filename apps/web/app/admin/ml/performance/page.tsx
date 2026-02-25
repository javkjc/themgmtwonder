'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { apiFetchJson, isUnauthorized } from '../../../lib/api';
import {
    activateMlModel,
    fetchMlPerformance,
    MlConfidenceHistogramBand,
    MlPerformance,
    MlPerformanceModel,
    MlPerformanceTrendPoint,
} from '../../../lib/api/admin';
import type { Me } from '../../../types';
import Layout from '../../../components/Layout';
import ForcePasswordChange from '../../../components/ForcePasswordChange';
import { useToast } from '../../../components/ToastProvider';

const ONLINE_DELTA_THRESHOLD = 0.05;
const ONLINE_SUGGESTIONS_THRESHOLD = 1000;
const AUTO_CONFIRM_THRESHOLD = 0.9;
const VERIFY_THRESHOLD = 0.7;

function formatPercent(value: number): string {
    return `${(value * 100).toFixed(1)}%`;
}

function formatDeltaPercent(value: number): string {
    const sign = value > 0 ? '+' : '';
    return `${sign}${(value * 100).toFixed(1)}%`;
}

function formatDateShort(value: string): string {
    const parsed = new Date(value);
    if (Number.isNaN(parsed.getTime())) return value;
    return parsed.toLocaleDateString(undefined, {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
    });
}

function buildGateTooltip(model: MlPerformanceModel | null): string {
    if (!model) return 'No candidate model available to activate.';
    if (model.gateStatus.onlineGateMet) return 'Candidate meets all D5 online gates.';

    const deltaGap = ONLINE_DELTA_THRESHOLD - model.gateStatus.onlineDelta;
    const countGap = ONLINE_SUGGESTIONS_THRESHOLD - model.gateStatus.onlineSuggestionCount;
    const reasons: string[] = [];
    if (model.gateStatus.onlineDelta < ONLINE_DELTA_THRESHOLD) {
        reasons.push(
            `Acceptance delta ${formatDeltaPercent(model.gateStatus.onlineDelta)} is below required ${formatPercent(ONLINE_DELTA_THRESHOLD)}${deltaGap > 0 ? ` (needs ${formatDeltaPercent(deltaGap)} more)` : ''
            }.`,
        );
    }
    if (model.gateStatus.onlineSuggestionCount < ONLINE_SUGGESTIONS_THRESHOLD) {
        reasons.push(
            `Candidate suggestions ${model.gateStatus.onlineSuggestionCount} are below required ${ONLINE_SUGGESTIONS_THRESHOLD}${countGap > 0 ? ` (needs ${countGap} more)` : ''
            }.`,
        );
    }
    return reasons.join(' ');
}

function SummaryCard({
    title,
    value,
    subtitle,
}: {
    title: string;
    value: string;
    subtitle: string;
}) {
    return (
        <div
            style={{
                background: 'var(--surface)',
                border: '1px solid var(--border)',
                borderRadius: 12,
                padding: 18,
            }}
        >
            <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase' }}>
                {title}
            </div>
            <div style={{ marginTop: 8, fontSize: 26, fontWeight: 700, color: 'var(--text-primary)' }}>{value}</div>
            <div style={{ marginTop: 8, fontSize: 13, color: 'var(--text-muted)' }}>{subtitle}</div>
        </div>
    );
}

function GateBadge({ model }: { model: MlPerformanceModel }) {
    const pass = model.gateStatus.onlineGateMet;
    return (
        <span
            title={buildGateTooltip(model)}
            style={{
                display: 'inline-flex',
                alignItems: 'center',
                padding: '4px 8px',
                borderRadius: 999,
                fontSize: 12,
                fontWeight: 600,
                background: pass ? '#ecfdf5' : '#fef2f2',
                color: pass ? '#065f46' : '#991b1b',
                border: `1px solid ${pass ? '#a7f3d0' : '#fecaca'}`,
            }}
        >
            {pass ? 'Gate Met' : 'Gate Blocked'}
        </span>
    );
}

function TrendChart({ trend }: { trend: MlPerformanceTrendPoint[] }) {
    const maxRate = useMemo(
        () => Math.max(0.01, ...trend.map((point) => point.acceptanceRate)),
        [trend],
    );

    return (
        <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12, padding: 16 }}>
            <h3 style={{ margin: 0, marginBottom: 12, color: 'var(--text-primary)', fontSize: 16 }}>12-Week Acceptance Trend</h3>
            <div style={{ display: 'grid', gridTemplateColumns: `repeat(${Math.max(trend.length, 1)}, minmax(0, 1fr))`, gap: 8, alignItems: 'end', height: 220 }}>
                {trend.map((point) => {
                    const heightPercent = Math.max(4, (point.acceptanceRate / maxRate) * 100);
                    return (
                        <div key={point.weekStart} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8 }}>
                            <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>{formatPercent(point.acceptanceRate)}</div>
                            <div style={{ width: '100%', height: 160, display: 'flex', alignItems: 'end' }}>
                                <div
                                    title={`${point.weekStart}: ${formatPercent(point.acceptanceRate)} (${point.accepted}/${point.suggestions})`}
                                    style={{
                                        width: '100%',
                                        height: `${heightPercent}%`,
                                        borderRadius: '6px 6px 0 0',
                                        background: 'linear-gradient(180deg, #38bdf8 0%, #0284c7 100%)',
                                    }}
                                />
                            </div>
                            <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                                {point.weekStart.slice(5)}
                            </div>
                        </div>
                    );
                })}
            </div>
        </div>
    );
}

function ConfidenceHistogram({ histogram }: { histogram: MlConfidenceHistogramBand[] }) {
    const maxCount = useMemo(() => Math.max(1, ...histogram.map((band) => band.count)), [histogram]);

    return (
        <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12, padding: 16 }}>
            <h3 style={{ margin: 0, marginBottom: 12, color: 'var(--text-primary)', fontSize: 16 }}>7-Day Confidence Histogram</h3>
            <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 10 }}>
                Auto-confirm threshold at 0.90 and verify threshold at 0.70 are marked below.
            </div>
            <div style={{ position: 'relative', paddingTop: 8 }}>
                <div
                    style={{
                        position: 'absolute',
                        top: 0,
                        bottom: 20,
                        left: `${VERIFY_THRESHOLD * 100}%`,
                        borderLeft: '2px dashed #f59e0b',
                    }}
                    title="Verify threshold (0.70)"
                />
                <div
                    style={{
                        position: 'absolute',
                        top: 0,
                        bottom: 20,
                        left: `${AUTO_CONFIRM_THRESHOLD * 100}%`,
                        borderLeft: '2px solid #ef4444',
                    }}
                    title="Auto-confirm threshold (0.90)"
                />
                <div style={{ display: 'grid', gridTemplateColumns: `repeat(${Math.max(histogram.length, 1)}, minmax(0, 1fr))`, gap: 8, alignItems: 'end', height: 220 }}>
                    {histogram.map((band) => {
                        const heightPercent = Math.max(4, (band.count / maxCount) * 100);
                        return (
                            <div key={band.band} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8 }}>
                                <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>{band.count}</div>
                                <div style={{ width: '100%', height: 160, display: 'flex', alignItems: 'end' }}>
                                    <div
                                        title={`${band.band}: ${band.count}`}
                                        style={{
                                            width: '100%',
                                            height: `${heightPercent}%`,
                                            borderRadius: '6px 6px 0 0',
                                            background: 'linear-gradient(180deg, #a7f3d0 0%, #059669 100%)',
                                        }}
                                    />
                                </div>
                                <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>{band.band}</div>
                            </div>
                        );
                    })}
                </div>
                <div style={{ display: 'flex', gap: 12, marginTop: 8, fontSize: 12, color: 'var(--text-muted)' }}>
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                        <span style={{ width: 12, height: 0, borderTop: '2px dashed #f59e0b' }} />
                        Verify 0.70
                    </span>
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                        <span style={{ width: 12, height: 0, borderTop: '2px solid #ef4444' }} />
                        Auto-confirm 0.90
                    </span>
                </div>
            </div>
        </div>
    );
}

export default function MlPerformancePage() {
    const [me, setMe] = useState<Me | null>(null);
    const [loading, setLoading] = useState(true);
    const [authError, setAuthError] = useState<string | null>(null);
    const [performance, setPerformance] = useState<MlPerformance | null>(null);
    const [loadingPerformance, setLoadingPerformance] = useState(false);
    const [activating, setActivating] = useState(false);
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

    const loadPerformance = useCallback(async () => {
        setLoadingPerformance(true);
        try {
            const data = await fetchMlPerformance();
            setPerformance(data);
        } catch (e: any) {
            showToast(e?.message || 'Failed to load ML performance data', 'error');
        } finally {
            setLoadingPerformance(false);
        }
    }, [showToast]);

    useEffect(() => {
        if (!me || !me.isAdmin || me.mustChangePassword) return;
        loadPerformance();
        const intervalId = window.setInterval(loadPerformance, 15000);
        return () => window.clearInterval(intervalId);
    }, [me, loadPerformance]);

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

    const onActivate = async () => {
        if (!performance?.candidateModel) return;
        setActivating(true);
        try {
            await activateMlModel(performance.candidateModel.version);
            showToast(`Activated model ${performance.candidateModel.version}`, 'success');
            await loadPerformance();
        } catch (e: any) {
            showToast(e?.message || 'Failed to activate model', 'error');
        } finally {
            setActivating(false);
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

    const active = performance?.activeModel ?? null;
    const candidate = performance?.candidateModel ?? null;
    const delta = active && candidate ? candidate.acceptanceRate - active.acceptanceRate : 0;
    const activateDisabled = activating || !candidate || !candidate.gateStatus.onlineGateMet;
    const activateTooltip = buildGateTooltip(candidate);

    return (
        <Layout currentPage="adminMl" userEmail={me.email} userRole={me.role} isAdmin={me.isAdmin} onLogout={logout}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 16, flexWrap: 'wrap', marginBottom: 24 }}>
                <div>
                    <h1 style={{ margin: 0, fontSize: 28, fontWeight: 700, color: 'var(--text-primary)' }}>
                        ML Performance
                    </h1>
                    <p style={{ margin: '8px 0 0', color: 'var(--text-muted)' }}>
                        Model comparison, online gate status, and activation controls.
                    </p>
                </div>
                <div style={{ display: 'flex', gap: 10 }}>
                    <Link
                        href="/admin/ml"
                        style={{
                            padding: '10px 14px',
                            border: '1px solid var(--border)',
                            borderRadius: 8,
                            textDecoration: 'none',
                            color: 'var(--text-primary)',
                            background: 'var(--surface)',
                            fontSize: 14,
                            fontWeight: 600,
                        }}
                    >
                        Back to Metrics
                    </Link>
                    <button
                        type="button"
                        onClick={loadPerformance}
                        disabled={loadingPerformance}
                        style={{
                            padding: '10px 14px',
                            border: 'none',
                            borderRadius: 8,
                            background: '#0ea5e9',
                            color: '#fff',
                            fontSize: 14,
                            fontWeight: 600,
                            cursor: loadingPerformance ? 'not-allowed' : 'pointer',
                            opacity: loadingPerformance ? 0.7 : 1,
                        }}
                    >
                        {loadingPerformance ? 'Refreshing...' : 'Refresh'}
                    </button>
                </div>
            </div>

            {performance && (
                <>
                    <div style={{ display: 'grid', gap: 12, gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', marginBottom: 20 }}>
                        <SummaryCard
                            title="Active Model"
                            value={active ? active.version : 'N/A'}
                            subtitle={active ? `Acceptance ${formatPercent(active.acceptanceRate)}` : 'No active model registered'}
                        />
                        <SummaryCard
                            title="Candidate Model"
                            value={candidate ? candidate.version : 'N/A'}
                            subtitle={candidate ? `Acceptance ${formatPercent(candidate.acceptanceRate)}` : 'No candidate model available'}
                        />
                        <SummaryCard
                            title="Acceptance Delta"
                            value={active && candidate ? formatDeltaPercent(delta) : 'N/A'}
                            subtitle={active && candidate ? `${candidate.version} vs ${active.version}` : 'Needs active and candidate models'}
                        />
                    </div>

                    <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12, overflow: 'hidden', marginBottom: 20 }}>
                        <div style={{ padding: '14px 16px', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12 }}>
                            <h2 style={{ margin: 0, fontSize: 17, color: 'var(--text-primary)' }}>Model Versions</h2>
                            <button
                                type="button"
                                onClick={onActivate}
                                disabled={activateDisabled}
                                title={activateDisabled ? activateTooltip : `Activate ${candidate?.version ?? ''}`}
                                style={{
                                    padding: '8px 12px',
                                    border: 'none',
                                    borderRadius: 8,
                                    background: activateDisabled ? '#94a3b8' : '#16a34a',
                                    color: '#fff',
                                    cursor: activateDisabled ? 'not-allowed' : 'pointer',
                                    fontWeight: 600,
                                }}
                            >
                                {activating ? 'Activating...' : candidate ? `Activate ${candidate.version}` : 'Activate'}
                            </button>
                        </div>
                        <div style={{ overflowX: 'auto' }}>
                            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                                <thead>
                                    <tr style={{ borderBottom: '1px solid var(--border)', background: 'var(--surface-secondary)' }}>
                                        <th style={{ textAlign: 'left', padding: '10px 12px', fontSize: 12, color: 'var(--text-muted)' }}>Version</th>
                                        <th style={{ textAlign: 'left', padding: '10px 12px', fontSize: 12, color: 'var(--text-muted)' }}>Trained At</th>
                                        <th style={{ textAlign: 'right', padding: '10px 12px', fontSize: 12, color: 'var(--text-muted)' }}>Suggestions</th>
                                        <th style={{ textAlign: 'right', padding: '10px 12px', fontSize: 12, color: 'var(--text-muted)' }}>Acceptance Rate</th>
                                        <th style={{ textAlign: 'left', padding: '10px 12px', fontSize: 12, color: 'var(--text-muted)' }}>Gate Status</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {performance.models.length === 0 ? (
                                        <tr>
                                            <td colSpan={5} style={{ padding: 18, textAlign: 'center', color: 'var(--text-muted)' }}>
                                                No model versions found.
                                            </td>
                                        </tr>
                                    ) : (
                                        performance.models.map((model) => (
                                            <tr key={model.id} style={{ borderBottom: '1px solid var(--border)' }}>
                                                <td style={{ padding: '12px', color: 'var(--text-primary)', fontWeight: model.isActive ? 700 : 500 }}>
                                                    {model.version}{model.isActive ? ' (Active)' : ''}
                                                </td>
                                                <td style={{ padding: '12px', color: 'var(--text-muted)' }}>{formatDateShort(model.trainedAt)}</td>
                                                <td style={{ padding: '12px', color: 'var(--text-primary)', textAlign: 'right' }}>{model.suggestions}</td>
                                                <td style={{ padding: '12px', color: 'var(--text-primary)', textAlign: 'right' }}>{formatPercent(model.acceptanceRate)}</td>
                                                <td style={{ padding: '12px' }}>
                                                    <GateBadge model={model} />
                                                </td>
                                            </tr>
                                        ))
                                    )}
                                </tbody>
                            </table>
                        </div>
                    </div>

                    <div style={{ display: 'grid', gap: 16, gridTemplateColumns: 'repeat(auto-fit, minmax(340px, 1fr))' }}>
                        <TrendChart trend={performance.trend} />
                        <ConfidenceHistogram histogram={performance.confidenceHistogram} />
                    </div>
                </>
            )}

            {loadingPerformance && !performance && (
                <div style={{ color: 'var(--text-muted)', fontSize: 14 }}>
                    Loading performance data...
                </div>
            )}
        </Layout>
    );
}
