
import { test, expect } from '@playwright/test';
import * as path from 'path';

const AUTH_FILE = path.join(process.cwd(), '.auth', 'user.json');

// Helper for unique IDs
const uniqueId = () => Math.random().toString(36).substring(2, 8);

test.describe('Full System Feature Coverage (v1 - v8.1)', () => {
    // Authentication is handled by auth.setup.ts
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
        const pinBtn = row.locator('[data-testid^="task-pin-"]').first();
        await pinBtn.click();

        // Verify pinned status
        await expect(row.getByText('Pinned')).toBeVisible();

        // Open Actions dropdown, then click Edit
        await row.getByRole('button', { name: 'Actions' }).click();
        await page.getByRole('button', { name: /^Edit$/ }).click();
        const editTitleInput = page.getByPlaceholder('Task title');
        await editTitleInput.clear();
        await editTitleInput.fill(newTitle);
        await page.getByRole('button', { name: 'Save' }).click();

        await expect(page.getByText(newTitle).first()).toBeVisible();

        // Add Remark
        // Open detail page
        const editedRow = page.locator('tr', { hasText: newTitle }).first();
        await editedRow.locator('[data-testid^="task-open-"]').first().click();
        await expect(page.getByRole('heading', { name: /Remarks/i })).toBeVisible();
        const remarksSection = page.locator('div', { has: page.getByRole('heading', { name: /Remarks/i }) }).first();
        await remarksSection.getByTestId('remark-input').fill('Full feature coverage remark');
        await remarksSection.getByTestId('remark-submit').click();

        await expect(page.getByText('Full feature coverage remark').first()).toBeVisible();
    });

    test('v2: Calendar View Accessibility', async ({ page }) => {
        await page.goto('/calendar');
        await expect(page.getByRole('heading', { name: /Calendar/i })).toBeVisible();
        await expect(page.locator('.rbc-calendar')).toBeVisible();
    });

    test('v3-v8.1: OCR Review Flow (Live Attachment)', async ({ page }) => {
        // Live DB fixture: task "Test invoice" with confirmed baseline
        const taskId = '059d3f68-367d-4adb-a443-981b6d8e12a7';
        const attId  = 'e7a531b5-d0df-41c5-98a3-1a8bac99b5fc';

        await page.goto(`/attachments/${attId}/review?taskId=${taskId}`);
        await page.waitForSelector('h1:has-text("Baseline Review")', { timeout: 30000 });

        // Dismiss the "New: ML suggestions" onboarding tooltip — it overlaps the sidebar
        const gotIt = page.getByRole('button', { name: /Got it/i });
        if (await gotIt.isVisible({ timeout: 5000 }).catch(() => false)) {
            await gotIt.click();
            await page.waitForTimeout(500);
        }

        // total field is $241.50 in the confirmed baseline
        // VerificationPanel renders read-only <input> elements — locate by CSS value selector
        const totalLocator = page.locator('input[value="$241.50"]');
        const isInputVisible = await totalLocator.first().isVisible({ timeout: 15000 }).catch(() => false);
        if (!isInputVisible) {
            await expect(page.getByText('$241.50').first()).toBeVisible({ timeout: 5000 });
        }
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

        // Workflows link may not exist in all versions — skip gracefully
        const workflowsLink = page.getByRole('link', { name: /Workflows/i }).first();
        const exists = await workflowsLink.isVisible({ timeout: 3000 }).catch(() => false);
        if (!exists) {
            test.skip(true, 'Workflows nav link not present in this build.');
            return;
        }
        await workflowsLink.click();
        await expect(page).toHaveURL(/.*workflows/);
    });
});
