import { test, expect } from '@playwright/test';
import { uniqueTitle, createTaskViaModal, fetchTodoByTitle } from '../_fixtures/test-utils';

test.describe('Audit log coverage', () => {
  test('task creations are logged and visible to task owner', async ({ page, context }) => {
    await page.goto('/');
    const title = uniqueTitle('audit-task');
    await createTaskViaModal(page, title);
    const task = await fetchTodoByTitle(context, title);
    expect(task).toBeDefined();

    await page.goto('/activity');
    await expect(page.getByText('Created task')).toBeVisible();
    await expect(page.getByText(title)).toBeVisible();

    const response = await context.request.get(`/audit/resource/${task?.id}`);
    expect(response.ok()).toBe(true);
    const body = await response.json();
    expect(Array.isArray(body)).toBe(true);
    const hasCreate = (body as Array<any>).some((entry) => entry.action === 'todo.create');
    expect(hasCreate).toBe(true);
  });

  test('admin can retrieve global audit list', async ({ context, testInfo }) => {
    test.skip(testInfo.project.name !== 'admin', 'Global audit list requires admin project');
    const response = await context.request.get('/audit/all?limit=5');
    expect(response.ok()).toBe(true);
    const entries = await response.json();
    expect(Array.isArray(entries)).toBe(true);
  });
});
