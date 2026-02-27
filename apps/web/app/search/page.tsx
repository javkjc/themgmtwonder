'use client';

import { useState, FormEvent, useEffect } from 'react';
import Link from 'next/link';
import Layout from '../components/Layout';
import { useAuth } from '../hooks/useAuth';
import { Button } from '../components/ui/Button';
import { fetchExtractionsSearch, SearchResult } from '../lib/api/search';

export default function SearchPage() {
    const auth = useAuth();

    const today = new Date();
    const oneMonthAgo = new Date(today.getFullYear(), today.getMonth() - 1, today.getDate());
    const toDateStr = (d: Date) =>
        `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

    const [query, setQuery] = useState('');
    const [documentType, setDocumentType] = useState('');
    const [dateFrom, setDateFrom] = useState(toDateStr(oneMonthAgo));
    const [dateTo, setDateTo] = useState(toDateStr(today));

    const [results, setResults] = useState<SearchResult[] | null>(null);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    // redirect to login if not authenticated
    useEffect(() => {
        if (!auth.initialLoad && !auth.me) {
            window.location.href = '/';
        }
    }, [auth.initialLoad, auth.me]);

    const handleSearch = async (e: FormEvent) => {
        e.preventDefault();
        if (!query.trim()) return;

        setLoading(true);
        setError(null);
        try {
            const res = await fetchExtractionsSearch(query, {
                documentType: documentType || undefined,
                dateFrom: dateFrom || undefined,
                dateTo: dateTo || undefined,
            });
            setResults(res.results);
        } catch (err: any) {
            setError(err.message || 'An error occurred while searching.');
            setResults(null);
        } finally {
            setLoading(false);
        }
    };

    if (auth.initialLoad || !auth.me) {
        return null;
    }

    return (
        <Layout currentPage="search" userEmail={auth.me.email} userRole={auth.me.role} isAdmin={auth.me.isAdmin} onLogout={auth.logout}>
            <div className="mb-8">
                <h1 className="text-3xl font-bold tracking-tight mb-2">Semantic Search</h1>
                <p className="text-mono-500">Search across all confirmed extraction data using natural language.</p>
            </div>

            <div className="bg-white dark:bg-mono-900 border border-mono-200 dark:border-mono-800 rounded-md p-6 mb-8">
                <form onSubmit={handleSearch} className="flex flex-col gap-4">
                    <div className="flex gap-4">
                        <div className="flex-1">
                            <input
                                type="text"
                                placeholder="What are you looking for? (e.g. 'invoice total')"
                                className="w-full px-4 py-2 border border-mono-300 dark:border-mono-700 rounded-md bg-transparent focus:outline-none focus:ring-2 focus:ring-blue-500"
                                value={query}
                                onChange={e => setQuery(e.target.value)}
                            />
                        </div>
                        <Button type="submit" variant="primary" size="md" disabled={loading || !query.trim()}>
                            {loading ? 'Searching...' : 'Search'}
                        </Button>
                    </div>

                    <div className="flex gap-4 flex-wrap">
                        <div className="flex-1 min-w-[200px]">
                            <label className="block text-sm font-medium mb-1 text-mono-500 text-left">Date From</label>
                            <input
                                type="date"
                                className="w-full px-4 py-2 border border-mono-300 dark:border-mono-700 rounded-md bg-transparent"
                                value={dateFrom}
                                onChange={e => setDateFrom(e.target.value)}
                            />
                        </div>
                        <div className="flex-1 min-w-[200px]">
                            <label className="block text-sm font-medium mb-1 text-mono-500 text-left">Date To</label>
                            <input
                                type="date"
                                className="w-full px-4 py-2 border border-mono-300 dark:border-mono-700 rounded-md bg-transparent"
                                value={dateTo}
                                onChange={e => setDateTo(e.target.value)}
                            />
                        </div>
                    </div>
                </form>
            </div>

            {error && (
                <div className="bg-red-50 text-red-800 p-4 rounded-md mb-8">
                    {error}
                </div>
            )}

            {results && results.length > 0 && (
                <div className="flex flex-col gap-4">
                    <h2 className="text-xl font-semibold mb-2">Results ({results.length})</h2>
                    {results.map((result, i) => (
                        <div key={result.baselineId || i} className="bg-white dark:bg-mono-900 border border-mono-200 dark:border-mono-800 rounded-md p-6">
                            <div className="flex justify-between items-start mb-4">
                                <div>
                                    <div className="text-sm text-mono-500 flex items-center gap-2 mb-1">
                                        <span className="bg-blue-100 text-blue-800 text-xs font-semibold px-2 py-0.5 rounded dark:bg-blue-900 dark:text-blue-300">
                                            {(result.similarity * 100).toFixed(1)}% Match
                                        </span>
                                        <span>•</span>
                                        <span>{new Date(result.confirmedAt).toLocaleDateString()}</span>
                                        {result.documentTypeId && (
                                            <>
                                                <span>•</span>
                                                <span className="font-mono text-xs">{result.documentTypeId.slice(0, 8)}...</span>
                                            </>
                                        )}
                                    </div>
                                    {result.attachmentId ? (
                                        <Link href={`/attachments/${result.attachmentId}/review`} className="text-lg font-semibold text-blue-600 hover:underline">
                                            View Document →
                                        </Link>
                                    ) : (
                                        <span className="text-lg font-semibold text-mono-700 dark:text-mono-300">Seed Document (No UI available)</span>
                                    )}
                                </div>
                            </div>

                            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                                {result.fieldPreview.map(fp => (
                                    <div key={fp.fieldKey} className="flex flex-col bg-mono-50 dark:bg-mono-800 p-3 rounded-md">
                                        <span className="text-xs text-mono-500 uppercase tracking-wider mb-1">{fp.fieldKey}</span>
                                        <span className="font-medium text-mono-900 dark:text-mono-100 truncate" title={fp.value}>{fp.value}</span>
                                    </div>
                                ))}
                                {result.fieldPreview.length === 0 && (
                                    <span className="text-mono-500 italic text-sm">No fields available</span>
                                )}
                            </div>
                        </div>
                    ))}
                </div>
            )}

            {!loading && !error && results && results.length === 0 && (
                <div className="text-center p-12 border border-dashed border-mono-300 dark:border-mono-700 rounded-md">
                    <p className="text-mono-500">No matching extractions found.</p>
                </div>
            )}
        </Layout>
    );
}
