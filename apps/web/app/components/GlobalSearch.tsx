'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { apiFetchJson, isUnauthorized } from '../lib/api';
import { getCategoryColor } from '../lib/categories';
import { useToast } from './ToastProvider';
import type { Todo } from '../hooks/useTodos';

export default function GlobalSearch() {
  const router = useRouter();
  const { showToast } = useToast();
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<Todo[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const debounceRef = useRef<NodeJS.Timeout | null>(null);

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const search = useCallback(async (searchQuery: string) => {
    if (!searchQuery.trim()) {
      setResults([]);
      setError(null);
      return;
    }

    setLoading(true);
    setError(null);
    try {
      const data = await apiFetchJson(`/todos/search?q=${encodeURIComponent(searchQuery)}&limit=10`);
      if (Array.isArray(data)) {
        setResults(data as Todo[]);
      } else {
        // Handle unexpected response format gracefully
        setResults([]);
      }
    } catch (e: any) {
      if (isUnauthorized(e)) {
        setResults([]);
        // Don't set error for auth issues - will redirect
      } else {
        setError('Search unavailable');
        setResults([]);
        showToast('Search unavailable', 'error');
      }
    } finally {
      setLoading(false);
    }
  }, [showToast]);

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    setQuery(value);
    setIsOpen(true);

    // Debounce the search
    if (debounceRef.current) {
      clearTimeout(debounceRef.current);
    }
    debounceRef.current = setTimeout(() => {
      search(value);
    }, 300);
  };

  const handleResultClick = (todo: Todo) => {
    // Navigate directly to task detail page
    router.push(`/task/${todo.id}`);
    setIsOpen(false);
    setQuery('');
    setResults([]);
  };

  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr);
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  };

  return (
    <div ref={containerRef} style={{ position: 'relative', width: '100%', maxWidth: 300 }}>
      <input
        type="text"
        value={query}
        onChange={handleInputChange}
        onFocus={() => query && setIsOpen(true)}
        placeholder="Search tasks..."
        style={{
          width: '100%',
          padding: '8px 12px 8px 36px',
          border: '1px solid rgba(255,255,255,0.2)',
          borderRadius: 8,
          fontSize: 13,
          background: 'rgba(255,255,255,0.1)',
          color: 'white',
          outline: 'none',
        }}
      />
      <svg
        style={{
          position: 'absolute',
          left: 12,
          top: '50%',
          transform: 'translateY(-50%)',
          width: 16,
          height: 16,
          opacity: 0.5,
        }}
        fill="none"
        stroke="currentColor"
        viewBox="0 0 24 24"
      >
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
      </svg>

      {/* Results Dropdown */}
      {isOpen && (query || results.length > 0) && (
        <div style={{
          position: 'absolute',
          top: '100%',
          left: 0,
          right: 0,
          marginTop: 4,
          background: 'white',
          borderRadius: 8,
          boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
          maxHeight: 320,
          overflowY: 'auto',
          zIndex: 1000,
        }}>
          {loading ? (
            <div style={{ padding: 16, textAlign: 'center', color: '#64748b', fontSize: 13 }}>
              Searching...
            </div>
          ) : error ? (
            <div style={{ padding: 16, textAlign: 'center', color: '#dc2626', fontSize: 13 }}>
              {error}
            </div>
          ) : results.length === 0 && query ? (
            <div style={{ padding: 16, textAlign: 'center', color: '#64748b', fontSize: 13 }}>
              No tasks found
            </div>
          ) : (
            results.map((todo) => (
              <div
                key={todo.id}
                onClick={() => handleResultClick(todo)}
                style={{
                  padding: '12px 16px',
                  borderBottom: '1px solid #f1f5f9',
                  cursor: 'pointer',
                  transition: 'background 0.1s',
                }}
                onMouseOver={(e) => { e.currentTarget.style.background = '#f8fafc'; }}
                onMouseOut={(e) => { e.currentTarget.style.background = 'transparent'; }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  {/* Status indicator */}
                  <div style={{
                    width: 8,
                    height: 8,
                    borderRadius: '50%',
                    background: todo.done ? '#10b981' : (todo.startAt ? '#3b82f6' : '#94a3b8'),
                  }} />
                  <div style={{
                    fontSize: 14,
                    fontWeight: 500,
                    color: todo.done ? '#64748b' : '#1e293b',
                    textDecoration: todo.done ? 'line-through' : 'none',
                    flex: 1,
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                  }}>
                    {todo.title}
                  </div>
                  {/* Short task ID */}
                  <span style={{
                    fontFamily: 'monospace',
                    fontSize: 10,
                    color: '#94a3b8',
                    background: '#f1f5f9',
                    padding: '2px 5px',
                    borderRadius: 3,
                    flexShrink: 0,
                  }}>
                    {todo.id.slice(0, 8)}
                  </span>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 4, paddingLeft: 16 }}>
                  {todo.category && (
                    <span style={{
                      fontSize: 11,
                      color: getCategoryColor(todo.category),
                      fontWeight: 500,
                    }}>
                      {todo.category}
                    </span>
                  )}
                  <span style={{ fontSize: 11, color: '#94a3b8' }}>
                    {todo.startAt ? `Scheduled ${formatDate(todo.startAt)}` : 'Unscheduled'}
                  </span>
                </div>
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
}
