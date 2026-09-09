import { expect } from '@playwright/test'
import { initializeE2ePage, test } from './support/test.ts'
import { E2eSyncRelay } from './support/sync-relay.ts'
import type { Page } from '@playwright/test'
import type { E2eSeed } from '../src/e2e/support'
import { appUrl } from './support/app-url.ts'

const open = async (page: Page) => initializeE2ePage(page)

const seed = async (page: Page, listings: E2eSeed['listings']) =>
  page.evaluate((value) => {
    const api = window.__FMH_E2E__
    if (!api) throw new Error('E2E runtime is unavailable')
    return api.seed({ listings: value })
  }, listings)

const plannedTitles = (page: Page) => page.locator('[aria-label^="Stop "] .t').allTextContents()

const visitPlanIds = (page: Page) =>
  page.evaluate(() => window.__FMH_E2E__?.getVisitPlanSourceListingIds())

const waitForVisitPlan = async (page: Page, sourceListingIds: string[]) =>
  expect.poll(() => visitPlanIds(page)).toEqual(sourceListingIds)

test.describe('visit plan', () => {
  test('covers the empty state and the Google Maps route only appears for located stops', async ({
    page,
  }) => {
    await open(page)
    await seed(page, [])
    await page.goto(appUrl('visit-plan'), {
      waitUntil: 'domcontentloaded',
    })
    await expect(page.getByRole('heading', { name: 'No visits planned yet' })).toBeVisible()
    await expect(page.getByRole('link', { name: 'Open route in Google Maps' })).toHaveCount(0)

    const result = await page.evaluate(async () => {
      const api = window.__FMH_E2E__
      if (!api) throw new Error('E2E runtime is unavailable')
      return api.seed({
        listings: [
          { id: '101', title: 'Located plot', latitude: 54.7, longitude: 25.3 },
          {
            id: '102',
            title: 'Unlocated plot',
            latitude: null,
            longitude: null,
          },
        ],
        plannedListingIds: ['101', '102'],
      })
    })
    await page.goto(appUrl('visit-plan'), {
      waitUntil: 'domcontentloaded',
    })
    await page.getByRole('link', { name: 'Going to see' }).click()

    const route = page.getByRole('link', { name: 'Open route in Google Maps' })
    await expect(route).toHaveAttribute('target', '_blank')
    await expect(route).toHaveAttribute('rel', 'noreferrer')
    await expect(route).toHaveAttribute('href', /destination=54.7%2C25.3/)
    await expect(page.getByText('not on the map')).toBeVisible()
    await expect(page.getByRole('link', { name: 'Located plot', exact: true })).toHaveAttribute(
      'href',
      new RegExp(result.sourceListingIds[0]),
    )
  })

  test('retains driving order across reloads and supports keyboard-operable reordering and removal', async ({
    page,
  }) => {
    await open(page)
    const result = await page.evaluate(async () => {
      const api = window.__FMH_E2E__
      if (!api) throw new Error('E2E runtime is unavailable')
      return api.seed({
        listings: [
          { id: '201', title: 'First' },
          { id: '202', title: 'Second' },
          { id: '203', title: 'Third' },
        ],
        plannedListingIds: ['201', '202', '203'],
      })
    })
    await page.goto(appUrl('visit-plan'), {
      waitUntil: 'domcontentloaded',
    })

    await expect.poll(() => plannedTitles(page)).toEqual(['First', 'Second', 'Third'])
    const moveThirdUp = page.getByRole('button', { name: 'Move Third up' })
    await moveThirdUp.focus()
    await page.keyboard.press('Enter')
    await waitForVisitPlan(page, [
      result.sourceListingIds[0],
      result.sourceListingIds[2],
      result.sourceListingIds[1],
    ])
    await expect.poll(() => plannedTitles(page)).toEqual(['First', 'Third', 'Second'])
    await expect(page.getByRole('button', { name: 'Move First up' })).toBeDisabled()
    await page.getByRole('button', { name: 'Remove Third from the list' }).click()
    await waitForVisitPlan(page, [result.sourceListingIds[0], result.sourceListingIds[1]])
    await expect.poll(() => plannedTitles(page)).toEqual(['First', 'Second'])
    await page.reload()
    await expect.poll(() => plannedTitles(page)).toEqual(['First', 'Second'])

    const view = page.getByRole('group', { name: 'View' })
    await view.getByRole('button', { name: 'Map' }).focus()
    await page.keyboard.press('Enter')
    await expect(view.getByRole('button', { name: 'Map' })).toHaveAttribute('aria-pressed', 'true')
    await expect(view.getByRole('button', { name: 'List' })).toHaveAttribute(
      'aria-pressed',
      'false',
    )
    await page.keyboard.press('Shift+Tab')
    await page.keyboard.press('Enter')
    await expect(page.getByRole('list', { name: 'Visit stops in driving order' })).toBeVisible()

    const fitsViewport = await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    )
    expect(fitsViewport).toBe(true)
  })

  test('shows a failed storage write without changing the visit plan', async ({ page }) => {
    await open(page)
    await seed(page, [{ id: '301', title: 'Cannot save' }])
    await page.evaluate(() => window.__FMH_E2E__?.setFailure('visit-plan-storage'))
    await page.getByRole('button', { name: 'Go see it' }).click()
    await expect(page.getByRole('alert')).toContainText('IndexedDB transaction')
    await expect(page.getByRole('button', { name: 'Go see it' })).toHaveAttribute(
      'aria-pressed',
      'false',
    )
  })

  test('rolls back a failed reorder to the exact persisted visit-plan order', async ({ page }) => {
    await open(page)
    await page.evaluate(async () => {
      const api = window.__FMH_E2E__
      if (!api) throw new Error('E2E runtime is unavailable')
      await api.seed({
        listings: [
          { id: '311', title: 'First persisted' },
          { id: '312', title: 'Second persisted' },
        ],
        plannedListingIds: ['311', '312'],
      })
    })
    await page.goto(appUrl('visit-plan'), { waitUntil: 'domcontentloaded' })
    await expect.poll(() => plannedTitles(page)).toEqual(['First persisted', 'Second persisted'])

    await page.evaluate(() => window.__FMH_E2E__?.setFailure('visit-plan-storage'))
    await page.getByRole('button', { name: 'Move Second persisted up' }).click()

    await expect(page.getByRole('alert')).toContainText('IndexedDB transaction')
    await expect.poll(() => plannedTitles(page)).toEqual(['First persisted', 'Second persisted'])
  })

  test('keeps plan references safe when a listing disappears', async ({ page }) => {
    await open(page)
    const result = await seed(page, [{ id: '401', title: 'Gone soon' }])
    await page.getByRole('button', { name: 'Go see it' }).click()
    await waitForVisitPlan(page, result.sourceListingIds)
    await page.evaluate((id) => {
      const api = window.__FMH_E2E__
      if (!api) throw new Error('E2E runtime is unavailable')
      return api.removeSourceListing(id)
    }, result.sourceListingIds[0])
    await page.goto(appUrl('visit-plan'), {
      waitUntil: 'domcontentloaded',
    })
    await expect(page.getByRole('heading', { name: 'No visits planned yet' })).toBeVisible()
  })
})

test('two pages synchronize initial state and subsequent plan, inbox, visit, and delete mutations', async ({
  browser,
}) => {
  test.setTimeout(60_000)
  const relay = new E2eSyncRelay()
  const firstContext = await browser.newContext()
  const secondContext = await browser.newContext()
  await relay.attach(firstContext)
  await relay.attach(secondContext)
  const first = await firstContext.newPage()
  const second = await secondContext.newPage()
  try {
    await open(first)
    const result = await first.evaluate(async () => {
      const api = window.__FMH_E2E__
      if (!api) throw new Error('E2E runtime is unavailable')
      return api.seed({
        listings: [
          { id: '501', title: 'Shared first' },
          { id: '502', title: 'Shared second' },
        ],
        plannedListingIds: ['501', '502'],
      })
    })
    const [sharedFirstSourceListingId, sharedSecondSourceListingId] = result.sourceListingIds
    const invitation = new URL(
      await first.evaluate(() => {
        const api = window.__FMH_E2E__
        if (!api) throw new Error('E2E runtime is unavailable')
        return api.invitationUrl()
      }),
    )
    await initializeE2ePage(second, `${invitation.pathname}${invitation.hash}`)
    await expect(second.getByRole('link', { name: 'Going to see' })).toContainText('2')
    await second.getByRole('link', { name: 'Going to see' }).click()
    await expect.poll(() => plannedTitles(second)).toEqual(['Shared first', 'Shared second'])
    await expect
      .poll(() => first.evaluate(() => window.__FMH_E2E__?.syncEvents()))
      .toEqual(
        expect.arrayContaining([
          expect.objectContaining({ direction: 'sent', type: 'manifest' }),
          expect.objectContaining({ direction: 'received', type: 'request' }),
          expect.objectContaining({ direction: 'sent', type: 'records' }),
        ]),
      )
    await expect
      .poll(() => second.evaluate(() => window.__FMH_E2E__?.syncEvents()))
      .toEqual(
        expect.arrayContaining([
          expect.objectContaining({ direction: 'received', type: 'manifest' }),
          expect.objectContaining({ direction: 'sent', type: 'request' }),
          expect.objectContaining({ direction: 'received', type: 'records' }),
        ]),
      )

    await second.getByRole('button', { name: 'Move Shared second up' }).click()
    await waitForVisitPlan(second, [sharedSecondSourceListingId, sharedFirstSourceListingId])
    await waitForVisitPlan(first, [sharedSecondSourceListingId, sharedFirstSourceListingId])
    await first.goto(appUrl('visit-plan'), {
      waitUntil: 'domcontentloaded',
    })
    await expect.poll(() => plannedTitles(first)).toEqual(['Shared second', 'Shared first'])
    await first.evaluate(() => window.__FMH_E2E__?.captureInbox('503'))
    await second.goto(appUrl('import-inbox'), {
      waitUntil: 'domcontentloaded',
    })
    await expect(second.getByText('E2E inbox 503')).toBeVisible()
    await first.evaluate((id) => {
      const api = window.__FMH_E2E__
      if (!api) throw new Error('E2E runtime is unavailable')
      return api.markVisited(id)
    }, sharedFirstSourceListingId)
    await second.goto(appUrl('visit-plan'), {
      waitUntil: 'domcontentloaded',
    })
    await expect.poll(() => plannedTitles(second)).toEqual(['Shared second'])
    await second.evaluate((id) => {
      const api = window.__FMH_E2E__
      if (!api) throw new Error('E2E runtime is unavailable')
      return api.removeSourceListing(id)
    }, sharedSecondSourceListingId)
    await first.goto(appUrl('visit-plan'), {
      waitUntil: 'domcontentloaded',
    })
    await expect.poll(() => plannedTitles(first)).toEqual([])

    await first.goto(appUrl(`source-listings/${sharedFirstSourceListingId}`), {
      waitUntil: 'domcontentloaded',
    })
    await first.getByRole('button', { name: 'Go see it' }).click()
    await waitForVisitPlan(first, [sharedFirstSourceListingId])
    await waitForVisitPlan(second, [sharedFirstSourceListingId])

    await second.close()
    const rejoined = await secondContext.newPage()
    try {
      await initializeE2ePage(rejoined, `${invitation.pathname}${invitation.hash}`)
      await expect(rejoined.getByRole('link', { name: 'Going to see' })).toContainText('1')
      await rejoined.getByRole('link', { name: 'Going to see' }).click()
      await expect.poll(() => plannedTitles(rejoined)).toEqual(['Shared first'])
    } finally {
      await rejoined.close()
    }
  } finally {
    await firstContext.close()
    await secondContext.close()
  }
})
