
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

    test('v3-v8.1: OCR Review Flow (Live Attachment)', async ({ page }) => {
        const taskId = '5922795d-dafc-4e1f-9d6f-69b8e5fbe900';
        const attId = '2d763b3a-8432-46b3-8974-880ed749bf33';

        await page.goto(`/attachments/${attId}/review?taskId=${taskId}`);
        const totalAmountInput = page.locator('#field-total_amount');
        await totalAmountInput.waitFor({ state: 'visible', timeout: 30000 });
        await expect(totalAmountInput).toHaveValue('$27.54 (1 item)');
        await expect(totalAmountInput).not.toHaveValue('Jul 28, 2023');
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
