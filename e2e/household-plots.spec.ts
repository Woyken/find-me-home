import { expect, test } from '@playwright/test'
import type { Page } from '@playwright/test'
import type { E2eApi, E2eListingSeed, E2eSeed } from '../src/e2e/support'
import { PlotsPage } from './pages/plots.page'
import { appOrigin, appUrl } from './support/app-url.ts'

declare global {
  interface Window {
    __FMH_E2E__?: E2eApi
  }
}

const namespace = (prefix: string) =>
  `${prefix}-${test.info().project.name.replace(/[^a-z0-9]/gi, '')}-${test.info().testId.replace(/[^a-z0-9]/gi, '')}`.slice(
    0,
    80,
  )

const open = async (page: Page, value: string) => {
  await page.goto(appUrl(`?e2e=${value}`))
  await expect.poll(() => page.evaluate(() => Boolean(window.__FMH_E2E__))).toBe(true)
  await page.evaluate(async () => window.__FMH_E2E__?.ready())
}

const seed = async (page: Page, input: E2eSeed) =>
  page.evaluate((value) => {
    if (!window.__FMH_E2E__) throw new Error('E2E API is unavailable')
    return window.__FMH_E2E__.seed(value)
  }, input)

test('creates a search, persists it, and handles invalid and hash invitations', async ({
  page,
  browser,
  context,
}) => {
  const value = namespace('household-start')
  await context.grantPermissions(['clipboard-read', 'clipboard-write'], {
    origin: appOrigin,
  })
  await open(page, value)
  await page.getByRole('button', { name: 'Start a search' }).click()
  await expect(page.getByRole('heading', { name: 'Our home search' })).toBeVisible()
  await page.reload()
  await expect(page.getByRole('heading', { name: 'Our home search' })).toBeVisible()

  await page.getByRole('button', { name: 'Our search settings' }).click()
  const dialog = page.getByRole('dialog', { name: 'Our search' })
  await dialog.getByRole('button', { name: 'Copy' }).click()
  await expect(page.getByText('Link copied')).toBeVisible()
  await expect(dialog.getByRole('img', { name: 'Invitation QR code' })).toBeVisible()
  await dialog.getByLabel('Search name').fill('Willow search')
  await dialog.getByRole('button', { name: 'Save' }).click()
  await expect(page.getByRole('heading', { name: 'Willow search' })).toBeVisible()

  const invalid = await browser.newContext()
  try {
    const invalidPage = await invalid.newPage()
    await invalidPage.goto(appUrl(`?e2e=${value}#household=%`))
    await expect(invalidPage.getByRole('heading', { name: 'Find land together.' })).toBeVisible()
    await invalidPage.getByLabel('Invitation link').fill('not an invitation')
    await invalidPage.getByRole('button', { name: 'Join' }).click()
    await expect(invalidPage.getByRole('alert')).toContainText("doesn't look like")

    const waitingPage = await invalid.newPage()
    await waitingPage.goto(
      appUrl(`?e2e=${namespace('waiting')}#household=AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA`),
    )
    await expect(waitingPage.getByRole('heading', { name: 'Joining the search…' })).toBeVisible()
    await expect(waitingPage.getByRole('status')).toContainText('Waiting for another device')
  } finally {
    await invalid.close()
  }
})

test('manages settings and navigates empty plots and not-found pages', async ({ page }) => {
  const value = namespace('settings-empty')
  await open(page, value)
  await page.getByRole('button', { name: 'Start a search' }).click()
  const plots = new PlotsPage(page)
  await plots.expectEmpty()
  await page.evaluate(() => window.__FMH_E2E__?.createHousehold('Second search'))
  await expect(page.getByRole('heading', { name: 'Second search' })).toBeVisible()
  await page.getByRole('button', { name: 'Our search settings' }).click()
  const dialog = page.getByRole('dialog', { name: 'Our search' })
  await dialog.getByRole('button', { name: 'Switch' }).click()
  await expect(page.getByRole('heading', { name: 'Our home search' })).toBeVisible()
  await page.getByRole('button', { name: 'Our search settings' }).click()
  page.once('dialog', (confirmation) => confirmation.accept())
  await page.getByRole('button', { name: 'Remove this search from this device' }).click()
  await expect(page.getByRole('heading', { name: 'Second search' })).toBeVisible()

  await page.goto(appUrl(`missing?e2e=${value}`))
  await expect(page.getByRole('heading', { name: "There's nothing at this address" })).toBeVisible()
  await page.getByRole('link', { name: 'Back to plots' }).click()
  await expect(page).toHaveURL(appUrl(`?e2e=${value}`))
})

test('sorts, filters, maps, and plans populated located and unlocated plots', async ({ page }) => {
  const value = namespace('plots-list')
  await open(page, value)
  const listings: E2eListingSeed[] = [
    { id: '101', title: 'Expensive located', priceEur: 90_000, areaAres: 8 },
    {
      id: '102',
      title: 'Cheap unlocated',
      priceEur: 20_000,
      areaAres: 20,
      latitude: null,
      longitude: null,
    },
    { id: '103', title: 'Middle located', priceEur: 50_000, areaAres: 12 },
  ]
  await seed(page, { listings })
  const plots = new PlotsPage(page)
  await expect(plots.savedPlots.getByRole('article')).toHaveCount(3)
  await page.getByRole('button', { name: 'Cheapest' }).click()
  await expect(plots.savedPlots.getByRole('article').first()).toContainText('Cheap unlocated')
  await page.getByRole('button', { name: 'Biggest' }).click()
  await expect(plots.savedPlots.getByRole('article').first()).toContainText('Cheap unlocated')
  await plots.row('Middle located').toggleGoSee()
  await expect(plots.row('Middle located').row.getByRole('button')).toContainText('Going to see')
  await plots
    .row('Middle located')
    .row.getByRole('link', { name: 'Middle located', exact: true })
    .click()
  await page.getByRole('button', { name: 'Mark as visited' }).click()
  await expect(page).toHaveURL(/visit-plan/)
  await page.getByRole('navigation', { name: 'Main' }).getByText('Plots').click()
  await page.getByRole('button', { name: 'Not visited' }).click()
  await expect(plots.savedPlots.getByRole('article')).toHaveCount(2)
  await expect(plots.row('Middle located').row).toHaveCount(0)
  await plots.showMap()
  await expect(page.getByLabel('Map of the plots')).toBeVisible()
  await page.getByRole('button', { name: 'List' }).click()
  await expect(plots.row('Cheap unlocated').row).toContainText('no location yet')
  await page.getByRole('link', { name: /Going to see/ }).click()
  await expect(page).toHaveURL(/visit-plan/)
  await expect(page.getByRole('heading', { name: 'No visits planned yet' })).toBeVisible()
})
