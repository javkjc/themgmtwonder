import { test, expect } from '@playwright/test';
import {
  uniqueTitle,
  createTaskViaModal,
  fetchTodoByTitle,
  waitForToast,
} from '../_fixtures/test-utils';

const workerUrl = process.env.OCR_WORKER_BASE_URL;

test.describe('OCR regression', () => {
  test('can request OCR and apply output to remark and description', async ({ page, context }) => {
    test.skip(!workerUrl, 'OCR worker base URL is not configured');
    await page.route('**/attachments/*/ocr', (route, request) => {
      if (request.method() === 'POST') {
        route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({}),
        });
        return;
      }
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify([
          {
            id: 'ocr-output-1',
            extractedText: 'OCR sample text',
            status: 'complete',
            createdAt: new Date().toISOString(),
          },
        ]),
      });
    });

    await page.route('**/attachments/*/ocr/apply', (route) =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ type: 'remark' }),
      })
    );

    await page.goto('/');
    const title = uniqueTitle('ocr-task');
    await createTaskViaModal(page, title);
    const todo = await fetchTodoByTitle(context, title);
    expect(todo).toBeDefined();
    await page.getByTestId(`task-open-${todo?.id}`).click();

    await page.setInputFiles('input[type="file"]', 'tests/_fixtures/assets/sample.png');
    await page.getByTestId('attachment-upload').click();
    await waitForToast(page, 'File uploaded');

    const row = page.locator('[data-testid^="attachment-row-"]').filter({ hasText: 'sample.png' });
    await row.getByRole('button', { name: 'Retrieve OCR text' }).click();
    await waitForToast(page, 'OCR requested');
    await row.getByRole('button', { name: /Show OCR text/i }).click();

    page.once('dialog', (dialog) => dialog.accept());
    await row.getByRole('button', { name: /Add as remark/i }).click();
    await waitForToast(page, 'OCR remark added');

    page.once('dialog', (dialog) => dialog.accept());
    await row.getByRole('button', { name: /Append to description/i }).click();
    await waitForToast(page, 'Task saved');

    await page.reload();
    await expect(page.getByText('OCR sample text')).toBeVisible();
  });
});
