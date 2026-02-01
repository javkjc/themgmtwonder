const baseURL = process.env.PLAYWRIGHT_BASE_URL ?? 'http://localhost:3001';

/**
 * DEPRECATED: Do not use in auth generation scripts.
 * This function calls /auth/me on the API port (3000), but PLAYWRIGHT_BASE_URL
 * points to the web port (3001), causing 404 errors.
 * Auth scripts should verify login via UI markers (data-testid) instead.
 */
async function fetchAuthMe(context) {
  const response = await context.request.get('/auth/me');
  if (!response.ok()) {
    throw new Error('/auth/me failed with status ' + response.status());
  }
  return response.json();
}

/**
 * DEPRECATED: Do not use in auth generation scripts.
 * Use UI markers (data-testid) to verify login state instead.
 */
async function waitForAuthMe(context, options = {}) {
  const { timeout = 15000, interval = 250 } = options;
  const deadline = Date.now() + timeout;
  let lastError = null;

  while (Date.now() < deadline) {
    try {
      const payload = await fetchAuthMe(context);
      if (payload?.email) {
        return payload;
      }
    } catch (err) {
      lastError = err instanceof Error ? err : new Error(String(err));
    }
    await new Promise((resolve) => setTimeout(resolve, interval));
  }

  throw lastError ?? new Error('Timed out waiting for /auth/me');
}

async function readCsrfCookie(context) {
  const cookies = await context.cookies();
  const csrfCookie = cookies.find((cookie) => cookie.name === 'todo_csrf');
  return csrfCookie?.value ?? null;
}

export { baseURL, fetchAuthMe, waitForAuthMe, readCsrfCookie };
