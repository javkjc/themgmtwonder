
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
