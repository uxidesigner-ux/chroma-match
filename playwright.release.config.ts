import { defineConfig } from '@playwright/test'

// The same read-only/guest smoke checks can target the real deployed site.
const deployed = process.env.STUDIO_BASE_URL
export default defineConfig({
  testDir: './tests/release',
  workers: 1,
  timeout: 120000,
  expect: { timeout: 30000 },
  use: {
    baseURL: deployed ?? 'http://127.0.0.1:5180/chroma-match/',
    viewport: { width: 1280, height: 800 },
    locale: 'en-US',
    reducedMotion: 'reduce',
    trace: 'retain-on-failure',
    launchOptions: { args: ['--enable-unsafe-swiftshader'] },
  },
  webServer: deployed
    ? undefined
    : {
        command:
          'BASE_PATH=/chroma-match/ npm run preview -- --host 127.0.0.1 --port 5180 --strictPort',
        url: 'http://127.0.0.1:5180/chroma-match/',
        reuseExistingServer: false,
      },
})
