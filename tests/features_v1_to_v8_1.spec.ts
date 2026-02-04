
import { test, expect, chromium } from '@playwright/test';
import * as fs from 'fs';
import * as path from 'path';

const ADMIN_EMAIL = 'admin@taskflow.local';
const ADMIN_PASSWORD = 'TemporaryPassword123!';
const ADMIN_NEW_PASSWORD = 'SecurePassword456!';
const AUTH_DIR = path.join(process.cwd(), '.auth');
const AUTH_FILE = path.join(AUTH_DIR, 'user.json');

// Helper for unique IDs
const uniqueId = () => Math.random().toString(36).substring(2, 8);

test.describe('Full System Feature Coverage (v1 - v8.1)', () => {

    test.beforeAll(async ({ browser }) => {
        // Ensure auth directory exists
        if (!fs.existsSync(AUTH_DIR)) {
            fs.mkdirSync(AUTH_DIR, { recursive: true });
        }

        const context = await browser.newContext();
        const page = await context.newPage();

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

        if (dashboardVisible) {
            console.log('Already logged in.');
            await context.storageState({ path: AUTH_FILE });
        } else if (loginVisible) {
            console.log('Logging in as Admin...');
            await page.getByTestId('auth-email').fill(ADMIN_EMAIL);
            await page.getByTestId('auth-password').fill(ADMIN_PASSWORD);
            await page.getByTestId('auth-submit').click();

            // Wait for next state: Dashboard OR Password Change
            const dashboard = page.getByTestId('task-create-open');
            const passChange = page.getByPlaceholder('New Password');

            try {
                await Promise.race([
                    dashboard.waitFor({ state: 'visible', timeout: 20000 }),
                    passChange.waitFor({ state: 'visible', timeout: 20000 })
                ]);
            } catch (e) {
                console.log('Timeout waiting for login transition.');
                await page.screenshot({ path: 'login-timeout.png' });
                throw new Error('Login transition timed out');
            }

            if (await passChange.isVisible()) {
                console.log('Force Password Change detected. Updating...');
                await passChange.fill(ADMIN_NEW_PASSWORD);
                const updateBtn = page.getByRole('button', { name: /update|change/i });
                await updateBtn.click();
                await dashboard.waitFor({ state: 'visible', timeout: 20000 });
            }

            if (await dashboard.isVisible()) {
                console.log('Login successful. Saving state.');
                await context.storageState({ path: AUTH_FILE });
            } else {
                throw new Error('Dashboard not visible after login');
            }
        } else {
            console.error('Neither login form nor dashboard visible.');
            await page.screenshot({ path: 'auth-failure.png' });
            throw new Error('Could not determine auth state');
        }

        await page.close();
        await context.close();
    });

    test.use({ storageState: AUTH_FILE });

    test('v1: Task Lifecycle (Create, Edit, Pin, Remark)', async ({ page }) => {
        const title = `Task v1-${uniqueId()}`;
        const newTitle = `${title} (Edited)`;

        await page.goto('/');
        await expect(page.getByTestId('task-create-open')).toBeVisible();

        // Create
        await page.getByTestId('task-create-open').click();
        await page.getByTestId('task-title-input').fill(title);
        await page.getByTestId('task-save').click();

        // Use first() to avoid strict mode violation with notification toast
        await expect(page.getByText(title).first()).toBeVisible();

        // Pin
        const row = page.locator('tr', { hasText: title }).first();
        const pinBtn = row.locator('button[data-testid^="task-pin-"]');
        await pinBtn.click();

        // Verify pinned status
        await expect(row.getByText('Pinned')).toBeVisible();

        // Edit
        await row.getByRole('button', { name: /edit/i }).click();
        const editTitleInput = page.getByPlaceholder('Task title');
        await editTitleInput.clear();
        await editTitleInput.fill(newTitle);
        await page.getByRole('button', { name: 'Save' }).click();

        await expect(page.getByText(newTitle).first()).toBeVisible();

        // Add Remark
        // Open detail page
        await page.getByText(newTitle).first().click();
        await expect(page.getByRole('heading', { name: /Remarks/i })).toBeVisible();

        await page.getByTestId('remark-input').fill('Full feature coverage remark');
        await page.getByTestId('remark-submit').click();

        await expect(page.getByText('Full feature coverage remark').first()).toBeVisible();
    });

    test('v2: Calendar View Accessibility', async ({ page }) => {
        await page.goto('/calendar');
        await expect(page.getByRole('heading', { name: /Calendar/i })).toBeVisible();
        await expect(page.locator('.rbc-calendar')).toBeVisible();
    });

    test('v3-v8.1: OCR Review Flow (Mocked)', async ({ page }) => {
        const taskId = 'task-' + uniqueId();
        const attId = 'att-' + uniqueId();

        // Correct endpoints from app/lib/api/ocr.ts
        await page.route(`**/attachments/${attId}/ocr/results`, async route => {
            await route.fulfill({
                status: 200,
                contentType: 'application/json',
                body: JSON.stringify({
                    attachmentId: attId,
                    attachment: { id: attId, filename: 'test-invoice.pdf', mimeType: 'application/pdf', todoId: taskId },
                    rawOcr: { id: 'ocr-1', status: 'draft', extractedText: 'Total: 500.00', createdAt: new Date().toISOString() },
                    parsedFields: [
                        { id: 'f1', fieldName: 'Total', originalValue: '500.00', currentValue: '500.00', confidence: 0.95, isCorrected: false }
                    ],
                    utilizationType: null
                })
            });
        });

        await page.route(`**/attachments/${attId}/ocr/redo-eligibility*`, async route => {
            await route.fulfill({
                status: 200,
                contentType: 'application/json',
                body: JSON.stringify({ allowed: true, hasConfirmed: false })
            });
        });

        await page.goto(`/attachments/${attId}/review?taskId=${taskId}`);

        await expect(page.getByRole('heading', { name: /Extracted Data Review/i })).toBeVisible();
        await expect(page.getByText('draft', { exact: false }).first()).toBeVisible();
        await expect(page.getByText('Total').first()).toBeVisible();
        await expect(page.getByText('500.00').first()).toBeVisible();

        // Test Edit Modal
        await page.getByRole('button', { name: /edit/i }).first().click();
        await expect(page.getByText(/Reason for correction/i)).toBeVisible();

        const saveBtn = page.getByRole('button', { name: /Save Correction/i });
        await expect(saveBtn).toBeDisabled();

        await page.getByPlaceholder(/Why was this field corrected/i).fill('Testing correction');
        await expect(saveBtn).toBeEnabled();
    });

    test('v4: Parent/Child Linking', async ({ page }) => {
        const parentTitle = `Parent-${uniqueId()}`;
        const childTitle = `Child-${uniqueId()}`;

        await page.goto('/');

        // Create Parent
        await page.getByTestId('task-create-open').click();
        await page.getByTestId('task-title-input').fill(parentTitle);
        await page.getByTestId('task-save').click();
        await expect(page.getByText(parentTitle).first()).toBeVisible();

        // Create Child
        await page.getByTestId('task-create-open').click();
        await page.getByTestId('task-title-input').fill(childTitle);
        await page.getByTestId('task-save').click();
        await expect(page.getByText(childTitle).first()).toBeVisible();

        // Link them
        await page.getByText(childTitle).first().click();
        await expect(page.getByRole('heading', { name: childTitle }).first()).toBeVisible();

        await page.getByRole('button', { name: 'Set Parent' }).click();

        // Select in modal
        const modal = page.locator('div').filter({ has: page.getByRole('heading', { name: 'Set Parent Task' }) }).last();
        await modal.locator('select').selectOption({ label: parentTitle });
        await modal.getByPlaceholder(/Why is this task a child/i).fill('Linking for v4 coverage');
        await modal.getByRole('button', { name: 'Associate' }).click();

        await expect(page.getByText('Parent Task').first()).toBeVisible();
        await expect(page.getByText(parentTitle).first()).toBeVisible();
    });

    test('v5-v7: Workflow Menu Access', async ({ page }) => {
        await page.goto('/');

        const toggleBtn = page.getByTitle(/Expand sidebar|Collapse sidebar/i);
        // If it says "Expand", click it.
        const title = await toggleBtn.getAttribute('title');
        if (title && title.includes('Expand')) {
            await toggleBtn.click();
        }

        // Wait for link to be visible
        const workflowsLink = page.getByRole('link', { name: /Workflows/i }).first();
        await workflowsLink.waitFor({ state: 'visible', timeout: 5000 });
        await workflowsLink.click();

        await expect(page).toHaveURL(/.*workflows/);
    });
});
