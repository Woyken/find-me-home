import 'fake-indexeddb/auto'
import { afterEach, describe, expect, it } from 'vitest'
import { parseAruodasImport } from '../imports/aruodas'
import { createIndexedDbSourceListingRepository } from './indexeddb'

const databases: string[] = []
afterEach(async () => {
  await Promise.all(
    databases.map(
      (name) =>
        new Promise<void>((resolve) => {
          const request = indexedDB.deleteDatabase(name)
          request.onsuccess = () => resolve()
        }),
    ),
  )
  databases.length = 0
})

const imported = parseAruodasImport({
  url: 'https://www.aruodas.lt/sklypai-vilniaus-rajone-upes-g-sklypas-11-1472707/',
  title: 'Žemųjų Rusokų sklypas',
  address: 'Upės g. 7',
  priceEur: 85_000,
  areaAres: 15,
  purposeText: 'Namų valda',
  lat: 54.8,
  lng: 25.2,
  locationConfidence: 'approx',
  photos: ['https://aruodas-img.dgn.lt/plot.jpg'],
  features: ['Elektra'],
})

const review = {
  imported,
  priceEur: 82_000,
  areaAres: 14.8,
  purposeText: 'Gyvenamoji',
  notes: 'Patikrinti privažiavimą',
  parcelNumberClue: null,
  latitudeClue: 54.8,
  longitudeClue: 25.2,
  coordinateCluePrecision: 'approx' as const,
  addressClue: null,
}

describe('Household Source Listing repository', () => {
  it('atomically saves review edits with UUID identity and reopens them', async () => {
    const prefix = `source-listings-${crypto.randomUUID()}`
    databases.push(`${prefix}-household-a`)
    let uuid = 0
    const create = () =>
      createIndexedDbSourceListingRepository(prefix, {
        now: () => 1_788_290_400_000,
        uuid: () =>
          `00000000-0000-4000-8000-${String(++uuid).padStart(12, '0')}`,
      })
    const repository = create()
    await repository.open('household-a')
    const saved = await repository.saveReviewedImport(review)
    expect(saved.created).toBe(true)
    expect(repository.get(saved.sourceListingId)).toMatchObject({
      householdId: 'household-a',
      title: 'Žemųjų Rusokų sklypas',
      updatedAt: 1_788_290_400_000,
      candidatePlots: [
        {
          priceEur: 82_000,
          notes: 'Patikrinti privažiavimą',
          updatedAt: 1_788_290_400_000,
        },
      ],
    })
    repository.close()

    const reopened = create()
    await reopened.open('household-a')
    expect(reopened.list()).toHaveLength(1)
    expect(reopened.get(saved.sourceListingId)?.candidatePlots).toHaveLength(1)
    reopened.close()
  })

  it('deduplicates within a Household without replacing Candidate Plot edits', async () => {
    const prefix = `source-listings-${crypto.randomUUID()}`
    databases.push(`${prefix}-household-a`, `${prefix}-household-b`)
    let uuid = 0
    const repository = createIndexedDbSourceListingRepository(prefix, {
      now: () => 100,
      uuid: () => `id-${++uuid}`,
    })
    await repository.open('household-a')
    const first = await repository.saveReviewedImport(review)
    const second = await repository.saveReviewedImport({
      ...review,
      imported: { ...imported, title: 'Atnaujintas skelbimas' },
      notes: 'must not replace the first review',
    })
    expect(second).toEqual({ ...first, created: false })
    expect(repository.get(first.sourceListingId)).toMatchObject({
      title: 'Atnaujintas skelbimas',
      candidatePlots: [{ notes: 'Patikrinti privažiavimą' }],
    })

    await repository.open('household-b')
    expect((await repository.saveReviewedImport(review)).created).toBe(true)
    repository.close()
  })
})
