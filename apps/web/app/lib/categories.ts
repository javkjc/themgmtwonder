/**
 * Category Service Layer
 *
 * This module provides a single source for categories that can be easily
 * switched from hardcoded constants to API-backed categories in the future.
 *
 * Current implementation: Static constants
 * Future implementation: API calls to /categories endpoint
 */

// Default categories (fallback when API is not available or for initial load)
export const DEFAULT_CATEGORIES = ['Work', 'Personal', 'Health', 'Finance', 'Learning', 'Other'] as const;

// Default category colors
export const DEFAULT_CATEGORY_COLORS: Record<string, string> = {
  Work: '#F43F5E',      // coral
  Personal: '#FB7185',  // coral light
  Health: '#10b981',    // green
  Finance: '#f59e0b',   // amber
  Learning: '#ec4899',  // pink
  Other: '#737373',     // gray
};

// Default color for uncategorized items
export const DEFAULT_COLOR = '#F43F5E';

export type CategoryItem = {
  name: string;
  color: string;
};

/**
 * Get category color by name
 * Falls back to default color if category not found
 */
export function getCategoryColor(category: string | null | undefined, customColors?: Record<string, string>): string {
  if (!category) return DEFAULT_COLOR;

  // Check custom colors first (for API-backed categories)
  if (customColors && customColors[category]) {
    return customColors[category];
  }

  // Fall back to default colors
  return DEFAULT_CATEGORY_COLORS[category] || DEFAULT_COLOR;
}

/**
 * Get all available categories
 * Currently returns static list, will be replaced with API call
 */
export function getCategories(): CategoryItem[] {
  return DEFAULT_CATEGORIES.map(name => ({
    name,
    color: DEFAULT_CATEGORY_COLORS[name] || DEFAULT_COLOR,
  }));
}

/**
 * Get category names as a simple array
 */
export function getCategoryNames(): string[] {
  return [...DEFAULT_CATEGORIES];
}

/**
 * Check if a category exists
 */
export function isValidCategory(category: string): boolean {
  return DEFAULT_CATEGORIES.includes(category as typeof DEFAULT_CATEGORIES[number]);
}
