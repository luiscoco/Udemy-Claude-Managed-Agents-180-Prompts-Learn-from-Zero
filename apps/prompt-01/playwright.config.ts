import { defineConfig } from '@playwright/test';
import { existsSync } from 'node:fs';

// Use an installed browser on Windows. Else use Playwright's Chromium.
const chrome = process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE ||
  (process.platform === 'win32' && existsSync('C:/Program Files/Google/Chrome/Application/chrome.exe')
    ? 'C:/Program Files/Google/Chrome/Application/chrome.exe' : undefined);
export default defineConfig({
  testDir: './tests',
  testMatch: '**/*.spec.ts',
  timeout: 45000,
  fullyParallel: false,
  workers: 1,
  reporter: 'list',
  use: {
    baseURL: 'http://127.0.0.1:4010',
    viewport: { width: 1600, height: 1000 },
    launchOptions: { executablePath: chrome },
    screenshot: 'only-on-failure',
    trace: 'retain-on-failure',
  },
  webServer: {
    command: 'npm start',
    url: 'http://127.0.0.1:4010/api/config',
    reuseExistingServer: !process.env.CI,
    timeout: 30000,
    env: { PORT: '4010' },
  },
  projects: [
    { name: 'chromium', testIgnore: /lesson\.spec\.ts/ },
    { name: 'lesson', testMatch: /lesson\.spec\.ts/, use: {
      viewport: { width: 1920, height: 1080 },
      video: { mode: 'on', size: { width: 1920, height: 1080 } },
    } },
  ],
});
