'use client';

import React from 'react';
import { TableSuggestion } from '@/app/lib/api/tables';

interface TableSuggestionBannerProps {
    suggestion: TableSuggestion;
    onPreview: (suggestion: TableSuggestion) => void;
    onIgnore: (suggestion: TableSuggestion) => void;
}

export default function TableSuggestionBanner({
    suggestion,
    onPreview,
    onIgnore,
}: TableSuggestionBannerProps) {
    const confidencePercent = Math.round(suggestion.confidence * 100);

    let badgeColor = 'bg-yellow-100 text-yellow-800 border-yellow-200';
    if (suggestion.confidence >= 0.8) {
        badgeColor = 'bg-green-100 text-green-800 border-green-200';
    } else if (suggestion.confidence < 0.6) {
        badgeColor = 'bg-red-100 text-red-800 border-red-200';
    }

    return (
        <div className="flex items-center justify-between p-4 mb-4 bg-white border border-blue-200 rounded-lg shadow-sm animate-in fade-in slide-in-from-top-4 duration-500">
            <div className="flex items-center space-x-4">
                <div className="flex items-center justify-center w-10 h-10 bg-blue-50 text-blue-600 rounded-full">
                    <svg
                        xmlns="http://www.w3.org/2000/svg"
                        className="h-6 w-6"
                        fill="none"
                        viewBox="0 0 24 24"
                        stroke="currentColor"
                    >
                        <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeWidth={2}
                            d="M3 10h18M3 14h18m-9-4v8m-7 0h14a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z"
                        />
                    </svg>
                </div>
                <div>
                    <h4 className="text-sm font-semibold text-gray-900">
                        Suggested Table Detected ({suggestion.rowCount}x{suggestion.columnCount})
                    </h4>
                    <div className="flex items-center mt-1 space-x-2">
                        <span className={`px-2 py-0.5 text-xs font-medium border rounded-full ${badgeColor}`}>
                            {confidencePercent}% Confidence
                        </span>
                        {suggestion.suggestedLabel && (
                            <span className="text-xs text-gray-500 italic">
                                "{suggestion.suggestedLabel}"
                            </span>
                        )}
                    </div>
                </div>
            </div>
            <div className="flex items-center space-x-2">
                <button
                    onClick={() => onPreview(suggestion)}
                    className="px-3 py-1.5 text-sm font-medium text-blue-600 bg-blue-50 rounded-md hover:bg-blue-100 transition-colors"
                >
                    Preview
                </button>
                <button
                    onClick={() => onIgnore(suggestion)}
                    className="p-1.5 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-md transition-colors"
                    title="Ignore"
                >
                    <svg
                        xmlns="http://www.w3.org/2000/svg"
                        className="h-5 w-5"
                        fill="none"
                        viewBox="0 0 24 24"
                        stroke="currentColor"
                    >
                        <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeWidth={2}
                            d="M6 18L18 6M6 6l12 12"
                        />
                    </svg>
                </button>
            </div>
        </div>
    );
}
