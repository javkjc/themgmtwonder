'use client';

import { useState, useEffect, useCallback } from 'react';
import { apiFetchJson, isUnauthorized } from '../lib/api';
import { DEFAULT_CATEGORIES, DEFAULT_CATEGORY_COLORS, DEFAULT_COLOR } from '../lib/categories';

export type Category = {
  id: string;
  userId: string;
  name: string;
  color: string;
  sortOrder: number;
  createdAt: string;
};

export type CategoriesState = {
  categories: Category[];
  loading: boolean;
  error: string | null;
  colorMap: Record<string, string>;
};

export type CategoriesActions = {
  getCategoryColor: (category: string | null | undefined) => string;
  getCategoryNames: () => string[];
  refresh: () => Promise<void>;
};

/**
 * Hook to manage categories from the API
 * Falls back to default categories if API call fails or user is not authenticated
 */
export function useCategories(userId: string | null): CategoriesState & CategoriesActions {
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [colorMap, setColorMap] = useState<Record<string, string>>(DEFAULT_CATEGORY_COLORS);

  const buildColorMap = useCallback((cats: Category[]) => {
    const map: Record<string, string> = {};
    cats.forEach(cat => {
      map[cat.name] = cat.color;
    });
    // Merge with defaults in case some defaults are used but not in user categories
    return { ...DEFAULT_CATEGORY_COLORS, ...map };
  }, []);

  const fetchCategories = useCallback(async () => {
    if (!userId) {
      setCategories([]);
      setColorMap(DEFAULT_CATEGORY_COLORS);
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const data = await apiFetchJson('/categories');
      const cats = data as Category[];
      setCategories(cats);
      setColorMap(buildColorMap(cats));
    } catch (e: any) {
      if (isUnauthorized(e)) {
        setCategories([]);
        setColorMap(DEFAULT_CATEGORY_COLORS);
      } else {
        setError(e?.message || 'Failed to fetch categories');
        // Keep using default colors on error
      }
    } finally {
      setLoading(false);
    }
  }, [userId, buildColorMap]);

  useEffect(() => {
    fetchCategories();
  }, [fetchCategories]);

  const getCategoryColor = useCallback((category: string | null | undefined): string => {
    if (!category) return DEFAULT_COLOR;
    return colorMap[category] || DEFAULT_COLOR;
  }, [colorMap]);

  const getCategoryNames = useCallback((): string[] => {
    if (categories.length > 0) {
      return categories.map(c => c.name);
    }
    // Fall back to defaults
    return [...DEFAULT_CATEGORIES];
  }, [categories]);

  const refresh = useCallback(async () => {
    await fetchCategories();
  }, [fetchCategories]);

  return {
    categories,
    loading,
    error,
    colorMap,
    getCategoryColor,
    getCategoryNames,
    refresh,
  };
}
