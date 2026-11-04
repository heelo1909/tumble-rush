import { defineConfig } from '@playwright/test';

const live = !!process.env.BASE_URL;
const baseURL = process.env.BASE_URL || 'http://localhost:4173/tumble-rush/';

export default defineConfig({
  testDir: 'tests/e2e',
  outputDir: '.smoke/e2e-results',
  retries: live ? 1 : 0,
  workers: 1,
  reporter: [['list'], ['json', { outputFile: '.smoke/e2e-report.json' }]],
  use: { baseURL },
  projects: [
    { name: 'chromium', use: { browserName: 'chromium' } },
    { name: 'webkit', use: { browserName: 'webkit' } },
  ],
  webServer: live ? undefined : {
    command: 'npm run build && npm run preview',
    url: 'http://localhost:4173/tumble-rush/',
    reuseExistingServer: false,
    timeout: 120000,
  },
});
