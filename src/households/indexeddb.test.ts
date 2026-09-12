import 'fake-indexeddb/auto'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { createIndexedDbHouseholdRepository } from './indexeddb'

const databases: string[] = []

afterEach(async () => {
  await Promise.all(
    databases.map(
      (name) =>
        new Promise<void>((resolve, reject) => {
          const request = indexedDB.deleteDatabase(name)
          request.onsuccess = () => resolve()
          request.onerror = () => reject(request.error)
        }),
    ),
  )
  databases.length = 0
})

describe('IndexedDB Household repository refresh', () => {
  it('refreshes another instance, notifies views, and never publishes a local mutation', async () => {
    const prefix = `household-refresh-${crypto.randomUUID()}`
    databases.push(`${prefix}-home`)
    const writer = createIndexedDbHouseholdRepository(prefix)
    const reader = createIndexedDbHouseholdRepository(prefix)
    await Promise.all([writer.open('home'), reader.open('home')])
    const changes = vi.fn()
    const localMutations = vi.fn()
    reader.subscribe(changes)
    reader.subscribeLocalMutations(localMutations)

    await writer.create({ id: 'household', householdId: 'home', name: 'Home', updatedAt: 1 })
    expect(reader.get()).toBeUndefined()
    await reader.refresh()

    expect(reader.get()).toMatchObject({ name: 'Home' })
    expect(changes).toHaveBeenCalledTimes(1)
    expect(localMutations).not.toHaveBeenCalled()
    writer.close()
    reader.close()
  })

  it('does nothing when closed or without an active Household', async () => {
    const repository = createIndexedDbHouseholdRepository(`closed-${crypto.randomUUID()}`)
    await expect(repository.refresh()).resolves.toBeUndefined()
    await repository.open('home')
    repository.closeActive()
    await expect(repository.refresh()).resolves.toBeUndefined()
    repository.close()
  })
})
