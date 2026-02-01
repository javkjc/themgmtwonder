import { test, expect } from '@playwright/test';
import {
  uniqueTitle,
  createTaskViaModal,
  fetchTodoByTitle,
  waitForToast,
} from '../_fixtures/test-utils';

test.describe('Stage management', () => {
  test('stage updates persist after confirmation dialog', async ({ page, context }) => {
    await page.goto('/');
    const title = uniqueTitle('stage-task');
    await createTaskViaModal(page, title);

    const todo = await fetchTodoByTitle(context, title);
    expect(todo).toBeDefined();
    await page.getByTestId(`task-open-${todo?.id}`).click();

    await page.getByTestId('stage-selector').selectOption('in_progress');
    page.once('dialog', (dialog) => dialog.accept());
    await page.getByTestId('stage-confirm').click();
    await waitForToast(page, 'Stage updated');

    await page.reload();
    await expect(page.getByText(/In Progress/i)).toBeVisible();

    const updated = await fetchTodoByTitle(context, title);
    expect(updated?.stageKey).toBe('in_progress');
  });
});
