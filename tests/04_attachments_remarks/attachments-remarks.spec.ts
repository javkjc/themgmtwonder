import { test, expect } from '@playwright/test';
import {
  uniqueTitle,
  createTaskViaModal,
  fetchTodoByTitle,
  waitForToast,
} from '../_fixtures/test-utils';

test.describe('Attachments & Remarks', () => {
  test('attachment upload stays listed and download opens popup', async ({ page, context }) => {
    await page.goto('/');
    const title = uniqueTitle('attachments-task');
    await createTaskViaModal(page, title);
    const todo = await fetchTodoByTitle(context, title);
    expect(todo).toBeDefined();
    await page.getByTestId(`task-open-${todo?.id}`).click();

    await page.setInputFiles('input[type="file"]', 'tests/_fixtures/assets/sample.txt');
    await page.getByTestId('attachment-upload').click();
    await waitForToast(page, 'File uploaded');

    const row = page.locator('[data-testid^="attachment-row-"]').filter({ hasText: 'sample.txt' });
    await expect(row).toBeVisible();

    const [popup] = await Promise.all([
      page.waitForEvent('popup'),
      row.getByRole('button', { name: 'Download' }).click(),
    ]);
    await expect(popup.url()).toContain('/attachments/');
    await popup.close();

    await page.reload();
    await expect(page.locator('[data-testid^="attachment-row-"]').filter({ hasText: 'sample.txt' })).toBeVisible();
  });

  test('remarks can be added and removed', async ({ page, context }) => {
    await page.goto('/');
    const title = uniqueTitle('remarks-task');
    await createTaskViaModal(page, title);

    const row = await fetchTodoByTitle(context, title);
    expect(row).toBeDefined();
    await page.getByTestId(`task-open-${row?.id}`).click();

    const remarkText = `Remark-${Date.now()}`;
    await page.getByTestId('remark-input').fill(remarkText);
    await page.getByTestId('remark-submit').click();
    await waitForToast(page, 'Remark added');

    const remarkCard = page.locator('div').filter({ hasText: remarkText }).first();
    await expect(remarkCard).toBeVisible();
    await remarkCard.getByRole('button', { name: 'Delete' }).click();
    await waitForToast(page, 'Remark deleted');
    await page.reload();
    await expect(page.getByText(remarkText)).toHaveCount(0);
  });
});
