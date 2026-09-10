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
  it('aborts migration atomically, then migrates deleted snapshots without resurrecting them', async () => {
    const prefix = `migration-abort-${crypto.randomUUID()}`
    databases.push(`${prefix}-household-a`)
    const original = createIndexedDbSourceListingRepository(prefix, {
      now: () => 1_000,
      uuid: () => crypto.randomUUID(),
    })
    await original.open('household-a')
    const saved = await original.saveReviewedImport(review, 100)
    original.close()
    const database = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open(`${prefix}-household-a`)
      request.onsuccess = () => resolve(request.result)
      request.onerror = () => reject(request.error)
    })
    const transaction = database.transaction(['source-listings', 'candidate-plots'], 'readwrite')
    const listings = transaction.objectStore('source-listings')
    const plots = transaction.objectStore('candidate-plots')
    const listing = await new Promise<Record<string, unknown>>((resolve, reject) => {
      const request = listings.get(saved.sourceListingId)
      request.onsuccess = () => resolve(request.result)
      request.onerror = () => reject(request.error)
    })
    delete listing.roadAccessRating
    delete listing.areaFeelingRating
    delete listing.viewRating
    listing.deletedAt = 200
    listings.put(listing)
    const plot = await new Promise<Record<string, unknown>>((resolve, reject) => {
      const request = plots.get(saved.candidatePlotId)
      request.onsuccess = () => resolve(request.result)
      request.onerror = () => reject(request.error)
    })
    plot.roadAccessRating = 2
    plot.areaFeelingRating = 4
    plot.viewRating = 1
    plot.updatedAt = 200
    plot.deletedAt = 200
    plots.put(plot)
    await new Promise<void>((resolve, reject) => {
      transaction.oncomplete = () => resolve()
      transaction.onerror = () => reject(transaction.error)
    })
    database.close()

    const failing = createIndexedDbSourceListingRepository(prefix, {
      now: () => 1_000,
      uuid: () => crypto.randomUUID(),
      beforeMigrationCommit: (migration) => migration.abort(),
    })
    await expect(failing.open('household-a')).rejects.toBeTruthy()
    failing.close()
    const verify = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open(`${prefix}-household-a`)
      request.onsuccess = () => resolve(request.result)
      request.onerror = () => reject(request.error)
    })
    const unchanged = await new Promise<Record<string, unknown>>((resolve, reject) => {
      const request = verify
        .transaction('candidate-plots')
        .objectStore('candidate-plots')
        .get(saved.candidatePlotId)
      request.onsuccess = () => resolve(request.result)
      request.onerror = () => reject(request.error)
    })
    expect(unchanged).toHaveProperty('roadAccessRating', 2)
    verify.close()

    const reopened = createIndexedDbSourceListingRepository(prefix, {
      now: () => 1_000,
      uuid: () => crypto.randomUUID(),
    })
    await reopened.open('household-a')
    expect(reopened.get(saved.sourceListingId)).toBeUndefined()
    expect(reopened.allRecords()).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: saved.sourceListingId, deletedAt: 200, roadAccessRating: 2 }),
        expect.objectContaining({ id: saved.candidatePlotId, deletedAt: 200 }),
      ]),
    )
    reopened.close()
  })

  it('normalizes older plots before validation, migrates one complete rating snapshot, and persists it once', async () => {
    const prefix = `legacy-ratings-${crypto.randomUUID()}`
    databases.push(`${prefix}-household-a`)
    const repository = createIndexedDbSourceListingRepository(prefix, {
      now: () => 1_000,
      uuid: () => crypto.randomUUID(),
    })
    await repository.open('household-a')
    const saved = await repository.saveReviewedImport(review, 100)
    const secondary = await repository.addCandidatePlot(saved.sourceListingId, 100)
    repository.close()

    const database = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open(`${prefix}-household-a`)
      request.onsuccess = () => resolve(request.result)
      request.onerror = () => reject(request.error)
    })
    const transaction = database.transaction(['source-listings', 'candidate-plots'], 'readwrite')
    const listings = transaction.objectStore('source-listings')
    const plots = transaction.objectStore('candidate-plots')
    const listing = (await new Promise<unknown>((resolve, reject) => {
      const request = listings.get(saved.sourceListingId)
      request.onsuccess = () => resolve(request.result)
      request.onerror = () => reject(request.error)
    })) as Record<string, unknown>
    delete listing.visitedAt
    delete listing.roadAccessRating
    delete listing.areaFeelingRating
    delete listing.viewRating
    listings.put(listing)
    const primary = (await new Promise<unknown>((resolve, reject) => {
      const request = plots.get(saved.candidatePlotId)
      request.onsuccess = () => resolve(request.result)
      request.onerror = () => reject(request.error)
    })) as Record<string, unknown>
    delete primary.primaryLocationClue
    delete primary.resolvedAddress
    delete primary.resolvedParcelNumber
    delete primary.resolvedCadastralNumber
    primary.roadAccessRating = 2
    primary.areaFeelingRating = 4
    primary.viewRating = 1
    primary.updatedAt = 100
    plots.put(primary)
    const other = {
      ...primary,
      id: secondary,
      importKey: null,
      roadAccessRating: 5,
      viewRating: 5,
      // A newer non-primary snapshot must not displace the primary legacy ratings.
      updatedAt: 9_999,
    }
    plots.put(other)
    await new Promise<void>((resolve, reject) => {
      transaction.oncomplete = () => resolve()
      transaction.onerror = () => reject(transaction.error)
    })
    database.close()

    await repository.open('household-a')
    expect(repository.get(saved.sourceListingId)).toMatchObject({
      roadAccessRating: 2,
      areaFeelingRating: 4,
      viewRating: 1,
      updatedAt: 101,
    })
    expect(repository.get(saved.sourceListingId)?.candidatePlots[0]).toMatchObject({
      primaryLocationClue: null,
    })
    repository.close()

    const reopened = createIndexedDbSourceListingRepository(prefix)
    await reopened.open('household-a')
    expect(reopened.get(saved.sourceListingId)?.updatedAt).toBe(101)
    reopened.close()
    const verify = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open(`${prefix}-household-a`)
      request.onsuccess = () => resolve(request.result)
      request.onerror = () => reject(request.error)
    })
    const persisted = await new Promise<Record<string, unknown>>((resolve, reject) => {
      const request = verify
        .transaction('candidate-plots')
        .objectStore('candidate-plots')
        .get(saved.candidatePlotId)
      request.onsuccess = () => resolve(request.result)
      request.onerror = () => reject(request.error)
    })
    expect(persisted).not.toHaveProperty('roadAccessRating')
    expect(persisted).not.toHaveProperty('areaFeelingRating')
    expect(persisted).not.toHaveProperty('viewRating')
    verify.close()
  })

  it('creates a Candidate Plot from initial household facts and a Recorded Location Clue', async () => {
    const prefix = `initial-candidate-plot-${crypto.randomUUID()}`
    databases.push(`${prefix}-household-a`)
    const repository = createIndexedDbSourceListingRepository(prefix, {
      now: () => 1_000,
      uuid: () => crypto.randomUUID(),
    })
    await repository.open('household-a')
    const saved = await repository.saveReviewedImport(review, 100)
    const candidatePlotId = await repository.addCandidatePlot(saved.sourceListingId, 101, {
      areaAres: 12.5,
      latitudeClue: 54.7,
      longitudeClue: 25.3,
      coordinateCluePrecision: 'exact',
    })
    expect(
      repository
        .get(saved.sourceListingId)
        ?.candidatePlots.find((plot) => plot.id === candidatePlotId),
    ).toMatchObject({
      areaAres: 12.5,
      latitudeClue: 54.7,
      resolvedLatitude: 54.7,
      resolvedLongitude: 25.3,
      resolvedPrecision: 'exact',
      effectiveLocationSource: 'coordinates',
      locationResolutionState: 'missing',
    })
  })

  it('captures, refreshes, restores, and removes inbox records with stable identity', async () => {
    const prefix = `import-inbox-${crypto.randomUUID()}`
    databases.push(`${prefix}-household-a`)
    let uuid = 0
    const repository = createIndexedDbSourceListingRepository(prefix, {
      now: () => 100,
      uuid: () => `id-${++uuid}`,
    })
    await repository.open('household-a')

    const first = await repository.captureImportInbox(
      [imported, imported, { ...imported, sourceId: '11-9999999' }],
      10,
    )
    expect(first).toMatchObject({
      added: 2,
      refreshed: 0,
      alreadyImported: 0,
    })
    expect(repository.listImportInbox()).toHaveLength(2)
    const original = repository
      .listImportInbox()
      .find((record) => record.sourceId === imported.sourceId)!

    const refreshed = await repository.captureImportInbox(
      [{ ...imported, title: 'Refreshed title' }],
      20,
    )
    expect(refreshed).toMatchObject({
      added: 0,
      refreshed: 1,
      alreadyImported: 0,
    })
    expect(refreshed.records[0]).toMatchObject({
      id: original.id,
      title: 'Refreshed title',
      updatedAt: 20,
    })

    await repository.removeImportInbox(original.id, 30)
    expect(repository.listImportInbox()).toHaveLength(1)
    const restored = await repository.captureImportInbox([imported], 40)
    expect(restored).toMatchObject({ added: 0, refreshed: 1 })
    expect(restored.records[0]).toMatchObject({
      id: original.id,
      updatedAt: 40,
    })
    expect(restored.records[0].deletedAt).toBeUndefined()
    repository.close()
  })

  it('keeps active Source Listings out of the inbox and tombstones on review', async () => {
    const prefix = `reviewed-inbox-${crypto.randomUUID()}`
    databases.push(`${prefix}-household-a`)
    let uuid = 0
    const repository = createIndexedDbSourceListingRepository(prefix, {
      now: () => 100,
      uuid: () => `id-${++uuid}`,
    })
    await repository.open('household-a')
    await repository.captureImportInbox([imported], 10)

    await repository.saveReviewedImport(review, 20)
    expect(repository.listImportInbox()).toEqual([])
    expect(
      repository
        .allRecords()
        .find(
          (record) =>
            'sourceId' in record && !('url' in record) && record.sourceId === imported.sourceId,
        ),
    ).toMatchObject({ updatedAt: 20, deletedAt: 20 })

    const captured = await repository.captureImportInbox([imported], 30)
    expect(captured).toMatchObject({
      added: 0,
      refreshed: 0,
      alreadyImported: 1,
      records: [],
    })
    expect(repository.listImportInbox()).toEqual([])
    repository.close()
  })

  it('atomically saves review edits with UUID identity and reopens them', async () => {
    const prefix = `source-listings-${crypto.randomUUID()}`
    databases.push(`${prefix}-household-a`)
    let uuid = 0
    const create = () =>
      createIndexedDbSourceListingRepository(prefix, {
        now: () => 1_788_290_400_000,
        uuid: () => `00000000-0000-4000-8000-${String(++uuid).padStart(12, '0')}`,
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

  it('removes one Candidate Plot while retaining its synchronization tombstone', async () => {
    const prefix = `remove-candidate-plot-${crypto.randomUUID()}`
    databases.push(`${prefix}-household-a`)
    let uuid = 0
    const repository = createIndexedDbSourceListingRepository(prefix, {
      now: () => 100,
      uuid: () => `id-${++uuid}`,
    })
    await repository.open('household-a')
    const saved = await repository.saveReviewedImport(review, 100)
    const secondPlotId = await repository.addCandidatePlot(saved.sourceListingId, 101)

    await repository.removeCandidatePlot(saved.sourceListingId, secondPlotId, 102)

    expect(repository.get(saved.sourceListingId)?.candidatePlots).toMatchObject([
      { id: saved.candidatePlotId },
    ])
    expect(repository.allRecords()).toContainEqual(
      expect.objectContaining({ id: secondPlotId, updatedAt: 102, deletedAt: 102 }),
    )
    repository.close()
  })
})
