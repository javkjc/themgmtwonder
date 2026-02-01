import { test, expect } from '@playwright/test';

const standardEmail = process.env.STANDARD_EMAIL ?? 'standard@example.com';

test.describe('Auth flows', () => {
  test('logout returns to login form', async ({ page }) => {
    await page.goto('/');
    await page.getByRole('button', { name: /Logout/i }).click();
    await expect(page.getByTestId('auth-email')).toBeVisible();
    await expect(page.getByTestId('auth-password')).toBeVisible();
  });

  test('change password surface shows error for wrong current password', async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== 'standard', 'Change password verified for standard persona');
    await page.goto('/profile');
    await page.getByLabel('Current Password').fill('incorrect-password');
    await page.getByLabel('New Password').fill('newpassword1');
    await page.getByLabel('Confirm New Password').fill('newpassword1');
    await page.getByTestId('change-password-submit').click();
    await expect(page.getByText(/Current password is incorrect/i)).toBeVisible();
  });

  test('force password change modal appears and submits', async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== 'standard', 'Force password change checked for standard persona');
    let callCount = 0;
    await page.route('**/auth/me', (route) => {
      callCount += 1;
      if (callCount === 1) {
        route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            email: standardEmail,
            userId: 'forced-user',
            role: 'user',
            isAdmin: false,
            mustChangePassword: true,
          }),
        });
        return;
      }
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          email: standardEmail,
          userId: 'forced-user',
          role: 'user',
          isAdmin: false,
          mustChangePassword: false,
        }),
      });
    });
    await page.route('**/auth/change-password', (route) =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ ok: true }),
      })
    );

    await page.goto('/');
    await expect(page.getByTestId('forcepw-current')).toBeVisible();
    await page.getByTestId('forcepw-current').fill('temp-pass');
    const newPassword = 'ForcePass1!';
    await page.getByTestId('forcepw-new').fill(newPassword);
    await page.getByPlaceholder('Re-enter new password').fill(newPassword);
    await page.getByTestId('forcepw-submit').click();
    await expect(page.getByText(/Password changed successfully/i)).toBeVisible();
    await page.waitForTimeout(1600);
    await expect(page.getByTestId('auth-email')).toBeVisible();
  });
});
