import { expect } from '@playwright/test'
import { initializeE2ePage, test } from '../support/test.ts'
import { AddPlotDialog } from '../components/add-plot-dialog.ts'
import { aruodasScenarios } from '../data/aruodas/scenarios.ts'
import type { AdvertScenario } from '../data/aruodas/scenarios.ts'
import { createAruodasSourcePage } from '../fixtures/aruodas/source-page.ts'
import { ImportReviewPage } from '../pages/import-review.page.ts'
import {
  decodeBookmarkletPayload,
  addPlotDialogBookmarkletHref,
  actualBookmarkletSource,
  openSourcePage,
  runAddPlotDialogBookmarklet,
} from '../support/bookmarklet-source.ts'
import type { PlaywrightPage } from '../support/bookmarklet-source.ts'

const app = async (page: PlaywrightPage) => {
  await initializeE2ePage(page)
  await page.evaluate(async () => {
    const api = window.__FMH_E2E__
    if (!api) throw new Error('E2E runtime is unavailable')
    await api.ready()
    await api.reset()
    await api.seed({ listings: [] })
  }, undefined)
}

test('uses the Add a plot dialog loader and requests the cache-busted scraper', async ({
  page,
}) => {
  await app(page)
  const href = await new AddPlotDialog(page).bookmarkletHref()
  expect(href).toMatch(/^javascript:/)
  expect(href).toContain('aruodas-bookmarklet.js?t=')
})

const importableAdverts: ReadonlyArray<AdvertScenario> = [
  aruodasScenarios.desktopAdvert,
  aruodasScenarios.mobileAdvert,
  aruodasScenarios.activeAdvertWithSoldRelatedCard,
  aruodasScenarios.incompleteAdvert,
  aruodasScenarios.lazyPhotoAdvert,
]

for (const scenario of importableAdverts) {
  test(`imports ${scenario.name} through the browser`, async ({ page }) => {
    await app(page)
    const href = await addPlotDialogBookmarkletHref(page)
    const sourcePage = createAruodasSourcePage(scenario)
    await openSourcePage(page, sourcePage)
    await runAddPlotDialogBookmarklet(page, href, await actualBookmarkletSource(page))
    const review = new ImportReviewPage(page)
    await review.expectListing(scenario.listingId)
    if (scenario.lazyPhotos)
      await expect(page.locator('aside img')).toHaveAttribute('src', /fixture-lazy/)
    if (scenario.missing)
      await expect(page.getByText('No address came with the advert')).toBeVisible()
  })
}

for (const scenario of [
  aruodasScenarios.nonLandAdvert,
  aruodasScenarios.soldAdvert,
  aruodasScenarios.inactiveAdvert,
]) {
  test(`rejects ${scenario.name}`, async ({ page }) => {
    await app(page)
    const href = await addPlotDialogBookmarkletHref(page)
    await openSourcePage(page, createAruodasSourcePage(scenario))
    page.once('dialog', (dialog) => dialog.accept())
    await runAddPlotDialogBookmarklet(page, href, await actualBookmarkletSource(page), {
      expectImport: false,
    })
    await expect(page).toHaveURL(createAruodasSourcePage(scenario).url)
  })
}

test('imports an advert when unrelated JSON-LD is malformed', async ({ page }) => {
  await app(page)
  const href = await addPlotDialogBookmarkletHref(page)
  const fixture = createAruodasSourcePage(aruodasScenarios.malformedAdvert)
  await openSourcePage(page, fixture)
  await runAddPlotDialogBookmarklet(page, href, await actualBookmarkletSource(page))
  await new ImportReviewPage(page).expectListing('11-424242')
})

test('does not manufacture coordinates from malformed Aruodas map data', async ({ page }) => {
  await app(page)
  const href = await addPlotDialogBookmarkletHref(page)
  await openSourcePage(page, createAruodasSourcePage(aruodasScenarios.malformedCoordinatesAdvert))
  const { destination } = await runAddPlotDialogBookmarklet(
    page,
    href,
    await actualBookmarkletSource(page),
  )

  expect(decodeBookmarkletPayload(destination?.fragment ?? '')).toMatchObject({
    kind: 'listing',
    payload: { locationConfidence: 'unknown' },
  })
  expect(decodeBookmarkletPayload(destination?.fragment ?? '')).not.toMatchObject({
    payload: { lat: expect.any(Number) },
  })
})

test('uses the loader fetch fallback and alerts when the scraper cannot load', async ({ page }) => {
  await app(page)
  const href = await addPlotDialogBookmarkletHref(page)
  const fixture = createAruodasSourcePage(aruodasScenarios.desktopAdvert)
  await openSourcePage(page, fixture)
  const result = await runAddPlotDialogBookmarklet(
    page,
    href,
    await actualBookmarkletSource(page),
    { failScriptElement: true },
  )
  expect(result.requests).toBe(2)
  await new ImportReviewPage(page).expectListing('11-424242')
})

test('alerts when both loader paths cannot load the scraper', async ({ page }) => {
  await app(page)
  const href = await addPlotDialogBookmarkletHref(page)
  const fixture = createAruodasSourcePage(aruodasScenarios.desktopAdvert)
  await openSourcePage(page, fixture)
  const dialog = page.waitForEvent('dialog')
  const result = await runAddPlotDialogBookmarklet(
    page,
    href,
    await actualBookmarkletSource(page),
    { failScriptElement: true, failFallback: true, expectImport: false },
  )
  expect(result.requests).toBe(2)
  const alert = await dialog
  expect(alert.type()).toBe('alert')
  expect(alert.message()).toContain('could not load the import script')
})

test('keeps a return marker through advert review and save', async ({ page }) => {
  await app(page)
  const href = await addPlotDialogBookmarkletHref(page)
  const fixture = createAruodasSourcePage(aruodasScenarios.desktopAdvert)
  await openSourcePage(page, {
    ...fixture,
    url: `${fixture.url}#find-me-home-return=import-inbox`,
  })
  await runAddPlotDialogBookmarklet(page, href, await actualBookmarkletSource(page))
  const review = new ImportReviewPage(page)
  await review.save()
  await expect(page).toHaveURL(/\/import-inbox$/)
})

for (const scenario of [aruodasScenarios.desktopAdvert, aruodasScenarios.mobileAdvert]) {
  test(`saves ${scenario.name}, opens its detail, and persists it after reload`, async ({
    page,
  }) => {
    await app(page)
    const href = await addPlotDialogBookmarkletHref(page)
    await openSourcePage(page, createAruodasSourcePage(scenario))
    await runAddPlotDialogBookmarklet(page, href, await actualBookmarkletSource(page))
    await new ImportReviewPage(page).save()
    await expect(page).toHaveURL(/\/source-listings\//)
    await expect(page.getByRole('heading', { level: 1 })).toContainText('Kauno r. sav., Fixture g.')
    await page.reload()
    await expect(page.getByRole('heading', { level: 1 })).toContainText('Kauno r. sav., Fixture g.')
  })
}
