import { expect, type BrowserContext, type Locator, type Page } from '@playwright/test';

// API server base URL (distinct from web server)
const API_BASE = process.env.PLAYWRIGHT_API_BASE_URL ?? 'http://localhost:3000';

/**
 * Converts a relative API path to an absolute URL pointing to the API server.
 * This ensures API requests go to port 3000 (API) instead of port 3001 (web).
 */
function apiUrl(path: string): string {
  return new URL(path, API_BASE).toString();
}

export function uniqueTitle(prefix: string) {
  const suffix = Math.floor(Math.random() * 1_000_000);
  return `${prefix}-${Date.now()}-${suffix}`;
}

export function formatDateTimeLocal(date: Date) {
  const pad = (value: number) => String(value).padStart(2, '0');
  const year = date.getFullYear();
  const month = pad(date.getMonth() + 1);
  const day = pad(date.getDate());
  const hours = pad(date.getHours());
  const minutes = pad(date.getMinutes());
  return `${year}-${month}-${day}T${hours}:${minutes}`;
}

/**
 * Ensures the dashboard is ready for interaction by:
 * 1. Navigating to '/' (baseURL)
 * 2. Checking for expected dashboard state or blocking gates
 * 3. Failing fast with clear errors if auth or ForcePasswordChange gates are active
 *
 * This prevents timeouts when tests run in isolation without proper navigation.
 */
async function ensureDashboardReady(page: Page) {
  const MAX_RETRIES = 3;
  const RETRY_DELAY = 500; // ms

  // Navigate to dashboard
  await page.goto('/');

  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    // Check what's visible on the page
    const createButton = page.getByTestId('task-create-open');
    const authEmail = page.getByTestId('auth-email');
    const authSubmit = page.getByTestId('auth-submit');
    const forcePasswordSubmit = page.getByTestId('forcepw-submit');

    // Wait for one of these states with a short timeout
    try {
      await Promise.race([
        createButton.waitFor({ state: 'visible', timeout: 2000 }),
        authEmail.waitFor({ state: 'visible', timeout: 2000 }),
        authSubmit.waitFor({ state: 'visible', timeout: 2000 }),
        forcePasswordSubmit.waitFor({ state: 'visible', timeout: 2000 }),
      ]);
    } catch {
      // If nothing visible yet and we have retries left, wait and try again
      if (attempt < MAX_RETRIES) {
        await page.waitForTimeout(RETRY_DELAY);
        continue;
      }
      throw new Error('Dashboard ready check timed out: no expected elements became visible');
    }

    // Check which state we're in
    if (await createButton.isVisible()) {
      // Dashboard is ready
      return;
    }

    if (await authEmail.isVisible() || await authSubmit.isVisible()) {
      throw new Error(
        'Not authenticated; storageState missing/expired. ' +
        'Ensure test uses standardUser or adminUser fixture.'
      );
    }

    if (await forcePasswordSubmit.isVisible()) {
      throw new Error(
        'mustChangePassword gate active for standard user. ' +
        'Use adminUser fixture or handle password change in test setup.'
      );
    }

    // If we got here, retry (navigation might still be settling)
    if (attempt < MAX_RETRIES) {
      await page.waitForTimeout(RETRY_DELAY);
    }
  }

  throw new Error('Dashboard ready check failed after retries');
}

export async function createTaskViaModal(page: Page, title: string) {
  await ensureDashboardReady(page);
  await page.getByTestId('task-create-open').click();
  await page.getByTestId('task-title-input').fill(title);
  await page.getByTestId('task-save').click();
  await waitForToast(page, 'Task created');
}

export async function waitForToast(page: Page, title: string) {
  await expect(
    page.getByTestId('toast-success').filter({ hasText: title })
  ).toBeVisible({ timeout: 15_000 });
}

/**
 * Attempts to wait for a toast message, but does not throw if the toast is not found.
 * Use this for best-effort toast verification when the primary assertion is persisted state.
 */
export async function tryWaitForToast(page: Page, title: string, timeout = 3000) {
  try {
    await expect(
      page.getByTestId('toast-success').filter({ hasText: title })
    ).toBeVisible({ timeout });
  } catch {
    // Toast not found or timeout - this is acceptable for optional toast checks
  }
}

export function getTaskRowByTitle(page: Page, title: string): Locator {
  return page
    .locator('tr[data-testid^="task-row-"]')
    .filter({ hasText: title });
}

export async function getCsrfToken(context: BrowserContext) {
  const cookies = await context.cookies();
  return cookies.find((cookie) => cookie.name === 'todo_csrf')?.value ?? '';
}

async function mutateRequest(
  context: BrowserContext,
  method: 'post' | 'patch' | 'put' | 'delete',
  path: string,
  body?: unknown
) {
  const csrf = await getCsrfToken(context);
  const api = context.request as Record<string, any>;
  const response = await api[method](apiUrl(path), {
    headers: {
      'Content-Type': 'application/json',
      'x-csrf-token': csrf,
    },
    data: body ? JSON.stringify(body) : undefined,
  });
  if (!response.ok()) {
    throw new Error(`API ${method.toUpperCase()} ${path} failed: ${await response.text()}`);
  }

  return response.json().catch(() => null);
}

export async function apiGet(context: BrowserContext, path: string) {
  const response = await context.request.get(apiUrl(path));
  if (!response.ok()) {
    throw new Error(`API GET ${path} failed: ${await response.text()}`);
  }
  return response.json();
}

export const apiPost = (
  context: BrowserContext,
  path: string,
  body?: unknown
) => mutateRequest(context, 'post', path, body);
export const apiPatch = (
  context: BrowserContext,
  path: string,
  body?: unknown
) => mutateRequest(context, 'patch', path, body);
export const apiPut = (
  context: BrowserContext,
  path: string,
  body?: unknown
) => mutateRequest(context, 'put', path, body);
export const apiDelete = (
  context: BrowserContext,
  path: string,
  body?: unknown
) => mutateRequest(context, 'delete', path, body);

export async function fetchTodoByTitle(context: BrowserContext, title: string) {
  const todos = (await apiGet(context, '/todos')) as Array<{ title: string } & Record<string, unknown>>;
  return todos.find((todo) => todo.title === title);
}

export function buildFutureDateTime(minutesAhead = 90) {
  const date = new Date();
  date.setMinutes(date.getMinutes() + minutesAhead);
  return formatDateTimeLocal(date);
}
