import { expect, test } from '@playwright/test'
import { appUrl } from './support/app-url.ts'

test('loads the application shell', async ({ page }) => {
  await page.goto(appUrl('?e2e=foundation'))

  await expect(page).toHaveTitle('Find Me Home')
  await expect.poll(() => page.evaluate(() => '__FMH_E2E__' in window)).toBe(true)
})

test('keeps normal and malformed production starts outside the E2E runtime', async ({ page }) => {
  const productionArtifact = Boolean(process.env.PLAYWRIGHT_BASE_URL)
  await page.goto(appUrl())
  await expect(page).toHaveTitle('Find Me Home')
  await expect.poll(() => page.evaluate(() => '__FMH_E2E__' in window)).toBe(!productionArtifact)

  await page.goto(appUrl('?e2e=not%20safe'))
  await expect(page).toHaveTitle('Find Me Home')
  await expect.poll(() => page.evaluate(() => '__FMH_E2E__' in window)).toBe(!productionArtifact)
})
