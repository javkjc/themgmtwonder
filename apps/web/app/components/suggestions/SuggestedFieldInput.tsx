'use client';

import React from 'react';
import { Assignment, Segment } from '@/app/types';

interface SuggestedFieldInputProps {
    assignment: Assignment;
    segments?: Segment[];
    isReadOnly?: boolean;
    value: string;
    onChange: (value: string) => void;
    onBlur: (value: string) => void;
    placeholder?: string;
    type?: string;
    inputMode?: 'none' | 'text' | 'tel' | 'url' | 'email' | 'numeric' | 'decimal' | 'search';
    step?: string;
    onAccept?: () => void;
}

const getConfidenceColor = (confidence: number) => {
    if (confidence >= 0.80) return '#16a34a'; // Green
    if (confidence >= 0.60) return '#ea580c'; // Orange
    return '#737373'; // Gray for Low
};

const getConfidenceLabel = (confidence: number) => {
    if (confidence >= 0.80) return 'High Confidence';
    if (confidence >= 0.60) return 'Medium Confidence';
    return 'Low Confidence';
};

export default function SuggestedFieldInput({
    assignment,
    segments = [],
    isReadOnly,
    value,
    onChange,
    onBlur,
    placeholder,
    type = 'text',
    inputMode,
    step,
    onAccept,
}: SuggestedFieldInputProps) {
    const confidence = assignment.suggestionConfidence ?? 0;
    const sourceSegment = segments.find((s) => s.id === assignment.sourceSegmentId);

    const segmentText = sourceSegment?.text || '';
    const truncatedSegment = segmentText.length > 30 ? segmentText.slice(0, 27) + '...' : segmentText;

    const isSuggested = assignment.suggestionAccepted === null && assignment.suggestionConfidence !== null;
    const isAccepted = assignment.suggestionAccepted === true;
    const isModified = assignment.suggestionAccepted === false && assignment.correctedFrom !== null;

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, width: '100%', position: 'relative' }}>
            <div style={{ position: 'relative', width: '100%', display: 'flex', alignItems: 'center', gap: 8 }}>
                <div style={{ position: 'relative', flex: 1 }}>
                    <input
                        value={value}
                        disabled={isReadOnly}
                        onChange={(e) => onChange(e.target.value)}
                        onBlur={(e) => onBlur(e.target.value)}
                        placeholder={placeholder}
                        type={type}
                        inputMode={inputMode}
                        step={step}
                        style={{
                            width: '100%',
                            borderRadius: 10,
                            border: isAccepted ? '1px solid #16a34a' : isModified ? '1px solid #ea580c' : '1px solid #d4d4d4',
                            padding: '10px 12px',
                            fontSize: 14,
                            color: isSuggested ? '#737373' : '#111111',
                            background: isReadOnly ? '#fafafa' : '#ffffff',
                            outline: 'none',
                            transition: 'all 0.2s ease',
                            fontStyle: isSuggested ? 'italic' : 'normal',
                            paddingRight: isSuggested ? '60px' : '12px',
                        }}
                    />

                    {isSuggested && (
                        <div
                            style={{
                                position: 'absolute',
                                right: 8,
                                top: '50%',
                                transform: 'translateY(-50%)',
                                display: 'flex',
                                alignItems: 'center',
                                gap: 4,
                            }}
                        >
                            <div
                                title={`${getConfidenceLabel(confidence)} (${Math.round(confidence * 100)}%)\nSuggested from: ${segmentText}`}
                                style={{
                                    fontSize: 10,
                                    fontWeight: 700,
                                    padding: '2px 8px',
                                    borderRadius: 99,
                                    color: '#ffffff',
                                    background: getConfidenceColor(confidence),
                                    cursor: 'help',
                                    boxShadow: '0 2px 4px rgba(0,0,0,0.1)',
                                    whiteSpace: 'nowrap',
                                }}
                            >
                                {Math.round(confidence * 100)}%
                            </div>
                        </div>
                    )}

                    {isAccepted && (
                        <div style={{ position: 'absolute', right: -24, top: '50%', transform: 'translateY(-50%)', color: '#16a34a', fontSize: 16 }} title="Suggestion Accepted">
                            ✅
                        </div>
                    )}
                    {isModified && (
                        <div style={{ position: 'absolute', right: -24, top: '50%', transform: 'translateY(-50%)', color: '#ea580c', fontSize: 16 }} title="Suggestion Modified">
                            🟠
                        </div>
                    )}
                </div>

                {isSuggested && !isReadOnly && onAccept && (
                    <button
                        onClick={(e) => {
                            e.preventDefault();
                            onAccept();
                        }}
                        style={{
                            padding: '6px 12px',
                            background: '#16a34a',
                            color: 'white',
                            border: 'none',
                            borderRadius: 8,
                            fontSize: 12,
                            fontWeight: 700,
                            cursor: 'pointer',
                            whiteSpace: 'nowrap',
                            boxShadow: '0 2px 4px rgba(22, 163, 74, 0.2)',
                            transition: 'all 0.2s ease',
                        }}
                    >
                        Accept
                    </button>
                )}
            </div>

            {isSuggested && sourceSegment && (
                <div
                    style={{
                        fontSize: 11,
                        color: 'var(--text-muted)',
                        display: 'flex',
                        alignItems: 'center',
                        gap: 4,
                        marginLeft: 4
                    }}
                    title={segmentText}
                >
                    <span style={{ fontWeight: 600 }}>Suggested from:</span>
                    <span>{truncatedSegment}</span>
                </div>
            )}
        </div>
    );
}
