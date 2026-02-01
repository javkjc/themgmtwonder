import { test, expect, type BrowserContext, type Page } from '@playwright/test';
import {
  uniqueTitle,
  createTaskViaModal,
  buildFutureDateTime,
  fetchTodoByTitle,
  waitForToast,
} from '../_fixtures/test-utils';

async function scheduleTask(page: Page, context: BrowserContext, title: string, minutesAhead = 120) {
  const todo = await fetchTodoByTitle(context, title);
  if (!todo) {
    throw new Error('Scheduled task not found after creation');
  }
  await page.getByTestId(`task-schedule-${todo.id}`).click();
  await page.getByTestId('schedule-startAt').fill(buildFutureDateTime(minutesAhead));
  await page.getByTestId('schedule-duration').fill('40');
  await page.getByTestId('schedule-confirm').click();
  await waitForToast(page, 'Task scheduled');
  return todo.id;
}

test.describe('Calendar regression', () => {
  test('scheduled tasks appear on calendar grid', async ({ page, context }) => {
    await page.goto('/');
    const title = uniqueTitle('calendar-event');
    await createTaskViaModal(page, title);
    await scheduleTask(page, context, title, 180);
    await page.goto('/calendar');
    await expect(page.getByText(title)).toBeVisible();
  });

  test('rescheduling via modal keeps event visible on calendar', async ({ page, context }) => {
    await page.goto('/');
    const title = uniqueTitle('calendar-reschedule');
    await createTaskViaModal(page, title);
    const id = await scheduleTask(page, context, title, 200);
    await page.goto('/');
    await page.getByTestId(`task-schedule-${id}`).click();
    await page.getByTestId('schedule-startAt').fill(buildFutureDateTime(300));
    await page.getByTestId('schedule-duration').fill('50');
    await page.getByTestId('schedule-confirm').click();
    await waitForToast(page, 'Task scheduled');
    await page.goto('/calendar');
    await expect(page.getByText(title)).toBeVisible();
  });
});
