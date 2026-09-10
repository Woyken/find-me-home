import { expect } from '@playwright/test'
import { initializeE2ePage, test } from './support/test.ts'
import type { Page } from '@playwright/test'
import type { E2eListingSeed } from '../src/e2e/support'
import { appPathPattern, appUrl } from './support/app-url.ts'

type SeedResult = {
  sourceListingIds: string[]
}

const seed = async (page: Page, listings: readonly E2eListingSeed[]) =>
  page.evaluate(async (input) => {
    if (!window.__FMH_E2E__) throw new Error('E2E API is unavailable')
    return window.__FMH_E2E__.seed({ listings: input })
  }, listings) as Promise<SeedResult>

const openSeededListing = async (page: Page, listing: E2eListingSeed) => {
  await initializeE2ePage(page)
  const result = await seed(page, [listing])
  await page.goto(appUrl(`source-listings/${result.sourceListingIds[0]}`), {
    waitUntil: 'domcontentloaded',
  })
  await expect(page.getByRole('heading', { level: 1 })).toContainText(
    listing.title ?? `E2E plot ${listing.id}`,
  )
  await expect(page.locator('.check').filter({ hasText: 'Noise' })).toContainText('Quiet')
  return result
}

const waitForRating = async (
  page: Page,
  sourceListingId: string,
  ratingField: 'roadAccessRating' | 'areaFeelingRating' | 'viewRating',
  value: number,
) =>
  expect
    .poll(() =>
      page.evaluate(
        (input) => window.__FMH_E2E__?.getSourceListingRatings(input.id)?.[input.ratingField],
        { id: sourceListingId, ratingField },
      ),
    )
    .toBe(value)

const markByHand = async (page: Page) => {
  await page.getByRole('button', { name: 'Mark another area' }).click()
  await page
    .getByRole('dialog', { name: 'Mark another area' })
    .getByRole('button', { name: 'Mark by hand' })
    .click()
}

test('presents complete listing details, gallery, marked areas, edits and listing ratings', async ({
  page,
}) => {
  const result = await openSeededListing(page, {
    id: '101',
    title: 'Complete fixture',
    address: 'Fixture road 1',
    description: 'City water and sewage are connected.',
    photos: ['data:image/svg+xml,first', 'data:image/svg+xml,second'],
  })

  await expect(page.locator('.gallery > img')).toHaveAttribute('src', /first/)
  await page.getByRole('button', { name: 'Photo 2' }).click()
  await expect(page.locator('.gallery > img')).toHaveAttribute('src', /second/)
  await expect(page.getByText('Automatic checks:')).toHaveCount(0)
  await expect(page.locator('.checklist > .check')).toHaveCount(13)
  await expect(page.locator('.checklist > .check b')).toHaveText([
    'Price',
    'Area',
    'Distance from Vilnius',
    'Land purpose',
    'Walk to bus stop',
    'Bus to city centre',
    'Electricity hookup',
    'Plot + hookup budget',
    'Crime nearby',
    'Legal restrictions',
    'Noise',
    'Shops & schools',
    'Water & sewage',
  ])

  const area = page.locator('article.area').first()
  await area.getByLabel('Name for this area').fill('South field')
  await area.getByLabel('Price (€)').fill('40500,5')
  await area.getByRole('button', { name: 'Ours: 12 — edit' }).click()
  await area.getByLabel('Area (ares)').fill('12,5')
  await area.getByRole('button', { name: 'Ours: Namų valda — edit' }).click()
  await area.getByRole('textbox', { name: 'Land purpose' }).fill('Namų valda')
  await area.getByLabel('Our notes').fill('Sunny after lunch')
  const ratings = page.getByRole('region', { name: 'Our ratings' })
  await ratings
    .getByRole('group', { name: 'Road & access' })
    .getByRole('button', { name: '4 of 5' })
    .click()
  await waitForRating(page, result.sourceListingIds[0], 'roadAccessRating', 4)
  await ratings
    .getByRole('group', { name: 'Feel of the area' })
    .getByRole('button', { name: '3 of 5' })
    .click()
  await waitForRating(page, result.sourceListingIds[0], 'areaFeelingRating', 3)
  await ratings.getByRole('group', { name: 'View' }).getByRole('button', { name: '5 of 5' }).click()
  await waitForRating(page, result.sourceListingIds[0], 'viewRating', 5)
  await area.getByRole('button', { name: 'Save this area' }).click()
  await expect(area.getByLabel('Price (€)')).toHaveValue('40500,5')
  await expect(area.locator('.status-text[role="status"]')).toHaveText('Saved')
  await page.reload()
  await expect(area.getByLabel('Price (€)')).toHaveValue('40500.5')

  await markByHand(page)
  await expect(page.locator('article.area')).toHaveCount(2)
  const secondArea = page.locator('article.area').nth(1)
  await expect(secondArea.getByLabel('Price (€)')).toHaveValue('40500.5')
  await expect(secondArea.getByLabel('Area (ares)')).toHaveValue('12.5')
  await expect(secondArea.getByLabel('Land purpose')).toHaveValue('Namų valda')
  await secondArea.getByLabel('Find it by').selectOption('address')
  await secondArea.getByRole('textbox', { name: 'Address' }).fill('Second field 2')
  await secondArea.getByRole('button', { name: 'Save this area' }).click()
  await expect(secondArea.getByRole('textbox', { name: 'Address' })).toHaveValue('Second field 2')
})

test('marks an exact area from a Regia link and uses confirmed registry facts', async ({
  page,
}) => {
  await openSeededListing(page, { id: '111', title: 'Regia fixture' })
  await page.getByRole('button', { name: 'Mark another area' }).click()
  const dialog = page.getByRole('dialog', { name: 'Mark another area' })
  await dialog
    .getByLabel('Regia link')
    .fill(
      'https://regia.lt/map/regia2?x=586948&y=6053276&scale=2004.818282666542&identify=true&sluo_ids=22',
    )
  await expect(dialog.getByTestId('regia-preview')).toContainText(/Parcel 0101-\d{4}-\d{4}/)
  await dialog.getByRole('button', { name: 'Mark this area' }).click()
  await expect(page.locator('article.area')).toHaveCount(2)
  const area = page.locator('article.area').nth(1)
  await expect(area.locator('dl.kv')).toContainText('Registry match')
  await expect(area.locator('dl.kv')).toContainText('Confirmed')
  await expect(area.getByTestId('area-registry')).toContainText('12.5')
  await expect(area.getByTestId('area-registry')).toContainText('From the registry')
  await expect(area.getByLabel('Price (€)')).toHaveValue('40000')
  await expect(area.getByText('Žemės ūkio', { exact: true }).last()).toBeVisible()
  await expect(area.locator('.checklist > .check').nth(1)).toContainText('12,5 a')
})

test('validates Regia links and prevents duplicate marked areas', async ({ page }) => {
  await openSeededListing(page, { id: '112', title: 'Regia validation fixture' })
  await page.getByRole('button', { name: 'Mark another area' }).click()
  const dialog = page.getByRole('dialog', { name: 'Mark another area' })
  const link = dialog.getByLabel('Regia link')
  for (const [url, message] of [
    ['https://example.com/?x=1&y=2', 'Paste a link copied from regia.lt'],
    ['https://regia.lt/map/regia2?scale=5', 'That Regia link has no map position'],
    ['https://regia.lt/map/regia2?x=1&y=1', 'That position is outside Lithuania'],
  ]) {
    await link.fill(url)
    await expect(dialog.getByRole('alert')).toContainText(message)
    await expect(dialog.getByRole('button', { name: 'Mark this area' })).toBeDisabled()
  }
  const valid = 'https://regia.lt/map/regia2?x=586948&y=6053276'
  await link.fill(valid)
  await expect(dialog.getByRole('button', { name: 'Mark this area' })).toBeEnabled()
  await dialog.getByRole('button', { name: 'Mark this area' }).click()
  await page.getByRole('button', { name: 'Mark another area' }).click()
  const duplicateDialog = page.getByRole('dialog', { name: 'Mark another area' })
  await duplicateDialog.getByLabel('Regia link').fill(valid)
  await expect(duplicateDialog.getByRole('alert')).toContainText("You've already marked this area")
  await duplicateDialog.getByRole('button', { name: 'Show it' }).click()
  await expect(duplicateDialog).toHaveCount(0)
})

test('keeps confirmed registry area when our own area is saved', async ({ page }) => {
  await openSeededListing(page, { id: '113', title: 'Registry override fixture' })
  await page.getByRole('button', { name: 'Mark another area' }).click()
  const dialog = page.getByRole('dialog', { name: 'Mark another area' })
  await dialog.getByLabel('Regia link').fill('https://regia.lt/map/regia2?x=586948&y=6053276')
  await dialog.getByRole('button', { name: 'Mark this area' }).click()
  const area = page.locator('article.area').nth(1)
  await expect(area.getByTestId('area-registry')).toBeVisible()
  await area.getByRole('button', { name: 'Enter our own' }).first().click()
  await area.getByLabel('Area (ares)').fill('9')
  await area.getByRole('button', { name: 'Save this area' }).click()
  await expect(area.getByTestId('area-registry')).toContainText('12.5')
  await expect(area.getByRole('button', { name: 'Ours: 9 — edit' })).toBeVisible()
})

test('offers coordinate-only Waze and Google Maps choices in listing and area direction menus', async ({
  page,
}) => {
  await page.setViewportSize({ width: 375, height: 700 })
  await openSeededListing(page, {
    id: '107',
    title: 'Directions fixture',
    latitude: 54.7,
    longitude: 25.3,
    coordinatePrecision: 'exact',
  })

  const headerDirections = page.locator('header.head').getByRole('button', { name: 'Directions' })
  await headerDirections.click()
  const headerPicker = page.locator('header.head').locator('.directions-menu')
  await expect(headerPicker.getByText('Drive with Waze')).toHaveAttribute(
    'href',
    'https://waze.com/ul?ll=54.7,25.3&navigate=yes',
  )
  await expect(headerPicker.getByText('View in Google Maps')).toHaveAttribute(
    'href',
    'https://www.google.com/maps/search/?api=1&query=54.7,25.3',
  )
  await expect(headerPicker.getByText('View in Google Maps')).not.toHaveAttribute('href', /\/dir\//)
  await page.keyboard.press('Escape')
  await expect(page.locator('.directions-menu')).toHaveCount(0)

  const areaDirections = page
    .locator('article.area')
    .first()
    .getByRole('button', { name: 'Directions' })
  await areaDirections.focus()
  await page.keyboard.press('Enter')
  await page.keyboard.press('Tab')
  await expect(page.getByText('Drive with Waze')).toBeFocused()
  await expect(page.locator('.directions-menu')).toHaveCSS('max-width', '280px')
})

test('uses the exact imported primary destination over an approximate competing marked area', async ({
  page,
}) => {
  await openSeededListing(page, {
    id: '109',
    title: 'Directions ranking fixture',
    latitude: 54.7,
    longitude: 25.3,
    coordinatePrecision: 'exact',
  })
  await markByHand(page)
  const secondArea = page.locator('article.area').nth(1)
  await secondArea.getByLabel('Find it by').selectOption('coordinates')
  await secondArea.getByLabel('Latitude').fill('54.8')
  await secondArea.getByLabel('Longitude').fill('25.4')
  await secondArea.getByLabel('How exact').selectOption('approx')
  await secondArea.getByRole('button', { name: 'Save this area' }).click()
  const secondDirections = secondArea.getByRole('button', { name: 'Directions' })
  await expect(secondDirections).toBeEnabled()
  await secondDirections.click()
  await expect(secondArea.locator('.directions-menu').getByText('Drive with Waze')).toHaveAttribute(
    'href',
    'https://waze.com/ul?ll=54.8,25.4&navigate=yes',
  )

  await page.locator('header.head').getByRole('button', { name: 'Directions' }).click()
  await expect(
    page.locator('header.head .directions-menu').getByText('Drive with Waze'),
  ).toHaveAttribute('href', 'https://waze.com/ul?ll=54.7,25.3&navigate=yes')
})

test('disables directions when a listing has no coordinate destination', async ({ page }) => {
  await initializeE2ePage(page)
  const result = await seed(page, [
    {
      id: '108',
      title: 'No directions fixture',
      latitude: null,
      longitude: null,
    },
  ])
  await page.goto(appUrl(`source-listings/${result.sourceListingIds[0]}`), {
    waitUntil: 'domcontentloaded',
  })
  await expect(page.getByRole('heading', { level: 1 })).toContainText('No directions fixture')
  const directions = page.getByRole('button', { name: 'Directions' })
  await expect(directions).toHaveCount(2)
  await expect(directions.nth(0)).toBeDisabled()
  await expect(directions.nth(1)).toBeDisabled()
})

test('validates numeric and location clue inputs at boundaries', async ({ page }) => {
  await openSeededListing(page, { id: '102', title: 'Validation fixture' })
  const area = page.locator('article.area').first()
  await area.getByLabel('Price (€)').fill('not-a-number')
  await area.getByRole('button', { name: 'Save this area' }).click()
  await expect(area.locator('.status-text')).toContainText('Enter a number')

  await area.getByLabel('Price (€)').fill('0')
  await expect(area.getByTestId('area-registry')).toBeVisible()
  await area.getByRole('button', { name: 'Ours: 12 — edit' }).click()
  await area.getByLabel('Area (ares)').fill('-0.1')
  await area.getByRole('button', { name: 'Save this area' }).click()
  await expect(area.locator('.status-text')).toContainText('Area must be a positive number')

  await area.getByLabel('Find it by').selectOption('coordinates')
  await area.getByLabel('Price (€)').fill('0')
  await area.getByLabel('Latitude').fill('90')
  await area.getByLabel('Longitude').fill('180')
  await area.getByLabel('How exact').selectOption('exact')
  await area.getByLabel('Area (ares)').fill('8')
  await area.getByRole('button', { name: 'Save this area' }).click()
  // The save remounts this editor and clears its local status. Wait for the
  // persisted coordinates so the next validation cannot race its completion.
  await expect(area.getByText('Hint 90, 180')).toBeVisible()

  await area.getByLabel('Longitude').fill('180.1')
  await area.getByRole('button', { name: 'Save this area' }).click()
  await expect(area.locator('.status-text')).toContainText('Longitude must be between -180 and 180')
  await area.getByLabel('Longitude').fill('')
  await area.getByRole('button', { name: 'Save this area' }).click()
  await expect(area.locator('.status-text')).toContainText(
    'Latitude and longitude must be provided together',
  )
})

test('reports resolution and service failures, then retries deterministically', async ({
  page,
}) => {
  await initializeE2ePage(page)
  await page.evaluate(() => window.__FMH_E2E__?.setFailure('location'))
  const result = await seed(page, [{ id: '103', title: 'Retry fixture' }])
  await page.goto(appUrl(`source-listings/${result.sourceListingIds[0]}`), {
    waitUntil: 'domcontentloaded',
  })
  const area = page.locator('article.area').first()
  await expect(area.getByText('The location service could not be reached.')).toBeVisible()
  await expect(area.getByText('What went wrong')).toBeVisible()
  await page.evaluate(() => window.__FMH_E2E__?.setFailure(null))
  await area.getByRole('button', { name: 'Look up again' }).click()
  await expect(area.getByText('Exact shape from the land registry.')).toBeVisible()

  await page.evaluate(() => window.__FMH_E2E__?.setFailure('noise'))
  await area.getByRole('button', { name: /Check again|Run checks/ }).click()
  await expect(area.locator('.check').filter({ hasText: 'Noise' })).toContainText('Unavailable')
  await page.evaluate(() => window.__FMH_E2E__?.setFailure(null))
  await area.getByRole('button', { name: 'Check again' }).click()
  await expect(area.locator('.check').filter({ hasText: 'Noise' })).toContainText('Quiet')
})

test('supports map controls and visit-plan transitions', async ({ page, context }) => {
  await context.grantPermissions(['geolocation'])
  await context.setGeolocation({
    latitude: 54.7,
    longitude: 25.3,
    accuracy: 20,
  })
  const result = await openSeededListing(page, { id: '104', title: 'Map and visit fixture' })
  const area = page.locator('article.area').first()
  await expect(page.getByLabel('Map of the marked areas')).toBeVisible()
  await area.getByRole('button', { name: 'Show on map' }).click()
  await page.getByRole('button', { name: 'Where am I' }).click()
  await expect(page.locator('.bigmap > .status')).toContainText('Live location')
  await page.getByRole('button', { name: 'Full screen' }).click()
  await expect(page.getByRole('button', { name: 'Exit full screen' })).toBeVisible()
  await page.getByRole('button', { name: 'Exit full screen' }).click()

  await page.getByRole('button', { name: 'Go see it' }).click()
  await expect
    .poll(() => page.evaluate(() => window.__FMH_E2E__?.getVisitPlanSourceListingIds()))
    .toEqual(result.sourceListingIds)
  await page.getByRole('button', { name: 'Mark as visited' }).click()
  await expect(page).toHaveURL(/visit-plan/)
  await expect(page.getByRole('heading', { name: 'No visits planned yet' })).toBeVisible()
})

test('removes a listing and restores the saved area when the advert is saved again', async ({
  page,
}) => {
  const listing = { id: '105', title: 'Restore fixture' }
  const result = await openSeededListing(page, listing)
  const area = page.locator('article.area').first()
  await area.getByLabel('Name for this area').fill('Keep this note')
  await page
    .getByRole('region', { name: 'Our ratings' })
    .getByRole('group', { name: 'View' })
    .getByRole('button', { name: '4 of 5' })
    .click()
  await waitForRating(page, result.sourceListingIds[0], 'viewRating', 4)
  await area.getByRole('button', { name: 'Save this area' }).click()
  await expect(area.getByLabel('Name for this area')).toHaveValue('Keep this note')

  page.once('dialog', (dialog) => dialog.accept())
  await page.getByRole('button', { name: 'Remove plot' }).click()
  await expect(page).toHaveURL(appPathPattern())
  await expect(page.getByText('Restore fixture')).toHaveCount(0)

  const restored = await page.evaluate((input) => {
    if (!window.__FMH_E2E__) throw new Error('E2E API is unavailable')
    return window.__FMH_E2E__.resaveListing(input)
  }, listing)
  await page.goto(appUrl(`source-listings/${restored.sourceListingIds[0]}`), {
    waitUntil: 'domcontentloaded',
  })
  const restoredArea = page.locator('article.area').first()
  await expect(restoredArea.getByLabel('Name for this area')).toHaveValue('Keep this note')
  await expect(
    page
      .getByRole('region', { name: 'Our ratings' })
      .getByRole('group', { name: 'View' })
      .getByRole('button', { name: '4 of 5' }),
  ).toHaveAttribute('aria-pressed', 'true')
})

test('deletes an incorrect marked area without removing the listing', async ({ page }) => {
  await openSeededListing(page, { id: '114', title: 'Area removal fixture' })
  await markByHand(page)
  await expect(page.locator('article.area')).toHaveCount(2)

  const secondArea = page.locator('article.area').nth(1)
  page.once('dialog', (dialog) => dialog.accept())
  await secondArea.getByRole('button', { name: 'Delete area' }).click()

  await expect(page.locator('article.area')).toHaveCount(1)
  await expect(page.getByRole('heading', { level: 1 })).toContainText('Area removal fixture')
  await page.reload()
  await expect(page.locator('article.area')).toHaveCount(1)
})

test('keeps removal in the aside on desktop and after marked areas on mobile', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 })
  await openSeededListing(page, { id: '110', title: 'Removal placement fixture' })

  const asideRemoval = page.locator('.listing-removal-aside')
  const bottomRemoval = page.locator('.listing-removal-bottom')
  await expect(asideRemoval).toBeVisible()
  await expect(bottomRemoval).toBeHidden()
  await expect(page.locator('aside .listing-removal-aside')).toHaveCount(1)
  await expect(page.getByRole('button', { name: 'Remove plot' })).toHaveCount(1)

  await page.setViewportSize({ width: 375, height: 700 })
  await expect(asideRemoval).toBeHidden()
  await expect(bottomRemoval).toBeVisible()
  await expect(page.getByRole('button', { name: 'Remove plot' })).toHaveCount(1)
  expect(
    await bottomRemoval.evaluate((removal) => {
      const lastArea = document.querySelector('article.area:last-of-type')
      return lastArea
        ? Boolean(lastArea.compareDocumentPosition(removal) & Node.DOCUMENT_POSITION_FOLLOWING)
        : false
    }),
  ).toBe(true)
})

test('saves listing ratings immediately without saving an area and shares them across areas', async ({
  page,
}) => {
  const result = await openSeededListing(page, { id: '106', title: 'Listing ratings fixture' })
  const ratings = page.getByRole('region', { name: 'Our ratings' })
  await ratings
    .getByRole('group', { name: 'Road & access' })
    .getByRole('button', { name: '4 of 5' })
    .click()
  await waitForRating(page, result.sourceListingIds[0], 'roadAccessRating', 4)
  await expect(
    ratings.getByRole('group', { name: 'Road & access' }).getByRole('button', { name: '4 of 5' }),
  ).toHaveAttribute('aria-pressed', 'true')
  await markByHand(page)
  await expect(page.locator('article.area')).toHaveCount(2)
  await page.reload()
  await expect(
    page
      .getByRole('region', { name: 'Our ratings' })
      .getByRole('group', { name: 'Road & access' })
      .getByRole('button', { name: '4 of 5' }),
  ).toHaveAttribute('aria-pressed', 'true')
})
