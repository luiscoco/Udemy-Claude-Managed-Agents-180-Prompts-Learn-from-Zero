import { defineConfig } from '@playwright/test';

const port = Number(process.env.PORT || 5430);
export default defineConfig({
  testDir: './tests', testMatch: 'browser.spec.ts', timeout: 120000,
  workers: 1, retries: 0,
  reporter: [['list'], ['json', { outputFile: 'artifacts/standalone-browser-results.json' }]],
  use: {
    baseURL: `http://127.0.0.1:${port}`,
    viewport: { width: 1920, height: 1080 },
    launchOptions: { executablePath: process.env.CHROME_PATH || undefined },
    screenshot: 'only-on-failure'
  },
  projects: [
    { name: 'verify', use: { video: 'off' } },
    { name: 'record', use: { video: { mode: 'on', size: { width: 1920, height: 1080 } } } }
  ],
  webServer: {
    command: 'npm run start:test', url: `http://127.0.0.1:${port}/api/catalog`,
    reuseExistingServer: false, timeout: 30000
  }
});
