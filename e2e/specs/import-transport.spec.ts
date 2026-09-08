import { expect, test } from '@playwright/test'
import { aruodasScenarios, renderAruodasScenario } from '../data/aruodas/scenarios.ts'
import { createAruodasSourcePage } from '../fixtures/aruodas/source-page.ts'
import { ImportInboxPage } from '../pages/import-inbox.page.ts'
import { ImportReviewPage } from '../pages/import-review.page.ts'
import {
  addPlotDialogBookmarkletHref,
  actualBookmarkletSource,
  decodeBookmarkletPayload,
  openSourcePage,
  runAddPlotDialogBookmarklet,
} from '../support/bookmarklet-source.ts'
import type { PlaywrightPage } from '../support/bookmarklet-source.ts'
import { appUrl } from '../support/app-url.ts'

const encode = (value: unknown) => Buffer.from(JSON.stringify(value), 'utf8').toString('base64url')

const app = async (page: PlaywrightPage, namespace: string) => {
  await page.goto(appUrl(`?e2e=${namespace}`))
  await expect.poll(() => page.evaluate(() => Boolean(window.__FMH_E2E__))).toBe(true)
  await page.evaluate(async () => {
    const api = window.__FMH_E2E__
    if (!api) throw new Error('E2E runtime is unavailable')
    await api.ready()
    await api.reset()
    await api.seed({ listings: [] })
  }, undefined)
}

const favoritesPayload = (fragment: string | undefined) => {
  if (!fragment) throw new Error('Bookmarklet did not produce an import fragment')
  return decodeBookmarkletPayload(fragment)
}

test('moves favorites to the IndexedDB inbox, then returns after saving an advert', async ({
  page,
}) => {
  await app(page, 'favorites-journey')
  const href = await addPlotDialogBookmarkletHref(page)
  await openSourcePage(page, createAruodasSourcePage(aruodasScenarios.desktopFavorites))
  const { destination } = await runAddPlotDialogBookmarklet(
    page,
    href,
    await actualBookmarkletSource(page),
  )
  await expect(page).toHaveURL(/\/import-inbox/)
  expect(favoritesPayload(destination?.fragment)).toMatchObject({
    version: 2,
    kind: 'favorites',
    payload: {
      items: [
        { sourceId: '11-424242' },
        {
          sourceId: '11-424248',
          thumbnail: 'https://img.aruodas.lt/favorite-lazy.jpg',
        },
      ],
      skippedNonLand: 1,
      skippedInactive: 2,
      unreadable: 1,
    },
  })
  const inbox = new ImportInboxPage(page)
  await inbox.expectClippings(2)
  await expect(page.getByText(/1\s*skipped, not land/)).toBeVisible()
  await expect(page.getByText(/2\s*skipped, sold/)).toBeVisible()
  await expect(page.getByText(/1\s*could not be read/)).toBeVisible()
  await expect(page.locator('.upnext img')).toHaveAttribute('src', /favorite-lazy/)

  await page.route(/https:\/\/www\.aruodas\.lt\/11-424242\/.*/, async (route) => {
    await route.fulfill({
      contentType: 'text/html',
      body: renderAruodasScenario(aruodasScenarios.desktopAdvert),
    })
  })
  await inbox.openAdvert()
  await page.waitForURL(/https:\/\/www\.aruodas\.lt\/11-424242\/#find-me-home-return/)
  await runAddPlotDialogBookmarklet(page, href, await actualBookmarkletSource(page))
  const review = new ImportReviewPage(page)
  await review.expectListing('11-424242')
  await review.save()
  await expect(page).toHaveURL(/\/import-inbox\?e2e=favorites-journey$/)
  await inbox.expectClippings(1)
})

test('moves mobile Aruodas favorites through the inbox with lazy thumbnails', async ({ page }) => {
  await app(page, 'mobile-favorites-journey')
  const href = await addPlotDialogBookmarkletHref(page)
  await openSourcePage(page, createAruodasSourcePage(aruodasScenarios.mobileFavorites))
  const { destination } = await runAddPlotDialogBookmarklet(
    page,
    href,
    await actualBookmarkletSource(page),
  )
  await expect(page).toHaveURL(/\/import-inbox/)

  expect(favoritesPayload(destination?.fragment)).toMatchObject({
    version: 2,
    kind: 'favorites',
    payload: {
      items: [
        { sourceId: '11-424242' },
        {
          sourceId: '11-424243',
          thumbnail: 'https://img.aruodas.lt/favorite-lazy.jpg',
        },
      ],
      skippedInactive: 1,
      skippedNonLand: 0,
      unreadable: 0,
    },
  })
  const inbox = new ImportInboxPage(page)
  await inbox.expectClippings(2)
  await expect(page.getByText(/1\s*skipped, sold/)).toBeVisible()
  await expect(page.locator('.upnext img')).toHaveAttribute('src', /favorite-lazy/)
})

test('accepts v1 and v2 fragments and removes the fragment after storing a session draft', async ({
  page,
}) => {
  await app(page, 'fragment-versions')
  const payload = {
    url: 'https://www.aruodas.lt/sklypai-test-11-999999/',
    title: 'Fragment plot',
    photos: [],
  }
  await page.goto(appUrl(`?e2e=fragment-versions#import=${encode({ version: 1, payload })}`))
  await new ImportReviewPage(page).expectListing('11-999999')
  await expect(page).toHaveURL(appUrl('?e2e=fragment-versions'))
  await page.goto(
    appUrl(`?e2e=fragment-versions#import=${encode({ version: 2, kind: 'listing', payload })}`),
  )
  await new ImportReviewPage(page).expectListing('11-999999')
  await page.reload()
  await new ImportReviewPage(page).expectListing('11-999999')
})

test('rejects malformed, hostile, and oversized fragments without retaining a draft', async ({
  page,
}) => {
  await app(page, 'hostile-fragments')
  for (const [index, fragment] of [
    'not-base64!',
    encode({
      version: 2,
      kind: 'listing',
      payload: { url: 'javascript:alert(1)' },
    }),
    Buffer.from('x'.repeat(100_001)).toString('base64url'),
  ].entries()) {
    await page.goto(appUrl(`?e2e=hostile-fragments&import-case=${index}#import=${fragment}`))
    await new ImportReviewPage(page).expectUnreadable()
    await page.getByRole('button', { name: 'Back to plots' }).click()
    await expect(page).toHaveURL(new RegExp(`\\?e2e=hostile-fragments&import-case=${index}$`))
  }
})
