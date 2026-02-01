import { chromium } from 'playwright';
import { baseURL } from '../tests/_fixtures/auth.mjs';
import { mkdirSync } from 'fs';

const standardEmail = process.env.STANDARD_EMAIL ?? 'standard@example.com';
const standardPassword = process.env.STANDARD_PASSWORD ?? 'standard123';
const newPassword = process.env.NEW_PASSWORD ?? 'Password123!234';
const storagePath = '.auth/standard.json';
const DEBUG = process.env.PW_DEBUG === '1';

async function run() {
  if (DEBUG) {
    try {
      mkdirSync('debug', { recursive: true });
    } catch (e) {
      // ignore if exists
    }
  }

  const browser = await chromium.launch({
    headless: !DEBUG,
    slowMo: DEBUG ? 200 : 0
  });
  let context;

  try {
    context = await browser.newContext({ baseURL });
    const page = await context.newPage();
    await page.goto('/', { waitUntil: 'networkidle' });
    await page.waitForSelector('[data-testid="auth-email"]', { timeout: 45000 });

    const toggle = page.getByTestId('auth-toggle-mode');
    if (await toggle.isVisible()) {
      await toggle.click();
    }

    await page.getByTestId('auth-email').fill(standardEmail);
    await page.getByTestId('auth-password').fill(standardPassword);

    if (DEBUG) {
      await page.screenshot({ path: 'debug/standard-01-before-submit.png', fullPage: true });
      console.log('[DEBUG] Screenshot taken: debug/standard-01-before-submit.png');
    }

    // Try registration first
    const registerResponsePromise = page.waitForResponse((response) =>
      response.url().includes('/auth/register') && response.request().method() === 'POST'
    );

    await page.getByTestId('auth-submit').click();
    const registerResponse = await registerResponsePromise;

    if (DEBUG) {
      console.log('[DEBUG] Register response status:', registerResponse.status());
      await page.waitForTimeout(1000);
      await page.screenshot({ path: 'debug/standard-02-after-submit.png', fullPage: true });
      console.log('[DEBUG] Screenshot taken: debug/standard-02-after-submit.png');
      console.log('[DEBUG] Current URL after submit:', page.url());

      const forcePwSubmitVisible = await page.getByTestId('forcepw-submit').isVisible().catch(() => false);
      const authFormVisible = await page.getByTestId('auth-email').isVisible().catch(() => false);
      const taskCreateVisible = await page.getByTestId('task-create-open').isVisible().catch(() => false);

      console.log('[DEBUG] forcepw-submit visible:', forcePwSubmitVisible);
      console.log('[DEBUG] auth-email (still on login) visible:', authFormVisible);
      console.log('[DEBUG] task-create-open (dashboard) visible:', taskCreateVisible);
    }

    // If registration failed with 409 (user exists), switch to login mode
    if (registerResponse.status() === 409) {
      console.log('User already exists (409), switching to login mode...');

      // Toggle to login mode (click "Already have an account? Login")
      const toggle = page.getByTestId('auth-toggle-mode');
      await toggle.click();
      await page.waitForTimeout(500);

      // Re-fill credentials (form may have been cleared)
      await page.getByTestId('auth-email').fill(standardEmail);
      await page.getByTestId('auth-password').fill(standardPassword);

      // Wait for login response
      const loginResponsePromise = page.waitForResponse((response) =>
        response.url().includes('/auth/login') && response.request().method() === 'POST'
      );

      await page.getByTestId('auth-submit').click();
      const loginResponse = await loginResponsePromise;

      if (DEBUG) {
        console.log('[DEBUG] Login response status:', loginResponse.status());
      }

      if (!loginResponse.ok()) {
        throw new Error(`Login failed with status ${loginResponse.status()}`);
      }
    } else if (!registerResponse.ok()) {
      throw new Error(`Registration failed with status ${registerResponse.status()}`);
    }

    // Wait briefly for any redirects/state updates
    await page.waitForTimeout(1000);

    // Check if force password change is required
    const forcePwSubmit = page.getByTestId('forcepw-submit');
    const isForcePwVisible = await forcePwSubmit.isVisible().catch(() => false);

    if (isForcePwVisible) {
      console.log('Force password change detected, completing flow...');
      await page.getByTestId('forcepw-current').fill(standardPassword);
      await page.getByTestId('forcepw-new').fill(newPassword);
      await page.getByTestId('forcepw-confirm').fill(newPassword);
      await forcePwSubmit.click();

      // Wait for navigation after password change
      await page.waitForTimeout(1000);
    }

    // Verify login by waiting for the task dashboard to load
    await page.getByTestId('task-create-open').waitFor({ state: 'visible', timeout: 20000 });
    console.log('Successfully authenticated as', standardEmail);

    if (DEBUG) {
      await page.screenshot({ path: 'debug/standard-03-final.png', fullPage: true });
      console.log('[DEBUG] Screenshot taken: debug/standard-03-final.png');
      console.log('[DEBUG] Keeping browser open for 10s...');
      await page.waitForTimeout(10000);
    }

    await context.storageState({ path: storagePath });
    console.log('Storage state written to', storagePath);
  } finally {
    await browser.close();
  }
}

run().catch((error) => {
  console.error(error);
  process.exit(1);
});
