import { expect } from '@playwright/test'
import type { Page } from '@playwright/test'
import { appPath, appUrl } from './app-url.ts'

export const initializeE2ePage = async (page: Page, returnPath = appPath()) => {
  await page.goto(appUrl(`initialize-e2e-storage?return=${encodeURIComponent(returnPath)}`), {
    waitUntil: 'domcontentloaded',
  })
  await expect.poll(() => page.evaluate(() => Boolean(window.__FMH_E2E__))).toBe(true)
  await page.evaluate(async () => window.__FMH_E2E__?.ready())
}

export { test } from '@playwright/test'
