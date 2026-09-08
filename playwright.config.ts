import { defineConfig, devices } from '@playwright/test'

const executablePath = process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH
const isTermux = process.env.FMH_TERMUX === '1'
const port = Number(process.env.PLAYWRIGHT_WEB_SERVER_PORT ?? 3000)
const localBasePath = process.env.E2E_BASE_PATH ?? '/'
const localBaseURL = new URL(localBasePath, `http://127.0.0.1:${port}`).href
const baseURL = process.env.PLAYWRIGHT_BASE_URL ?? localBaseURL
const mobileDevice = devices['iPhone 13']
const desktopDevice = devices['Desktop Chrome']

// Termux Chromium exits while Playwright enables Chrome's mobile-emulation
// process mode. Keep the iPhone viewport, touch, and user agent there while
// using its stable desktop process mode.
const termuxSafeMobileDevice = isTermux
  ? {
      ...desktopDevice,
      viewport: mobileDevice.viewport,
      userAgent: mobileDevice.userAgent,
      hasTouch: true,
    }
  : mobileDevice

export default defineConfig({
  testDir: './e2e',
  timeout: 30_000,
  expect: { timeout: 10_000 },
  fullyParallel: false,
  forbidOnly: Boolean(process.env.CI),
  retries: Number(process.env.PLAYWRIGHT_RETRIES ?? (process.env.CI ? 2 : 0)),
  workers: process.env.CI ? 2 : undefined,
  reporter: process.env.CI ? 'github' : 'list',
  use: {
    baseURL,
    ignoreHTTPSErrors: true,
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    ...(executablePath ? { launchOptions: { executablePath } } : {}),
  },
  projects: [
    {
      name: 'chromium-desktop',
      use: { ...devices['Desktop Chrome'], browserName: 'chromium' },
    },
    {
      name: 'chromium-mobile',
      use: { ...termuxSafeMobileDevice, browserName: 'chromium' },
    },
  ],
  ...(process.env.PLAYWRIGHT_BASE_URL
    ? {}
    : {
        webServer: {
          command: `pnpm dev --mode e2e --host 127.0.0.1 --port ${port}`,
          url: localBaseURL,
          reuseExistingServer: false,
          timeout: 30_000,
          // The runner's Termux preload must not affect Vite or app dependencies.
          env: {
            NODE_OPTIONS: '',
            VITE_E2E_BASE_PATH: localBasePath,
          },
        },
      }),
})
