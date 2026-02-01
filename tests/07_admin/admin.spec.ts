import { test, expect } from '@playwright/test';

const standardEmail = process.env.STANDARD_EMAIL ?? 'standard@example.com';

test.describe('Admin console', () => {
  test('can search for a user by email', async ({ page }) => {
    await page.goto('/admin');
    await expect(page.getByTestId('admin-search-input')).toBeVisible();
    await page.getByTestId('admin-search-input').fill(standardEmail);
    await page.getByTestId('admin-search-button').click();
    await expect(page.getByText(standardEmail)).toBeVisible();
  });

  test('reset password modal displays temporary password', async ({ page }) => {
    await page.route('**/admin/users/*/reset-password', (route) =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          tempPassword: 'TempPass123!',
          userId: 'mock-user',
          email: standardEmail,
        }),
      })
    );

    await page.goto('/admin');
    const userRow = page.locator('tr').filter({ hasText: standardEmail }).first();
    await expect(userRow).toBeVisible();
    await userRow.locator('[data-testid^="admin-reset-password-"]').first().click();

    await expect(page.getByText('Reset Password')).toBeVisible();
    await page.getByText('Temporary Password:').scrollIntoViewIfNeeded();
    await expect(page.getByText('TempPass123!')).toBeVisible();
    await page.getByRole('button', { name: 'Done' }).click();
  });
});
