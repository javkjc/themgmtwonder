'use client';

import React, { useState } from 'react';
import { Segment } from '@/app/lib/api/baselines';

interface ExtractedTextPoolProps {
    segments: Segment[];
    onHighlight: (segment: Segment | null) => void;
    onDragStart?: (e: React.DragEvent, segment: Segment) => void;
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

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {segments.map((segment) => {
                const isExpanded = expandedIds.has(segment.id);
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
                        onClick={() => toggleExpand(segment.id)}
                        style={{
                            padding: '12px 16px',
                            borderRadius: 12,
                            border: '1px solid #e2e8f0',
                            background: '#ffffff',
                            cursor: 'pointer',
                            transition: 'all 0.2s',
                            position: 'relative',
                            boxShadow: '0 2px 4px rgba(0,0,0,0.02)',
                        }}
                    >
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 8, gap: 8 }}>
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
                            {segment.pageNumber !== null && (
                                <span style={{ fontSize: 10, color: '#94a3b8', fontWeight: 500 }}>
                                    Page {segment.pageNumber}
                                </span>
                            )}
                        </div>
                        <div
                            style={{
                                fontSize: 13,
                                color: '#1e293b',
                                lineHeight: 1.5,
                                wordBreak: 'break-word',
                                whiteSpace: 'pre-wrap',
                            }}
                        >
                            {displayLines}
                        </div>
                        {shouldTruncate && (
                            <div style={{ marginTop: 4, fontSize: 11, color: '#2563eb', fontWeight: 600 }}>
                                {isExpanded ? 'Show less' : 'Show more'}
                            </div>
                        )}
                    </div>
                );
            })}
        </div>
    );
}
