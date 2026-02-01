import { test, expect } from '@playwright/test';
import {
  uniqueTitle,
  createTaskViaModal,
  waitForToast,
  tryWaitForToast,
  getTaskRowByTitle,
  fetchTodoByTitle,
  buildFutureDateTime,
} from '../_fixtures/test-utils';

test.describe('Smoke suite', () => {
  test('standard user can open the dashboard', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByRole('heading', { name: /My Tasks/i })).toBeVisible();
  });

  test('standard user can create a task and persist it after reload', async ({ page, context }, testInfo) => {
    test.skip(testInfo.project.name !== 'standard', 'Smoke creation only runs for standard user');
    await page.goto('/');
    const title = uniqueTitle('smoke-create');
    await createTaskViaModal(page, title);
    await expect(getTaskRowByTitle(page, title)).toBeVisible();
    await page.reload();
    await expect(page.getByText(title)).toBeVisible();
    const persisted = await fetchTodoByTitle(context, title);
    expect(persisted).toBeDefined();
  });

  test('standard user can edit a task and keep changes after reload', async ({ page, context }, testInfo) => {
    test.skip(testInfo.project.name !== 'standard', 'Editing is covered for standard users');
    await page.goto('/');
    const title = uniqueTitle('smoke-edit');
    await createTaskViaModal(page, title);
    const original = await fetchTodoByTitle(context, title);
    expect(original).toBeDefined();
    const view = page.getByTestId(`task-open-${original?.id}`);
    await view.click();
    await page.waitForURL(/\/task\/.+/);
    await page.getByTestId('task-edit-open').click();
    const newTitle = `${title}-updated`;
    await page.getByTestId('task-title-input').fill(newTitle);
    await page.getByTestId('task-save').click();
    await waitForToast(page, 'Task saved');
    await page.reload();
    await expect(page.getByText(newTitle)).toBeVisible();
    const updated = await fetchTodoByTitle(context, newTitle);
    expect(updated).toBeDefined();
    expect(updated?.title).toBe(newTitle);
  });

  test('standard user can add a remark with persistence', async ({ page, context }, testInfo) => {
    test.skip(testInfo.project.name !== 'standard', 'Remarks belong to standard persona');
    await page.goto('/');
    const title = uniqueTitle('smoke-remark');
    await createTaskViaModal(page, title);
    const todo = await fetchTodoByTitle(context, title);
    expect(todo).toBeDefined();
    await page.getByTestId(`task-open-${todo?.id}`).click();
    const remark = 'Smoke remark ' + Date.now();
    await page.getByTestId('remark-input').fill(remark);
    await page.getByTestId('remark-submit').click();
    await waitForToast(page, 'Remark added');
    await page.reload();
    await expect(page.getByText(remark)).toBeVisible();
  });

  test('standard user can upload an attachment and see it after reload', async ({ page, context }, testInfo) => {
    test.skip(testInfo.project.name !== 'standard', 'Attachments run under standard user');
    await page.goto('/');
    const title = uniqueTitle('smoke-attachment');
    await createTaskViaModal(page, title);
    const todo = await fetchTodoByTitle(page.context(), title);
    expect(todo).toBeDefined();
    await page.getByTestId(`task-open-${todo?.id}`).click();
    await page.setInputFiles('input[type="file"]', 'tests/_fixtures/assets/sample.txt');
    await page.getByTestId('attachment-upload').click();
    await waitForToast(page, 'File uploaded');
    await page.reload();
    await expect(page.getByText('sample.txt')).toBeVisible();
  });

  test('standard user can schedule a task via ScheduleModal and persist after reload', async ({ page, context }, testInfo) => {
    test.skip(testInfo.project.name !== 'standard', 'Scheduling only in standard persona');
    await page.goto('/');
    const title = uniqueTitle('smoke-schedule');
    await createTaskViaModal(page, title);
    const todo = await fetchTodoByTitle(context, title);
    expect(todo).toBeDefined();
    const startAt = buildFutureDateTime(120);
    await page.getByTestId(`task-schedule-${todo?.id}`).click();
    await page.getByTestId('schedule-startAt').fill(startAt);
    await page.getByTestId('schedule-duration').fill('45');
    await page.getByTestId('schedule-confirm').click();

    // Toast message is UI text and may vary; verify persisted state instead
    await tryWaitForToast(page, 'Task scheduled');

    // Verify scheduled state persisted via API
    const scheduled = await fetchTodoByTitle(context, title);
    expect(scheduled?.startAt).not.toBeNull();
    expect(scheduled?.durationMin).toBe(45);

    // Verify scheduled state persists after reload
    await page.reload();
    await expect(page.getByTestId(`task-unschedule-${todo?.id}`)).toBeVisible();

    // Re-fetch to confirm persistence
    const reloadedScheduled = await fetchTodoByTitle(context, title);
    expect(reloadedScheduled?.startAt).not.toBeNull();
    expect(reloadedScheduled?.durationMin).toBe(45);
  });

  test('standard user can unschedule a task and keep it unscheduled after refresh', async ({ page, context }, testInfo) => {
    test.skip(testInfo.project.name !== 'standard', 'Unscheduling only covers standard flows');
    await page.goto('/');
    const title = uniqueTitle('smoke-unschedule');
    await createTaskViaModal(page, title);
    const todo = await fetchTodoByTitle(context, title);
    expect(todo).toBeDefined();
    const startAt = buildFutureDateTime(90);
    await page.getByTestId(`task-schedule-${todo?.id}`).click();
    await page.getByTestId('schedule-startAt').fill(startAt);
    await page.getByTestId('schedule-duration').fill('30');
    await page.getByTestId('schedule-confirm').click();

    // Toast is optional; verify scheduled state via API
    await tryWaitForToast(page, 'Task scheduled');
    const scheduled = await fetchTodoByTitle(context, title);
    expect(scheduled?.startAt).not.toBeNull();
    expect(scheduled?.durationMin).toBe(30);

    // Unschedule the task
    const row = getTaskRowByTitle(page, title);
    await row.getByRole('button', { name: 'Unschedule' }).click();
    await page.getByTestId('confirm-yes').click();

    // Toast message may vary; verify persisted unscheduled state instead
    await tryWaitForToast(page, 'Task unscheduled');

    // Verify unscheduled state persisted via API
    const unscheduled = await fetchTodoByTitle(context, title);
    expect(unscheduled?.startAt).toBeNull();
    expect(unscheduled?.durationMin).toBe(30); // Duration preserved

    // Verify unscheduled state persists after reload
    await page.reload();
    await expect(page.getByTestId(`task-schedule-${todo?.id}`)).toBeVisible();

    // Re-fetch to confirm persistence
    const reloadedUnscheduled = await fetchTodoByTitle(context, title);
    expect(reloadedUnscheduled?.startAt).toBeNull();
  });

  test('standard user cannot reach admin page', async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== 'standard', 'Permission guard only relevant for standard persona');
    await page.goto('/admin');
    await page.waitForURL('**/');
    await expect(page.getByRole('heading', { name: /My Tasks/i })).toBeVisible();
  });

  test('admin user can open the admin dashboard', async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== 'admin', 'Admin navigation only runs on admin project');
    await page.goto('/admin');
    await expect(page.getByTestId('admin-nav')).toBeVisible();
    await expect(page.getByRole('heading', { name: /User Management/i })).toBeVisible();
  });
});
