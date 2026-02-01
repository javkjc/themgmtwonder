import { chromium } from 'playwright';
import { baseURL } from '../tests/_fixtures/auth.mjs';

const adminEmail = process.env.ADMIN_EMAIL ?? 'admin@example.com';
const adminPassword = process.env.ADMIN_PASSWORD ?? '12341234';
const adminNewPassword = process.env.ADMIN_NEW_PASSWORD ?? 'adminNewPassword1!';
const storagePath = '.auth/admin.json';

async function performLogin(page, email, password) {
  await page.getByTestId('auth-email').fill(email);
  await page.getByTestId('auth-password').fill(password);

  const loginResponse = page.waitForResponse((response) =>
    response.url().includes('/auth/login') && response.request().method() === 'POST'
  );

  await page.getByTestId('auth-submit').click();
  await loginResponse;
}

async function handleForcePasswordChange(page, currentPassword, newPassword) {
  try {
    await page.getByTestId('forcepw-current').waitFor({ state: 'visible', timeout: 4000 });
  } catch {
    return false;
  }

  if (newPassword === currentPassword) {
    throw new Error('ADMIN_NEW_PASSWORD must differ from ADMIN_PASSWORD when a forced change is required.');
  }

  await page.getByTestId('forcepw-current').fill(currentPassword);
  await page.getByTestId('forcepw-new').fill(newPassword);
  await page.getByLabel('Confirm New Password').fill(newPassword);

  const changeResponse = page.waitForResponse((response) =>
    response.url().includes('/auth/change-password') && response.request().method() === 'POST'
  );

  await page.getByTestId('forcepw-submit').click();
  await changeResponse;

  await page.getByTestId('forcepw-current').waitFor({ state: 'hidden', timeout: 10000 });
  await page.waitForURL('**/', { waitUntil: 'domcontentloaded', timeout: 10000 });

  return true;
}

async function run() {
  const browser = await chromium.launch();
  let context;

  try {
    context = await browser.newContext({ baseURL });
    const page = await context.newPage();
    await page.goto('/', { waitUntil: 'networkidle' });
    await page.waitForSelector('[data-testid="auth-email"]', { timeout: 45000 });

    await performLogin(page, adminEmail, adminPassword);
    const changed = await handleForcePasswordChange(page, adminPassword, adminNewPassword);

    if (changed) {
      await page.waitForSelector('[data-testid=auth-email]', { timeout: 5000 });
      await performLogin(page, adminEmail, adminNewPassword);
    }

    // Verify admin login by waiting for the admin navigation link to appear
    await page.getByTestId('admin-nav').waitFor({ state: 'visible', timeout: 20000 });
    console.log('Admin authenticated successfully as', adminEmail);

    // Verify we can navigate to admin page without redirect
    await page.goto('/admin');
    await page.getByTestId('admin-search-input').waitFor({ state: 'visible', timeout: 10000 });
    console.log('Admin access verified');

    await context.storageState({ path: storagePath });
    console.log('Admin storage state saved to', storagePath);
  } finally {
    await browser.close();
  }
}

run().catch((error) => {
  console.error(error);
  process.exit(1);
});
