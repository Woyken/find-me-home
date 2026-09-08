import { expect, test } from '@playwright/test'

test('loads the application shell', async ({ page }) => {
  await page.goto('/')

  await expect(page).toHaveTitle('Find Me Home')
  await expect
    .poll(() => page.evaluate(() => '__FMH_E2E__' in window))
    .toBe(true)
})
