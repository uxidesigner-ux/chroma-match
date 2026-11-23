import { defineConfig, devices } from '@playwright/test'

const deployed = process.env.ROYAL_RELEASE_URL
export default defineConfig({
  testDir: './tests/royal-release',
  outputDir: './test-results/royal-release',
  workers: 1,
  timeout: 45_000,
  expect: { timeout: 15_000 },
  use: {
    baseURL: deployed ?? 'http://127.0.0.1:5190/chroma-match/',
    locale: 'ko-KR',
    reducedMotion: 'reduce',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    serviceWorkers: 'allow',
  },
  projects: [
    { name: 'chrome-mobile', use: { ...devices['iPhone 13'], defaultBrowserType: 'chromium', ...(process.env.CI ? {} : { channel: 'chrome' }), } },
    { name: 'webkit-iphone', use: { ...devices['iPhone 13'], defaultBrowserType: 'webkit' } },
  ],
  webServer: deployed ? undefined : {
    command: 'BASE_PATH=/chroma-match/ npm run preview -- --host 127.0.0.1 --port 5190 --strictPort',
    url: 'http://127.0.0.1:5190/chroma-match/',
    reuseExistingServer: false,
  },
})
