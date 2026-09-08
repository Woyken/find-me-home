import { expect, test } from '@playwright/test'
import { appUrl } from './support/app-url.ts'

test('loads the application shell', async ({ page }) => {
  await page.goto(appUrl())

  await expect(page).toHaveTitle('Find Me Home')
  await expect.poll(() => page.evaluate(() => '__FMH_E2E__' in window)).toBe(true)
})
