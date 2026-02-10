import { test as setup } from '@playwright/test';
import * as fs from 'fs';
import * as path from 'path';

const ADMIN_EMAIL = 'admin@taskflow.local';
const ADMIN_PASSWORD = 'TemporaryPassword123!';
const ADMIN_NEW_PASSWORD = 'SecurePassword456!';
const AUTH_DIR = path.join(process.cwd(), '.auth');
const AUTH_FILE = path.join(AUTH_DIR, 'user.json');

setup('authenticate', async ({ page }) => {
    // Ensure auth directory exists
    if (!fs.existsSync(AUTH_DIR)) {
        fs.mkdirSync(AUTH_DIR, { recursive: true });
    }

    console.log('Navigating to login page...');
    await page.goto('/');

    // Wait for network idle to ensure hydration
    try {
        await page.waitForLoadState('networkidle', { timeout: 15000 });
    } catch (e) {
        console.log('Network idle timeout, proceeding check...');
    }

    // Check state by URL and selectors
    const url = page.url();
    console.log(`Current URL: ${url}`);

    const loginVisible = await page.getByTestId('auth-email').isVisible({ timeout: 5000 }).catch(() => false);
    const dashboardVisible = await page.getByTestId('task-create-open').isVisible({ timeout: 5000 }).catch(() => false);

    console.log(`State Check: LoginVisible=${loginVisible}, DashboardVisible=${dashboardVisible}`);

    if (loginVisible) {
        console.log('At login page - proceeding with login');

        await page.getByTestId('auth-email').fill(ADMIN_EMAIL);
        await page.getByTestId('auth-password').fill(ADMIN_PASSWORD);
        await page.getByTestId('auth-submit').click();

        // Wait for navigation
        await page.waitForURL('**/', { timeout: 10000 });

        // Check if password change is required
        const changePasswordVisible = await page.getByTestId('auth-new-password')
            .isVisible({ timeout: 3000 })
            .catch(() => false);

        if (changePasswordVisible) {
            console.log('Password change required');
            await page.getByTestId('auth-new-password').fill(ADMIN_NEW_PASSWORD);
            await page.getByTestId('auth-confirm-password').fill(ADMIN_NEW_PASSWORD);
            await page.getByTestId('auth-submit').click();

            // Wait for navigation to dashboard
            await page.waitForURL('**/', { timeout: 10000 });
        }

        // Verify we're on dashboard
        const dashboardReady = await page.getByTestId('task-create-open')
            .isVisible({ timeout: 10000 })
            .catch(() => false);

        if (!dashboardReady) {
            await page.screenshot({ path: 'auth-setup-failure.png' });
            throw new Error('Failed to reach dashboard after login');
        }

        console.log('Login successful, saving auth state');
        await page.context().storageState({ path: AUTH_FILE });
    } else if (dashboardVisible) {
        console.log('Already authenticated, saving auth state');
        await page.context().storageState({ path: AUTH_FILE });
    } else {
        await page.screenshot({ path: 'auth-setup-failure.png' });
        throw new Error('Could not determine auth state');
    }

    console.log('Authentication setup complete');
});
