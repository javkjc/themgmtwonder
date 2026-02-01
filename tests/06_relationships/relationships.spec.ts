import { test, expect } from '@playwright/test';
import { uniqueTitle, createTaskViaModal, fetchTodoByTitle, waitForToast } from '../_fixtures/test-utils';

test.describe('Relationships management', () => {
  test('can associate and disassociate parent task with remarks', async ({ page, context }) => {
    await page.goto('/');
    const parentTitle = uniqueTitle('parent-task');
    const childTitle = uniqueTitle('child-task');
    await createTaskViaModal(page, parentTitle);
    await createTaskViaModal(page, childTitle);

    const child = await fetchTodoByTitle(context, childTitle);
    expect(child).toBeDefined();
    await page.getByTestId(`task-open-${child?.id}`).click();

    await page.getByRole('button', { name: 'Set Parent' }).click();

    const parentSelect = page.getByRole('combobox', { name: /Parent Task/i });
    await parentSelect.selectOption({ label: parentTitle });
    const remarkText = 'Parent association note';
    await page.getByLabel(/Remark/i).fill(remarkText);
    await page.getByRole('button', { name: 'Associate' }).click();
    await waitForToast(page, 'Task associated');

    await expect(page.getByText(parentTitle)).toBeVisible();

    await page.getByRole('button', { name: 'Remove Parent' }).click();
    const disconnectRemark = 'Detaching parent';
    await page.getByLabel(/Remark/i).fill(disconnectRemark);
    await page.getByRole('button', { name: 'Remove Parent' }).click();
    await waitForToast(page, 'Task disassociated');

    await page.reload();
    await expect(page.getByText('Parent Task')).toHaveCount(0);
  });
});
