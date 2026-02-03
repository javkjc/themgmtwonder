const API = process.env.NEXT_PUBLIC_API_BASE_URL || 'http://localhost:3000';
export const API_BASE_URL = API;
export const CSRF_COOKIE_NAME =
  process.env.NEXT_PUBLIC_CSRF_COOKIE_NAME || 'todo_csrf';
export const CSRF_HEADER_NAME =
  process.env.NEXT_PUBLIC_CSRF_HEADER_NAME || 'x-csrf-token';

function getCookie(name: string): string | null {
  if (typeof document === 'undefined') return null;
  const cookies = document.cookie?.split(';') ?? [];
  for (const cookie of cookies) {
    const [key, ...rest] = cookie.trim().split('=');
    if (key === name) {
      return decodeURIComponent(rest.join('='));
    }
  }
  return null;
}

export function getCsrfToken(): string | null {
  return getCookie(CSRF_COOKIE_NAME);
}

function applyCsrfHeader(headers: Record<string, string>) {
  const token = getCsrfToken();
  if (token && !headers[CSRF_HEADER_NAME]) {
    headers[CSRF_HEADER_NAME] = token;
  }
  return headers;
}

export async function apiFetchJson(path: string, init?: RequestInit): Promise<any> {
  const baseHeaders =
    (init?.headers as Record<string, string | undefined>) ?? {};
  const headers = applyCsrfHeader({
    'Content-Type': 'application/json',
    ...baseHeaders,
  });

  const res = await fetch(`${API}${path}`, {
    ...init,
    headers,
    credentials: 'include', // crucial for httpOnly cookie auth
  });

  const text = await res.text();

  if (!res.ok) {
    let parsed: any = null;
    try {
      parsed = text ? JSON.parse(text) : null;
    } catch {
      parsed = null;
    }

    const err: any = new Error(parsed?.message || text || `HTTP ${res.status}`);
    err.status = res.status;
    err.body = parsed;
    throw err;
  }

  if (!text) return null;

  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

export function isUnauthorized(e: any) {
  return e?.status === 401 || String(e?.message || '').includes('"statusCode":401');
}

export function isForbidden(e: any) {
  return e?.status === 403 || String(e?.message || '').includes('"statusCode":403');
}

export function isNetworkError(e: any) {
  const msg = String(e?.message || '');
  return msg.includes('Failed to fetch') || msg.includes('NetworkError');
}
