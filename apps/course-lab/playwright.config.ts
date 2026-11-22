import { defineConfig } from '@playwright/test';
export default defineConfig({
  testDir: './tests', testMatch: 'browser.spec.ts', timeout: 120000,
  fullyParallel: true, workers: 3, retries: 0,
  reporter: [['list'], ['json', { outputFile: 'artifacts/browser-results.json' }]],
  use: { baseURL: 'http://127.0.0.1:4090', viewport: { width: 1920, height: 1080 }, launchOptions: { executablePath: process.env.CHROME_PATH || undefined }, screenshot: 'only-on-failure' },
  projects: [{ name: 'verify', use: { video: 'off' } }, { name: 'record', use: { video: { mode: 'on', size: { width: 1920, height: 1080 } } } }],
  webServer: { command: 'npm run start:test', url: 'http://127.0.0.1:4090/api/catalog', reuseExistingServer: !process.env.CI, timeout: 30000 }
});
