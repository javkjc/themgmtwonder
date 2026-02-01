import { test, expect } from '@playwright/test';
import {
  uniqueTitle,
  createTaskViaModal,
  getTaskRowByTitle,
  fetchTodoByTitle,
  waitForToast,
} from '../_fixtures/test-utils';

test.describe('Tasks interactions', () => {
  test('bulk mark done applies state to selected tasks', async ({ page, context }) => {
    await page.goto('/');
    const firstTitle = uniqueTitle('tasks-bulk-1');
    const secondTitle = uniqueTitle('tasks-bulk-2');
    await createTaskViaModal(page, firstTitle);
    await createTaskViaModal(page, secondTitle);

    const firstRow = getTaskRowByTitle(page, firstTitle);
    const secondRow = getTaskRowByTitle(page, secondTitle);
    await firstRow.locator('input[type="checkbox"]').check();
    await secondRow.locator('input[type="checkbox"]').check();

    await expect(page.getByRole('button', { name: 'Done' })).toBeVisible();
    await page.getByRole('button', { name: 'Done' }).click();
    await waitForToast(page, 'Tasks completed');

    await page.reload();
    await expect(getTaskRowByTitle(page, firstTitle).getByText('Done')).toBeVisible();
    await expect(getTaskRowByTitle(page, secondTitle).getByText('Done')).toBeVisible();

    const first = await fetchTodoByTitle(context, firstTitle);
    const second = await fetchTodoByTitle(context, secondTitle);
    expect(first?.done).toBe(true);
    expect(second?.done).toBe(true);
  });

  test('task toggle updates done flag and persists', async ({ page, context }) => {
    await page.goto('/');
    const title = uniqueTitle('tasks-toggle');
    await createTaskViaModal(page, title);

    const todo = await fetchTodoByTitle(context, title);
    expect(todo).toBeDefined();
    await page.getByTestId(`task-toggle-${todo?.id}`).check();
    await waitForToast(page, 'Task marked as done');

    await page.reload();
    const updated = await fetchTodoByTitle(context, title);
    expect(updated?.done).toBe(true);
  });
});
