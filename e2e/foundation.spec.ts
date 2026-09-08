import { expect, test } from '@playwright/test'
import { appPath, appUrl } from './support/app-url.ts'
import { initializeE2ePage } from './support/test.ts'

test('loads the application shell', async ({ page }) => {
  await initializeE2ePage(page)

  await expect(page).toHaveTitle('Find Me Home')
  await expect.poll(() => page.evaluate(() => '__FMH_E2E__' in window)).toBe(true)
})

test('keeps normal routes outside E2E until the initializer runs', async ({ page }) => {
  const productionArtifact = Boolean(process.env.PLAYWRIGHT_BASE_URL)
  await page.goto(appUrl())
  await expect(page).toHaveTitle('Find Me Home')
  await expect.poll(() => page.evaluate(() => '__FMH_E2E__' in window)).toBe(!productionArtifact)

  await page.goto(appUrl('?e2e=ignored'))
  await expect(page).toHaveTitle('Find Me Home')
  await expect.poll(() => page.evaluate(() => '__FMH_E2E__' in window)).toBe(!productionArtifact)
})

test('initializes one tab, persists through reload, and rejects unsafe returns', async ({
  page,
  browser,
}) => {
  const productionArtifact = Boolean(process.env.PLAYWRIGHT_BASE_URL)
  await page.goto(
    appUrl(`initialize-e2e-storage?return=${encodeURIComponent(appPath('visit-plan'))}`),
  )
  await expect(page).toHaveURL(appUrl('visit-plan'))
  await expect.poll(() => page.evaluate(() => '__FMH_E2E__' in window)).toBe(true)
  await page.reload()
  await expect.poll(() => page.evaluate(() => '__FMH_E2E__' in window)).toBe(true)

  const fresh = await browser.newContext()
  try {
    const freshPage = await fresh.newPage()
    await freshPage.goto(appUrl())
    await expect
      .poll(() => freshPage.evaluate(() => '__FMH_E2E__' in window))
      .toBe(!productionArtifact)
  } finally {
    await fresh.close()
  }

  const unsafe = await browser.newContext()
  try {
    const unsafePage = await unsafe.newPage()
    await unsafePage.goto(appUrl('initialize-e2e-storage?return=https://example.com'))
    await expect(unsafePage).toHaveURL(appUrl())
  } finally {
    await unsafe.close()
  }
})
