'use client';

import React, { useState } from 'react';
import { Segment } from '@/app/lib/api/baselines';

interface ExtractedTextPoolProps {
    segments: Segment[];
    onHighlight: (segment: Segment | null) => void;
    onDragStart?: (e: React.DragEvent, segment: Segment) => void;
    selectedIds?: Set<string>;
    onToggleSelection?: (id: string) => void;
    onSelectAll?: (all: boolean) => void;
}

const getConfidenceColor = (confidenceValue: string | null) => {
    if (!confidenceValue) return '#64748b'; // Gray for null
    const conf = parseFloat(confidenceValue);
    if (conf >= 0.80) return '#166534'; // Green
    if (conf >= 0.60) return '#854d0e'; // Yellow/Orange
    return '#b91c1c'; // Red
};

const getConfidenceBg = (confidenceValue: string | null) => {
    if (!confidenceValue) return '#f1f5f9';
    const conf = parseFloat(confidenceValue);
    if (conf >= 0.80) return '#dcfce7';
    if (conf >= 0.60) return '#fef9c3';
    return '#fee2e2';
};

const hasBoundingBox = (segment: Segment) => {
    const box = segment.boundingBox;
    if (!box || typeof box !== 'object') {
        return false;
    }
    return (
        typeof box.x === 'number' &&
        typeof box.y === 'number' &&
        typeof box.width === 'number' &&
        typeof box.height === 'number'
    );
};

export default function ExtractedTextPool({
    segments,
    onHighlight,
    onDragStart,
    selectedIds = new Set(),
    onToggleSelection,
    onSelectAll,
}: ExtractedTextPoolProps) {
    const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());

    const toggleExpand = (id: string) => {
        const next = new Set(expandedIds);
        if (next.has(id)) {
            next.delete(id);
        } else {
            next.add(id);
        }
        setExpandedIds(next);
    };

    if (!segments || segments.length === 0) {
        return (
            <div style={{ padding: 20, color: '#64748b', textAlign: 'center', fontSize: 14 }}>
                No extracted text segments available.
            </div>
        );
    }

    const allSelected = segments.length > 0 && segments.every(s => selectedIds.has(s.id));

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4, padding: '0 8px' }}>
                <span style={{ fontSize: 12, fontWeight: 700, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                    Extracted Text Pools
                </span>
                {onSelectAll && (
                    <button
                        onClick={() => onSelectAll(!allSelected)}
                        style={{
                            fontSize: 12, fontWeight: 600, color: '#2563eb',
                            background: 'none', border: 'none', cursor: 'pointer',
                            padding: '4px 8px', borderRadius: 6, transition: 'background 0.2s'
                        }}
                    >
                        {allSelected ? 'Deselect All' : 'Select All'}
                    </button>
                )}
            </div>

            {segments.map((segment) => {
                const isExpanded = expandedIds.has(segment.id);
                const isSelected = selectedIds.has(segment.id);
                const text = segment.text || '';
                const shouldTruncate = text.length > 120;
                const displayLines = isExpanded ? text : (shouldTruncate ? text.slice(0, 117) + '...' : text);

                return (
                    <div
                        key={segment.id}
                        draggable={!!onDragStart}
                        onDragStart={(e) => onDragStart?.(e, segment)}
                        onMouseEnter={() => onHighlight(hasBoundingBox(segment) ? segment : null)}
                        onMouseLeave={() => onHighlight(null)}
                        style={{
                            padding: '12px 16px',
                            borderRadius: 12,
                            border: `2px solid ${isSelected ? '#3b82f6' : '#e2e8f0'}`,
                            background: isSelected ? '#eff6ff' : '#ffffff',
                            cursor: 'default',
                            transition: 'all 0.2s',
                            position: 'relative',
                            boxShadow: isSelected ? '0 4px 6px -1px rgba(59, 130, 246, 0.1)' : '0 2px 4px rgba(0,0,0,0.02)',
                        }}
                    >
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 8, gap: 12 }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                                {onToggleSelection && (
                                    <div
                                        onClick={(e) => {
                                            e.stopPropagation();
                                            onToggleSelection(segment.id);
                                        }}
                                        style={{
                                            width: 18,
                                            height: 18,
                                            borderRadius: 4,
                                            border: `2px solid ${isSelected ? '#2563eb' : '#cbd5e1'}`,
                                            background: isSelected ? '#2563eb' : '#ffffff',
                                            cursor: 'pointer',
                                            display: 'flex',
                                            alignItems: 'center',
                                            justifyContent: 'center',
                                            transition: 'all 0.2s'
                                        }}
                                    >
                                        {isSelected && (
                                            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#ffffff" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round">
                                                <polyline points="20 6 9 17 4 12"></polyline>
                                            </svg>
                                        )}
                                    </div>
                                )}
                                {segment.confidence !== null && (
                                    <span
                                        style={{
                                            fontSize: 10,
                                            fontWeight: 700,
                                            padding: '2px 6px',
                                            borderRadius: 6,
                                            color: getConfidenceColor(segment.confidence),
                                            background: getConfidenceBg(segment.confidence),
                                            textTransform: 'uppercase',
                                        }}
                                    >
                                        {Math.round(parseFloat(segment.confidence) * 100)}% Conf
                                    </span>
                                )}
                            </div>
                            {segment.pageNumber !== null && (
                                <span style={{ fontSize: 10, color: '#94a3b8', fontWeight: 500 }}>
                                    Page {segment.pageNumber}
                                </span>
                            )}
                        </div>
                        <div
                            onClick={() => toggleExpand(segment.id)}
                            style={{
                                fontSize: 13,
                                color: '#1e293b',
                                lineHeight: 1.5,
                                wordBreak: 'break-word',
                                whiteSpace: 'pre-wrap',
                                cursor: 'pointer'
                            }}
                        >
                            {displayLines}
                        </div>
                        {shouldTruncate && (
                            <div
                                onClick={() => toggleExpand(segment.id)}
                                style={{ marginTop: 4, fontSize: 11, color: '#2563eb', fontWeight: 600, cursor: 'pointer' }}
                            >
                                {isExpanded ? 'Show less' : 'Show more'}
                            </div>
                        )}
                    </div>
                );
            })}
        </div>
    );
}
