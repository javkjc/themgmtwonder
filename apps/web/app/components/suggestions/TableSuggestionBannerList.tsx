'use client';

import React from 'react';
import { TableSuggestion } from '@/app/lib/api/tables';
import TableSuggestionBanner from './TableSuggestionBanner';

interface TableSuggestionBannerListProps {
    suggestions: TableSuggestion[];
    onPreview: (suggestion: TableSuggestion) => void;
    onIgnore: (suggestion: TableSuggestion) => void;
}

export default function TableSuggestionBannerList({
    suggestions,
    onPreview,
    onIgnore,
}: TableSuggestionBannerListProps) {
    if (suggestions.length === 0) {
        return null;
    }

    return (
        <div className="w-full">
            {suggestions.map((suggestion) => (
                <TableSuggestionBanner
                    key={suggestion.id}
                    suggestion={suggestion}
                    onPreview={onPreview}
                    onIgnore={onIgnore}
                />
            ))}
        </div>
    );
}
