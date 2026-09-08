import { expect, test } from '@playwright/test'
import type { Page } from '@playwright/test'
import type { E2eListingSeed } from '../src/e2e/support'

type SeedResult = {
  sourceListingIds: string[]
}

const namespace = () =>
  `detail-${test.info().project.name.replace(/[^a-z0-9]/gi, '')}-${test.info().testId.replace(/[^a-z0-9]/gi, '')}`.slice(
    0,
    80,
  )

const seed = async (page: Page, listings: readonly E2eListingSeed[]) =>
  page.evaluate(async (input) => {
    if (!window.__FMH_E2E__) throw new Error('E2E API is unavailable')
    return window.__FMH_E2E__.seed({ listings: input })
  }, listings) as Promise<SeedResult>

const openSeededListing = async (page: Page, listing: E2eListingSeed) => {
  const e2eNamespace = namespace()
  await page.goto(`/?e2e=${e2eNamespace}`, { waitUntil: 'domcontentloaded' })
  await expect
    .poll(() => page.evaluate(() => Boolean(window.__FMH_E2E__)))
    .toBe(true)
  const result = await seed(page, [listing])
  await page.goto(
    `/source-listings/${result.sourceListingIds[0]}?e2e=${e2eNamespace}`,
    { waitUntil: 'domcontentloaded' },
  )
  await expect(page.getByRole('heading', { level: 1 })).toContainText(
    listing.title ?? `E2E plot ${listing.id}`,
  )
  await expect(
    page.locator('.check').filter({ hasText: 'Noise' }),
  ).toContainText('Quiet')
}

test('presents complete listing details, gallery, marked areas, edits and ratings', async ({
  page,
}) => {
  await openSeededListing(page, {
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
  await area.getByLabel('Area (ares)').fill('12,5')
  await area.getByLabel('Land purpose').fill('Namų valda')
  await area.getByLabel('Our notes').fill('Sunny after lunch')
  await area
    .getByRole('group', { name: 'Road & access' })
    .getByRole('button', { name: '4 of 5' })
    .click()
  await area
    .getByRole('group', { name: 'Feel of the area' })
    .getByRole('button', { name: '3 of 5' })
    .click()
  await area
    .getByRole('group', { name: 'View' })
    .getByRole('button', { name: '5 of 5' })
    .click()
  await area.getByRole('button', { name: 'Save this area' }).click()
  await expect(area.getByLabel('Price (€)')).toHaveValue('40500.5')

  await page.getByRole('button', { name: 'Mark another area' }).click()
  await expect(page.locator('article.area')).toHaveCount(2)
  const secondArea = page.locator('article.area').nth(1)
  await secondArea.getByLabel('Find it by').selectOption('address')
  await secondArea
    .getByRole('textbox', { name: 'Address' })
    .fill('Second field 2')
  await secondArea.getByRole('button', { name: 'Save this area' }).click()
  await expect(
    secondArea.getByRole('textbox', { name: 'Address' }),
  ).toHaveValue('Second field 2')
})

test('validates numeric and location clue inputs at boundaries', async ({
  page,
}) => {
  await openSeededListing(page, { id: '102', title: 'Validation fixture' })
  const area = page.locator('article.area').first()
  await area.getByLabel('Price (€)').fill('not-a-number')
  await area.getByRole('button', { name: 'Save this area' }).click()
  await expect(area.locator('.status-text')).toContainText('Enter a number')

  await area.getByLabel('Price (€)').fill('0')
  await area.getByLabel('Area (ares)').fill('-0.1')
  await area.getByRole('button', { name: 'Save this area' }).click()
  await expect(area.locator('.status-text')).toContainText(
    'Area must be a positive number',
  )

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
  await expect(area.locator('.status-text')).toContainText(
    'Longitude must be between -180 and 180',
  )
  await area.getByLabel('Longitude').fill('')
  await area.getByRole('button', { name: 'Save this area' }).click()
  await expect(area.locator('.status-text')).toContainText(
    'Latitude and longitude must be provided together',
  )
})

test('reports resolution and service failures, then retries deterministically', async ({
  page,
}) => {
  const e2eNamespace = namespace()
  await page.goto(`/?e2e=${e2eNamespace}`, { waitUntil: 'domcontentloaded' })
  await expect
    .poll(() => page.evaluate(() => Boolean(window.__FMH_E2E__)))
    .toBe(true)
  await page.evaluate(() => window.__FMH_E2E__?.setFailure('location'))
  const result = await seed(page, [{ id: '103', title: 'Retry fixture' }])
  await page.goto(
    `/source-listings/${result.sourceListingIds[0]}?e2e=${e2eNamespace}`,
    { waitUntil: 'domcontentloaded' },
  )
  const area = page.locator('article.area').first()
  await expect(
    area.getByText('The location service could not be reached.'),
  ).toBeVisible()
  await expect(area.getByText('What went wrong')).toBeVisible()
  await page.evaluate(() => window.__FMH_E2E__?.setFailure(null))
  await area.getByRole('button', { name: 'Look up again' }).click()
  await expect(
    area.getByText('Exact shape from the land registry.'),
  ).toBeVisible()

  await page.evaluate(() => window.__FMH_E2E__?.setFailure('noise'))
  await area.getByRole('button', { name: /Check again|Run checks/ }).click()
  await expect(
    area.locator('.check').filter({ hasText: 'Noise' }),
  ).toContainText('Unavailable')
  await page.evaluate(() => window.__FMH_E2E__?.setFailure(null))
  await area.getByRole('button', { name: 'Check again' }).click()
  await expect(
    area.locator('.check').filter({ hasText: 'Noise' }),
  ).toContainText('Quiet')
})

test('supports map controls and visit-plan transitions', async ({
  page,
  context,
}) => {
  await context.grantPermissions(['geolocation'])
  await context.setGeolocation({
    latitude: 54.7,
    longitude: 25.3,
    accuracy: 20,
  })
  await openSeededListing(page, { id: '104', title: 'Map and visit fixture' })
  const area = page.locator('article.area').first()
  await expect(page.getByLabel('Map of the marked areas')).toBeVisible()
  await area.getByRole('button', { name: 'Show on map' }).click()
  await page.getByRole('button', { name: 'Where am I' }).click()
  await expect(page.locator('.bigmap > .status')).toContainText('Live location')
  await page.getByRole('button', { name: 'Full screen' }).click()
  await expect(
    page.getByRole('button', { name: 'Exit full screen' }),
  ).toBeVisible()
  await page.getByRole('button', { name: 'Exit full screen' }).click()

  await page.getByRole('button', { name: 'Go see it' }).click()
  await expect(page.getByRole('button', { name: 'Going to see' })).toBeVisible()
  await page.getByRole('button', { name: 'Mark as visited' }).click()
  await expect(page).toHaveURL(/visit-plan/)
  await expect(
    page.getByRole('heading', { name: 'No visits planned yet' }),
  ).toBeVisible()
})

test('removes a listing and restores the saved area when the advert is saved again', async ({
  page,
}) => {
  const listing = { id: '105', title: 'Restore fixture' }
  await openSeededListing(page, listing)
  const area = page.locator('article.area').first()
  await area.getByLabel('Name for this area').fill('Keep this note')
  await area
    .getByRole('group', { name: 'View' })
    .getByRole('button', { name: '4 of 5' })
    .click()
  await area.getByRole('button', { name: 'Save this area' }).click()
  await expect(area.getByLabel('Name for this area')).toHaveValue(
    'Keep this note',
  )

  page.once('dialog', (dialog) => dialog.accept())
  await page.getByRole('button', { name: 'Remove plot' }).click()
  await expect(page).toHaveURL(/\/$/)
  await expect(page.getByText('Restore fixture')).toHaveCount(0)

  const restored = await page.evaluate((input) => {
    if (!window.__FMH_E2E__) throw new Error('E2E API is unavailable')
    return window.__FMH_E2E__.resaveListing(input)
  }, listing)
  await page.goto(
    `/source-listings/${restored.sourceListingIds[0]}?e2e=${namespace()}`,
    { waitUntil: 'domcontentloaded' },
  )
  const restoredArea = page.locator('article.area').first()
  await expect(restoredArea.getByLabel('Name for this area')).toHaveValue(
    'Keep this note',
  )
  await expect(
    restoredArea
      .getByRole('group', { name: 'View' })
      .getByRole('button', { name: '4 of 5' }),
  ).toHaveAttribute('aria-pressed', 'true')
})
