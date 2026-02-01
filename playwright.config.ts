import { defineConfig } from '@playwright/test';

const baseURL = process.env.PLAYWRIGHT_BASE_URL ?? 'http://localhost:3000';

export default defineConfig({
  testDir: 'tests',
  use: {
    baseURL,
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
  },
  projects: [
    {
      name: 'standard',
      use: {
        storageState: '.auth/standard.json',
      },
    },
    {
      name: 'admin',
      use: {
        storageState: '.auth/admin.json',
      },
    },
  ],
});
