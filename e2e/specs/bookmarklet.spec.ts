import { expect } from '@playwright/test'
import { initializeE2ePage, test } from '../support/test.ts'
import { AddPlotDialog } from '../components/add-plot-dialog.ts'
import { aruodasScenarios } from '../data/aruodas/scenarios.ts'
import type { AdvertScenario } from '../data/aruodas/scenarios.ts'
import { createAruodasSourcePage } from '../fixtures/aruodas/source-page.ts'
import { decodeImportTransportFragment } from '../../src/imports/aruodas.ts'
import type { AruodasImport } from '../../src/imports/aruodas.ts'
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

const expectImportedDetail = async (page: PlaywrightPage, imported: AruodasImport) => {
  await expect(page.getByLabel('Price (€)')).toHaveValue(String(imported.priceEur))
  // The exact imported pin confirms a Registered Parcel, so the registry's
  // area and purpose are shown; the advert's own values stay behind the toggle.
  await expect(page.getByTestId('area-registry')).toContainText('From the registry')
  await expect(
    page.getByRole('button', { name: `Ours: ${String(imported.areaAres)} — edit` }),
  ).toBeVisible()
  await expect(
    page.getByRole('button', { name: `Ours: ${imported.purposeText ?? ''} — edit` }),
  ).toBeVisible()
  await expect(page.getByText(imported.description ?? '', { exact: true })).toBeVisible()
  await expect(page.getByText('electricity mentioned', { exact: true })).toBeVisible()
  await expect(page.locator('.place')).toHaveText(imported.address ?? '')
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
    await expect(page).toHaveURL(/\/source-listings\//)
    if (scenario.lazyPhotos) {
      await expect(page.locator('aside img').first()).toHaveAttribute('src', /fixture-lazy/)
      await page.reload()
      await expect(page.locator('aside img').first()).toHaveAttribute('src', /fixture-lazy/)
    }
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
  await expect(page).toHaveURL(/\/source-listings\//)
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
  await expect(page).toHaveURL(/\/source-listings\//)
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

test('opens the imported advert even when it came from the favorites inbox', async ({ page }) => {
  await app(page)
  const href = await addPlotDialogBookmarkletHref(page)
  const fixture = createAruodasSourcePage(aruodasScenarios.desktopAdvert)
  await openSourcePage(page, {
    ...fixture,
    url: `${fixture.url}#find-me-home-return=import-inbox`,
  })
  await runAddPlotDialogBookmarklet(page, href, await actualBookmarkletSource(page))
  await expect(page).toHaveURL(/\/source-listings\//)
})

for (const scenario of [aruodasScenarios.desktopAdvert, aruodasScenarios.mobileAdvert]) {
  test(`automatically saves ${scenario.name}, opens its detail, and persists it after reload`, async ({
    page,
  }) => {
    await app(page)
    const href = await addPlotDialogBookmarkletHref(page)
    await openSourcePage(page, createAruodasSourcePage(scenario))
    const { destination } = await runAddPlotDialogBookmarklet(
      page,
      href,
      await actualBookmarkletSource(page),
    )
    const imported = decodeImportTransportFragment(destination?.fragment ?? '')
    if (imported.kind !== 'listing') throw new Error('Expected a listing import')
    await expect(page).toHaveURL(/\/source-listings\/e2e-1$/)
    await expect(page.getByRole('heading', { level: 1 })).toContainText('Kauno r. sav., Fixture g.')
    await expectImportedDetail(page, imported.imported)
    await page.reload()
    await expect(page.getByRole('heading', { level: 1 })).toContainText('Kauno r. sav., Fixture g.')
    await expectImportedDetail(page, imported.imported)
  })
}
