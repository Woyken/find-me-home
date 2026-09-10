// @vitest-environment jsdom

import { render } from '@solidjs/web'
import { afterEach, describe, expect, it, vi } from 'vitest'
import App from './App'
import { HouseholdHeader } from './components/HouseholdHeader'
import type { HouseholdRuntime } from './households/runtime'
import type { HouseholdRuntimeState } from './households/model'
import { encodeImportFragment } from './imports/aruodas'
import type { ImportInboxCaptureResult } from './imports/inbox-model'
import type { SourceListingDetail } from './source-listings/model'

let dispose: (() => void) | undefined

afterEach(() => {
  dispose?.()
  document.body.replaceChildren()
  sessionStorage.clear()
  history.replaceState(null, '', '/')
})

const mount = (runtime: HouseholdRuntime) => {
  const container = document.createElement('div')
  document.body.append(container)
  dispose = render(
    () => (
      <App runtime={runtime}>
        <HouseholdHeader />
        <p>Existing product flows</p>
      </App>
    ),
    container,
  )
}

const mountRouter = (runtime: HouseholdRuntime) => {
  const container = document.createElement('div')
  document.body.append(container)
  dispose = render(() => <App runtime={runtime} />, container)
}

const findButton = (name: string) =>
  [...document.querySelectorAll('button')].find((button) => button.textContent.trim() === name)

const waitFor = async (assertion: () => void) => {
  for (let attempt = 0; attempt < 20; attempt += 1) {
    try {
      assertion()
      return
    } catch {
      await new Promise((resolve) => setTimeout(resolve))
    }
  }
  assertion()
}

const createTestRuntime = () => {
  let state: HouseholdRuntimeState = { status: 'starting' }
  const listeners = new Set<() => void>()
  const publish = (next: HouseholdRuntimeState) => {
    state = next
    for (const listener of listeners) listener()
  }
  const active = (name: string, householdId = 'household-id'): HouseholdRuntimeState => ({
    status: 'active',
    household: {
      id: 'record-id',
      householdId,
      name,
      updatedAt: 100,
    },
    access: {
      householdId,
      invitationSecret: 'secret',
      initialized: true,
      lastOpenedAt: 100,
    },
    roomPassword: 'room-password',
    syncStatus: 'alone',
  })
  const runtime: HouseholdRuntime = {
    state: () => state,
    subscribe(listener) {
      listeners.add(listener)
      return () => listeners.delete(listener)
    },
    start: async () => publish({ status: 'no-household' }),
    createHousehold: async () => publish(active('Our home search')),
    joinHousehold: async () => undefined,
    updateSourceListingRatings: async () => undefined,
    listHouseholds: () =>
      state.status === 'active'
        ? [
            {
              householdId: state.access.householdId,
              name: state.household.name,
              lastOpenedAt: 100,
              initialized: true,
            },
            {
              householdId: 'second-household',
              name: 'Lake search',
              lastOpenedAt: 50,
              initialized: true,
            },
          ]
        : [],
    switchHousehold: async (householdId) => publish(active('Lake search', householdId)),
    removeHousehold: async () => publish({ status: 'no-household' }),
    renameActiveHousehold: async (name) => publish(active(name)),
    listSourceListings: () => [],
    getSourceListing: () => undefined,
    listImportInbox: () => [],
    captureImportInbox: async () => ({
      added: 0,
      refreshed: 0,
      alreadyImported: 0,
      records: [],
    }),
    removeImportInbox: async () => undefined,
    saveReviewedImport: async () => {
      throw new Error('Not used')
    },
    addCandidatePlot: async () => {
      throw new Error('Not used')
    },
    previewRegisteredParcel: async () => null,
    updateCandidatePlot: async () => undefined,
    resolveCandidatePlotLocation: async () => undefined,
    isCandidatePlotLocationRunning: () => false,
    getCandidatePlotLocationDiagnostic: () => undefined,
    runCandidatePlotAutomaticChecks: () => Promise.resolve(),
    isCandidatePlotAutomaticChecksRunning: () => false,
    getVisitPlan: () => ({
      id: 'visit-plan',
      householdId: 'household-id',
      sourceListingIds: [],
      updatedAt: 0,
    }),
    setVisitPlan: async () => undefined,
    markSourceListingVisited: async () => undefined,
    removeSourceListing: async () => undefined,
    getSourceListingRecords: () => [],
    getInvitationUrl: () => 'https://example.test/#household=secret',
    getLastChangeAt: () => 100,
    dispose: () => listeners.clear(),
  }
  return runtime
}

describe('App Household boundary', () => {
  it('resumes a listing draft stored by the previous app version', async () => {
    sessionStorage.setItem(
      'find-me-home-import-draft',
      JSON.stringify({
        source: 'aruodas',
        sourceId: '11-1',
        url: 'https://www.aruodas.lt/11-1/',
        locationConfidence: 'unknown',
        photos: [],
        raw: { importedBy: 'aruodas-bookmarklet', features: [] },
      }),
    )

    const runtime = createTestRuntime()
    mountRouter(runtime)
    await runtime.createHousehold()

    await waitFor(() =>
      expect(document.body.textContent).toContain('Check what we found, then save'),
    )
  })
  it('renders a directly loaded imported Source Listing', async () => {
    const runtime = createTestRuntime()
    let listing: SourceListingDetail = {
      id: 'listing-id',
      householdId: 'household-id',
      source: 'aruodas',
      sourceId: '11-1471486',
      url: 'https://www.aruodas.lt/sklypai/example-11-1471486/',
      title: 'Imported listing',
      address: 'Vilniaus r.',
      description: null,
      photos: [],
      utilities: {},
      raw: { importedBy: 'aruodas-bookmarklet', features: [] },
      visitedAt: null,
      roadAccessRating: null,
      areaFeelingRating: null,
      viewRating: null,
      updatedAt: 100,
      candidatePlots: [
        {
          id: 'plot-id',
          householdId: 'household-id',
          sourceListingId: 'listing-id',
          importKey: 'primary',
          name: null,
          priceEur: 40_000,
          areaAres: 10,
          purposeText: 'Namų valda',
          notes: null,
          parcelNumberClue: null,
          latitudeClue: 54.8,
          longitudeClue: 25.2,
          coordinateCluePrecision: 'exact',
          addressClue: null,
          primaryLocationClue: null,
          resolvedLatitude: null,
          resolvedLongitude: null,
          resolvedAddress: null,
          resolvedParcelNumber: null,
          resolvedCadastralNumber: null,
          resolvedBoundary: null,
          resolvedPrecision: null,
          effectiveLocationSource: null,
          locationResolutionState: 'missing',
          parcelDatasetVersion: null,
          automaticChecks: null,
          automaticChecksRevision: null,
          updatedAt: 100,
        },
      ],
    }
    runtime.start = runtime.createHousehold
    runtime.getSourceListing = (id) => (id === listing.id ? listing : undefined)
    runtime.resolveCandidatePlotLocation = vi.fn(async () => {
      await runtime.renameActiveHousehold('Updated search')
    })
    runtime.runCandidatePlotAutomaticChecks = vi.fn(async () => undefined)
    history.replaceState(null, '', '/source-listings/listing-id')

    mountRouter(runtime)

    await waitFor(() => expect(document.body.textContent).toContain('Imported listing'))
    await waitFor(() => {
      expect(runtime.resolveCandidatePlotLocation).toHaveBeenCalledTimes(1)
      expect(runtime.runCandidatePlotAutomaticChecks).toHaveBeenCalledTimes(1)
    })

    let settleRating: (() => void) | undefined
    runtime.updateSourceListingRatings = vi.fn(
      () => new Promise<void>((resolve) => (settleRating = resolve)),
    )
    const roadRating = [...document.querySelectorAll<HTMLButtonElement>('button')].find(
      (button) =>
        button.getAttribute('aria-label') === '4 of 5' &&
        button.closest('[aria-label="Road & access"]'),
    )
    if (!roadRating) throw new Error('Listing rating control is missing')
    roadRating.click()
    await waitFor(() => {
      expect(roadRating.getAttribute('aria-pressed')).toBe('true')
      expect(runtime.updateSourceListingRatings).toHaveBeenCalledWith('listing-id', {
        roadAccessRating: 4,
        areaFeelingRating: null,
        viewRating: null,
      })
    })
    const higherRoadRating = [...document.querySelectorAll<HTMLButtonElement>('button')].find(
      (button) =>
        button.getAttribute('aria-label') === '5 of 5' &&
        button.closest('[aria-label="Road & access"]'),
    )
    if (!higherRoadRating) throw new Error('Higher listing rating control is missing')
    expect(higherRoadRating.disabled).toBe(false)
    higherRoadRating.click()
    await waitFor(() =>
      expect(runtime.updateSourceListingRatings).toHaveBeenLastCalledWith('listing-id', {
        roadAccessRating: 5,
        areaFeelingRating: null,
        viewRating: null,
      }),
    )
    settleRating?.()
    await new Promise((resolve) => setTimeout(resolve))

    const regiaLink = document.querySelector<HTMLAnchorElement>(
      'a[href^="https://regia.lt/map/regia2?"]',
    )
    expect(regiaLink?.textContent.trim()).toBe('REGIA')
    expect(regiaLink?.target).toBe('_blank')
    expect(regiaLink?.rel).toBe('noopener noreferrer')

    listing.candidatePlots[0].locationResolutionState = 'resolved'
    await runtime.renameActiveHousehold('Parcel retry')
    await waitFor(() => expect(findButton('Look up again')).toBeTruthy())
    findButton('Look up again')?.click()
    await waitFor(() => expect(runtime.resolveCandidatePlotLocation).toHaveBeenCalledTimes(2))

    let rejectSave: ((error: Error) => void) | undefined
    const updateCandidatePlot = vi.fn(
      () =>
        new Promise<void>((_, reject) => {
          rejectSave = reject
        }),
    )
    runtime.updateCandidatePlot = updateCandidatePlot
    const clueKind = document.querySelector<HTMLSelectElement>('select[name="clue-kind"]')
    if (!clueKind) throw new Error('Location hint selector is missing')
    clueKind.value = 'address'
    clueKind.dispatchEvent(new Event('change', { bubbles: true }))

    await waitFor(() =>
      expect(
        [...document.querySelectorAll<HTMLInputElement>('input')].find(
          (input) => input.value === 'Vilniaus r.',
        ),
      ).toBeTruthy(),
    )
    findButton('Save this area')?.click()
    await waitFor(() =>
      expect(updateCandidatePlot).toHaveBeenCalledWith(
        'listing-id',
        'plot-id',
        expect.objectContaining({
          latitudeClue: 54.8,
          longitudeClue: 25.2,
          coordinateCluePrecision: 'exact',
          addressClue: 'Vilniaus r.',
          primaryLocationClue: 'address',
        }),
      ),
    )
    const saveButtons = () =>
      [...document.querySelectorAll<HTMLButtonElement>('button')].filter(
        (button) => button.textContent.trim() === 'Save this area',
      )
    await waitFor(() => {
      expect(saveButtons()[0].disabled).toBe(true)
      expect(document.querySelector('article.area .status-text')?.textContent).toContain('Saving')
    })
    listing = {
      ...listing,
      candidatePlots: [
        ...listing.candidatePlots,
        { ...listing.candidatePlots[0], id: 'second-plot-id', importKey: null },
      ],
    }
    await runtime.renameActiveHousehold('A second area arrived')
    await waitFor(() => {
      expect(saveButtons()).toHaveLength(2)
      expect(saveButtons()[0].disabled).toBe(true)
      expect(saveButtons()[1].disabled).toBe(false)
    })
    rejectSave?.(new Error('Could not save area'))
    await waitFor(() => {
      expect(saveButtons()[0].disabled).toBe(false)
      expect(document.querySelector('article.area .status-text')?.textContent).toContain(
        'Could not save area',
      )
    })

    listing = {
      ...listing,
      candidatePlots: [
        {
          ...listing.candidatePlots[0],
          latitudeClue: null,
          longitudeClue: null,
        },
      ],
    }
    await runtime.renameActiveHousehold('No coordinates')
    await waitFor(() => expect(document.querySelector('a[href^="https://regia.lt/"]')).toBeNull())

    listing = {
      ...listing,
      candidatePlots: [
        {
          ...listing.candidatePlots[0],
          resolvedLatitude: 54.690165483250915,
          resolvedLongitude: 25.27825197453475,
          effectiveLocationSource: 'address',
        },
      ],
    }
    await runtime.renameActiveHousehold('Address resolved')
    await waitFor(() =>
      expect(
        document.querySelector<HTMLAnchorElement>('a[href^="https://regia.lt/"]')?.href,
      ).toContain('?x=582411&y=6062277&'),
    )

    runtime.listSourceListings = () => [listing]
    document.querySelector<HTMLAnchorElement>('a.crumb')?.click()
    await waitFor(() => {
      expect(location.pathname).toBe('/')
      const link = document.querySelector<HTMLAnchorElement>('.list a[href^="https://regia.lt/"]')
      expect(link?.href).toContain('?x=582411&y=6062277&')
      expect(link?.target).toBe('_blank')
      expect(link?.rel).toBe('noopener noreferrer')
    })
  })

  it('keeps unsaved area fields when saving a listing rating refreshes its snapshot', async () => {
    const runtime = createTestRuntime()
    let listing: SourceListingDetail = {
      id: 'listing-id',
      householdId: 'household-id',
      source: 'aruodas',
      sourceId: '11-1471486',
      url: 'https://www.aruodas.lt/sklypai/example-11-1471486/',
      title: 'Imported listing',
      address: null,
      description: null,
      photos: [],
      utilities: {},
      raw: {},
      visitedAt: null,
      roadAccessRating: null,
      areaFeelingRating: null,
      viewRating: null,
      updatedAt: 100,
      candidatePlots: [
        {
          id: 'plot-id',
          householdId: 'household-id',
          sourceListingId: 'listing-id',
          importKey: 'primary',
          name: null,
          priceEur: 40_000,
          areaAres: 10,
          purposeText: null,
          notes: null,
          parcelNumberClue: null,
          latitudeClue: null,
          longitudeClue: null,
          coordinateCluePrecision: null,
          addressClue: null,
          primaryLocationClue: null,
          resolvedLatitude: null,
          resolvedLongitude: null,
          resolvedAddress: null,
          resolvedParcelNumber: null,
          resolvedCadastralNumber: null,
          resolvedBoundary: null,
          resolvedPrecision: null,
          effectiveLocationSource: null,
          locationResolutionState: 'resolved',
          parcelDatasetVersion: null,
          automaticChecks: [],
          automaticChecksRevision: null,
          updatedAt: 100,
        },
      ],
    }
    runtime.start = runtime.createHousehold
    runtime.getSourceListing = (id) => (id === listing.id ? listing : undefined)
    const updateSourceListingRatings = vi.fn(async (_id: string, ratings) => {
      listing = { ...listing, ...ratings }
      await runtime.renameActiveHousehold('Rating saved')
    })
    runtime.updateSourceListingRatings = updateSourceListingRatings
    const updateCandidatePlot = vi.spyOn(runtime, 'updateCandidatePlot')
    history.replaceState(null, '', '/source-listings/listing-id')

    mountRouter(runtime)
    await waitFor(() => expect(document.body.textContent).toContain('Imported listing'))

    const inputs = [...document.querySelectorAll<HTMLInputElement>('input')]
    const price = inputs.find((input) => input.value === '40000')
    const area = inputs.find((input) => input.value === '10')
    if (!price || !area) throw new Error('Area fields are missing')
    price.value = '40500,5'
    price.dispatchEvent(new Event('input', { bubbles: true }))
    area.value = '12,5'
    area.dispatchEvent(new Event('input', { bubbles: true }))

    const roadRating = [...document.querySelectorAll<HTMLButtonElement>('button')].find(
      (button) =>
        button.getAttribute('aria-label') === '4 of 5' &&
        button.closest('[aria-label="Road & access"]'),
    )
    if (!roadRating) throw new Error('Listing rating control is missing')
    roadRating.click()

    await waitFor(() => {
      expect(updateSourceListingRatings).toHaveBeenCalledWith('listing-id', {
        roadAccessRating: 4,
        areaFeelingRating: null,
        viewRating: null,
      })
      expect(roadRating.getAttribute('aria-pressed')).toBe('true')
    })
    await waitFor(() => {
      expect(listing.roadAccessRating).toBe(4)
      expect(price.value).toBe('40500,5')
      expect(area.value).toBe('12,5')
    })
    const saveArea = findButton('Save this area')
    if (!saveArea) throw new Error('Save this area button is missing')
    saveArea.click()
    await waitFor(() =>
      expect(updateCandidatePlot).toHaveBeenCalledWith(
        'listing-id',
        'plot-id',
        expect.objectContaining({ priceEur: 40_500.5, areaAres: 12.5 }),
      ),
    )
  })

  it('rolls a rejected rating write back to the authoritative snapshot', async () => {
    const runtime = createTestRuntime()
    const listing: SourceListingDetail = {
      id: 'listing-id',
      householdId: 'household-id',
      source: 'aruodas',
      sourceId: '11-1471486',
      url: 'https://www.aruodas.lt/sklypai/example-11-1471486/',
      title: 'Imported listing',
      address: null,
      description: null,
      photos: [],
      utilities: {},
      raw: {},
      visitedAt: null,
      roadAccessRating: null,
      areaFeelingRating: null,
      viewRating: null,
      updatedAt: 100,
      candidatePlots: [],
    }
    runtime.start = runtime.createHousehold
    runtime.getSourceListing = (id) => (id === listing.id ? listing : undefined)
    let reject!: (error: Error) => void
    runtime.updateSourceListingRatings = vi.fn(
      () => new Promise<void>((_, nextReject) => (reject = nextReject)),
    )
    history.replaceState(null, '', '/source-listings/listing-id')
    mountRouter(runtime)
    await waitFor(() => expect(document.body.textContent).toContain('Imported listing'))
    const star = [...document.querySelectorAll<HTMLButtonElement>('button')].find(
      (button) =>
        button.getAttribute('aria-label') === '4 of 5' &&
        button.closest('[aria-label="Road & access"]'),
    )
    if (!star) throw new Error('Listing rating control is missing')
    star.click()
    await waitFor(() => expect(star.getAttribute('aria-pressed')).toBe('true'))
    reject(new Error('offline'))
    await waitFor(() => {
      expect(star.getAttribute('aria-pressed')).toBe('false')
      expect(document.body.textContent).toContain("Couldn't save rating. Try again.")
    })
  })

  it('keeps the latest rating intent when older writes settle out of order', async () => {
    const runtime = createTestRuntime()
    let listing: SourceListingDetail = {
      id: 'listing-id',
      householdId: 'household-id',
      source: 'aruodas',
      sourceId: '11-1471486',
      url: 'https://www.aruodas.lt/sklypai/example-11-1471486/',
      title: 'Imported listing',
      address: null,
      description: null,
      photos: [],
      utilities: {},
      raw: {},
      visitedAt: null,
      roadAccessRating: null,
      areaFeelingRating: null,
      viewRating: null,
      updatedAt: 100,
      candidatePlots: [],
    }
    runtime.start = runtime.createHousehold
    runtime.getSourceListing = (id) => (id === listing.id ? listing : undefined)
    const writes: { resolve: () => void; reject: (error: Error) => void }[] = []
    runtime.updateSourceListingRatings = vi.fn(
      () => new Promise<void>((resolve, reject) => writes.push({ resolve, reject })),
    )
    history.replaceState(null, '', '/source-listings/listing-id')
    mountRouter(runtime)
    await waitFor(() => expect(document.body.textContent).toContain('Imported listing'))
    const roadStar = (value: string) => {
      const star = [...document.querySelectorAll<HTMLButtonElement>('button')].find(
        (button) =>
          button.getAttribute('aria-label') === `${value} of 5` &&
          button.closest('[aria-label="Road & access"]'),
      )
      if (!star) throw new Error('Listing rating control is missing')
      return star
    }
    roadStar('4').click()
    await waitFor(() => expect(roadStar('4').getAttribute('aria-pressed')).toBe('true'))
    expect(roadStar('5').disabled).toBe(false)
    roadStar('5').click()
    await waitFor(() => expect(roadStar('5').getAttribute('aria-pressed')).toBe('true'))
    writes[1].resolve()
    listing = { ...listing, roadAccessRating: 5, updatedAt: 101 }
    await runtime.renameActiveHousehold('Updated search')
    await waitFor(() => expect(roadStar('5').getAttribute('aria-pressed')).toBe('true'))
    writes[0].reject(new Error('older request failed'))
    await waitFor(() => expect(roadStar('5').getAttribute('aria-pressed')).toBe('true'))
    expect(roadStar('4').getAttribute('aria-pressed')).toBe('false')
  })

  it('shows the favourites pile being brought over, lets a failed capture be retried, and only then says all sorted', async () => {
    sessionStorage.setItem(
      'find-me-home-import-draft',
      JSON.stringify({
        kind: 'favorites',
        items: [
          {
            source: 'aruodas',
            sourceId: '11-1',
            url: 'https://www.aruodas.lt/11-1/',
            locationConfidence: 'unknown',
            photos: [],
            raw: { importedBy: 'aruodas-bookmarklet', features: [] },
          },
          {
            source: 'aruodas',
            sourceId: '11-2',
            url: 'https://www.aruodas.lt/11-2/',
            locationConfidence: 'unknown',
            photos: [],
            raw: { importedBy: 'aruodas-bookmarklet', features: [] },
          },
        ],
        skippedNonLand: 0,
        skippedInactive: 0,
        unreadable: 0,
      }),
    )
    const runtime = createTestRuntime()
    let settle: ((succeed: boolean) => void) | undefined
    runtime.captureImportInbox = vi.fn(
      () =>
        new Promise<ImportInboxCaptureResult>((resolve, reject) => {
          settle = (succeed) =>
            succeed
              ? resolve({
                  added: 0,
                  refreshed: 0,
                  alreadyImported: 2,
                  records: [],
                })
              : reject(new Error('Household is changing'))
        }),
    )
    history.replaceState(null, '', '/import-inbox')
    mountRouter(runtime)
    await runtime.createHousehold()

    await waitFor(() =>
      expect(document.body.textContent).toContain('Bringing over your Aruodas favourites'),
    )
    expect(document.body.textContent).toContain('2 clippings are on their way')
    expect(document.body.textContent).not.toContain('All sorted')
    expect(runtime.captureImportInbox).toHaveBeenCalledTimes(1)

    settle?.(false)
    await waitFor(() =>
      expect(document.body.textContent).toContain('Your favourites did not come through'),
    )
    expect(document.body.textContent).toContain('Household is changing')
    expect(document.body.textContent).not.toContain('All sorted')
    expect(sessionStorage.getItem('find-me-home-import-draft')).toContain('11-2')

    findButton('Try again')?.click()
    await waitFor(() => expect(runtime.captureImportInbox).toHaveBeenCalledTimes(2))
    await waitFor(() =>
      expect(document.body.textContent).toContain('Bringing over your Aruodas favourites'),
    )
    expect(document.body.textContent).not.toContain('did not come through')

    settle?.(true)
    await waitFor(() => expect(document.body.textContent).toContain('All sorted'))
    expect(document.body.textContent).toContain(
      'Brought over from your Aruodas favourites just now',
    )
    expect(document.body.textContent).toContain('2already saved')
    expect(document.body.textContent).not.toContain('Household is changing')
    expect(sessionStorage.getItem('find-me-home-import-draft')).toBeNull()
  })

  it('restores a clipping when marking it not interested fails', async () => {
    const runtime = createTestRuntime()
    runtime.listImportInbox = () => [
      {
        id: 'inbox-id',
        householdId: 'household-id',
        source: 'aruodas',
        sourceId: '11-1',
        title: 'Keep me',
        updatedAt: 100,
      },
    ]
    runtime.removeImportInbox = vi.fn(async () => {
      throw new Error('Could not remove clipping')
    })
    history.replaceState(null, '', '/import-inbox')
    mountRouter(runtime)
    await runtime.createHousehold()

    await waitFor(() => expect(document.body.textContent).toContain('Keep me'))
    findButton('Not interested')?.click()

    await waitFor(() => {
      expect(document.body.textContent).toContain('Could not remove clipping')
      expect(document.body.textContent).toContain('Keep me')
    })
    expect(runtime.removeImportInbox).toHaveBeenCalledWith('inbox-id')
  })

  it('removes an import fragment and resumes its review after creating a Household', async () => {
    const fragment = encodeImportFragment({
      url: 'https://www.aruodas.lt/sklypai-vilniaus-rajone-upes-g-sklypas-11-1472707/',
      title: 'Žemųjų Rusokų sklypas',
      address: 'Upės g. 7',
      photos: [],
      features: [],
    })
    history.replaceState(null, '', `/#import=${fragment}`)
    mount(createTestRuntime())

    expect(location.hash).toBe('')
    await waitFor(() => expect(findButton('Start a search')).toBeTruthy())
    expect(document.body.textContent).not.toContain('Check what we found, then save')

    findButton('Start a search')?.click()

    await waitFor(() =>
      expect(document.body.textContent).toContain('Check what we found, then save'),
    )
    expect(document.body.textContent).toContain('Žemųjų Rusokų sklypas')
    expect(sessionStorage.getItem('find-me-home-import-draft')).toContain('Žemųjų Rusokų sklypas')
  })

  it('automatically saves a priced Aruodas listing and opens the saved listing', async () => {
    const fragment = encodeImportFragment({
      url: 'https://www.aruodas.lt/sklypai-vilniaus-rajone-upes-g-sklypas-11-1472707/',
      title: 'Žemųjų Rusokų sklypas',
      priceEur: 55_000,
      photos: [],
      features: [],
    })
    const runtime = createTestRuntime()
    const save = vi.fn(async () => ({
      sourceListingId: 'saved-listing-id',
      candidatePlotId: 'plot-id',
      created: true,
    }))
    runtime.start = runtime.createHousehold
    runtime.saveReviewedImport = save
    history.replaceState(null, '', `/#import=${fragment}`)

    mountRouter(runtime)

    await waitFor(() => expect(save).toHaveBeenCalledTimes(1))
    expect(save).toHaveBeenCalledWith(
      expect.objectContaining({
        imported: expect.objectContaining({ sourceId: '11-1472707', priceEur: 55_000 }),
        priceEur: 55_000,
        areaAres: null,
        purposeText: null,
        notes: null,
      }),
    )
    expect(sessionStorage.getItem('find-me-home-import-draft')).toBeNull()
  })

  it('keeps an Aruodas listing for review when its price is missing', async () => {
    const fragment = encodeImportFragment({
      url: 'https://www.aruodas.lt/sklypai-vilniaus-rajone-upes-g-sklypas-11-1472707/',
      title: 'Žemųjų Rusokų sklypas',
      photos: [],
      features: [],
    })
    const runtime = createTestRuntime()
    const save = vi.fn(async () => ({
      sourceListingId: 'saved-listing-id',
      candidatePlotId: 'plot-id',
      created: true,
    }))
    runtime.start = runtime.createHousehold
    runtime.saveReviewedImport = save
    history.replaceState(null, '', `/#import=${fragment}`)

    mountRouter(runtime)

    await waitFor(() =>
      expect(document.body.textContent).toContain('Check what we found, then save'),
    )
    expect(save).not.toHaveBeenCalled()
    expect(sessionStorage.getItem('find-me-home-import-draft')).toContain('Žemųjų Rusokų sklypas')
  })

  it('keeps the review open with the save error when automatic import fails', async () => {
    const fragment = encodeImportFragment({
      url: 'https://www.aruodas.lt/sklypai-vilniaus-rajone-upes-g-sklypas-11-1472707/',
      title: 'Žemųjų Rusokų sklypas',
      priceEur: 55_000,
      photos: [],
      features: [],
    })
    const runtime = createTestRuntime()
    let attempts = 0
    const save = vi.fn(async () => {
      attempts += 1
      if (attempts === 1) throw new Error('Could not save the listing')
      return {
        sourceListingId: 'saved-listing-id',
        candidatePlotId: 'plot-id',
        created: true,
      }
    })
    runtime.start = runtime.createHousehold
    runtime.saveReviewedImport = save
    history.replaceState(null, '', `/#import=${fragment}`)

    mountRouter(runtime)

    await waitFor(() => expect(document.body.textContent).toContain('Could not save the listing'))
    expect(save).toHaveBeenCalledTimes(1)
    expect(sessionStorage.getItem('find-me-home-import-draft')).toContain('Žemųjų Rusokų sklypas')

    findButton('Save plot')?.click()

    await waitFor(() => expect(save).toHaveBeenCalledTimes(2))
    await waitFor(() => expect(sessionStorage.getItem('find-me-home-import-draft')).toBeNull())
  })

  it('shows a recoverable error instead of restoring an invalid persisted import', async () => {
    sessionStorage.setItem(
      'find-me-home-import-draft',
      JSON.stringify({ kind: 'listing', imported: { source: 'aruodas' } }),
    )
    const runtime = createTestRuntime()
    runtime.start = runtime.createHousehold
    const save = vi.fn()
    runtime.saveReviewedImport = save

    mountRouter(runtime)

    await waitFor(() =>
      expect(document.body.textContent).toContain('This saved import could not be read.'),
    )
    expect(save).not.toHaveBeenCalled()
    expect(sessionStorage.getItem('find-me-home-import-draft')).toBeNull()
  })

  it('does not duplicate or redirect an automatic save after its view is disposed', async () => {
    const fragment = encodeImportFragment({
      url: 'https://www.aruodas.lt/sklypai-vilniaus-rajone-upes-g-sklypas-11-1472707/',
      title: 'Žemųjų Rusokų sklypas',
      priceEur: 55_000,
      photos: [],
      features: [],
    })
    let resolveSave:
      | ((result: { sourceListingId: string; candidatePlotId: string; created: boolean }) => void)
      | undefined
    const runtime = createTestRuntime()
    const save = vi.fn(
      () =>
        new Promise<{
          sourceListingId: string
          candidatePlotId: string
          created: boolean
        }>((resolve) => {
          resolveSave = resolve
        }),
    )
    runtime.start = runtime.createHousehold
    runtime.saveReviewedImport = save
    history.replaceState(null, '', `/#import=${fragment}`)

    mountRouter(runtime)

    await waitFor(() => expect(save).toHaveBeenCalledTimes(1))
    location.hash = `import=${fragment}`
    await new Promise((resolve) => setTimeout(resolve))
    expect(save).toHaveBeenCalledTimes(1)
    dispose?.()
    resolveSave?.({
      sourceListingId: 'saved-listing-id',
      candidatePlotId: 'plot-id',
      created: true,
    })
    await new Promise((resolve) => setTimeout(resolve))
    expect(sessionStorage.getItem('find-me-home-import-draft')).toContain('Žemųjų Rusokų sklypas')
  })

  it('retires a deferred automatic save when an unpriced draft replaces it', async () => {
    const first = encodeImportFragment({
      url: 'https://www.aruodas.lt/sklypai-vilniaus-rajone-first-11-1472707/',
      priceEur: 55_000,
      photos: [],
      features: [],
    })
    const second = encodeImportFragment({
      url: 'https://www.aruodas.lt/sklypai-vilniaus-rajone-second-11-1472708/',
      photos: [],
      features: [],
    })
    let resolveSave:
      | ((result: { sourceListingId: string; candidatePlotId: string; created: boolean }) => void)
      | undefined
    const runtime = createTestRuntime()
    const save = vi.fn(
      () =>
        new Promise<{
          sourceListingId: string
          candidatePlotId: string
          created: boolean
        }>((resolve) => {
          resolveSave = resolve
        }),
    )
    runtime.start = runtime.createHousehold
    runtime.saveReviewedImport = save
    history.replaceState(null, '', `/#import=${first}`)
    mountRouter(runtime)

    await waitFor(() => expect(save).toHaveBeenCalledTimes(1))
    location.hash = `import=${second}`
    await waitFor(() => expect(findButton('Save plot')?.disabled).toBe(false))
    expect(document.querySelector<HTMLInputElement>('input[aria-label="Price"]')?.value).toBe('')
    resolveSave?.({ sourceListingId: 'first-id', candidatePlotId: 'plot-id', created: true })
    await new Promise((resolve) => setTimeout(resolve))
    expect(save).toHaveBeenCalledTimes(1)
    expect(sessionStorage.getItem('find-me-home-import-draft')).toContain('11-1472708')
  })

  it('automatically saves a corrected fresh draft for the same Aruodas advert', async () => {
    const first = encodeImportFragment({
      url: 'https://www.aruodas.lt/sklypai-vilniaus-rajone-upes-g-sklypas-11-1472707/',
      priceEur: 55_000,
      photos: [],
      features: [],
    })
    const corrected = encodeImportFragment({
      url: 'https://www.aruodas.lt/sklypai-vilniaus-rajone-upes-g-sklypas-11-1472707/',
      priceEur: 60_000,
      photos: [],
      features: [],
    })
    let attempts = 0
    const runtime = createTestRuntime()
    const save = vi.fn(async () => {
      attempts += 1
      if (attempts === 1) throw new Error('Temporary save failure')
      return { sourceListingId: 'saved-listing-id', candidatePlotId: 'plot-id', created: true }
    })
    runtime.start = runtime.createHousehold
    runtime.saveReviewedImport = save
    history.replaceState(null, '', `/#import=${first}`)
    mountRouter(runtime)

    await waitFor(() => expect(document.body.textContent).toContain('Temporary save failure'))
    location.hash = `import=${corrected}`
    await waitFor(() => expect(save).toHaveBeenCalledTimes(2))
    expect(save).toHaveBeenLastCalledWith(expect.objectContaining({ priceEur: 60_000 }))
  })

  it('captures an import fragment added after the application has started', async () => {
    const fragment = encodeImportFragment({
      url: 'https://www.aruodas.lt/sklypai-vilniaus-rajone-upes-g-sklypas-11-1472707/',
      title: 'Žemųjų Rusokų sklypas',
      photos: [],
      features: [],
    })
    mount(createTestRuntime())
    await waitFor(() => expect(findButton('Start a search')).toBeTruthy())
    findButton('Start a search')?.click()
    await waitFor(() => expect(document.body.textContent).toContain('Existing product flows'))

    location.hash = `import=${fragment}`

    await waitFor(() =>
      expect(document.body.textContent).toContain('Check what we found, then save'),
    )
    expect(location.hash).toBe('')
    expect(sessionStorage.getItem('find-me-home-import-draft')).toContain('Žemųjų Rusokų sklypas')
  })

  it('offers create or join before mounting Household content', async () => {
    mount(createTestRuntime())

    await waitFor(() => expect(findButton('Start a search')).toBeTruthy())
    expect(document.body.textContent).toContain("Join someone's search")
    expect(document.body.textContent).not.toContain('Existing product flows')

    findButton('Start a search')?.click()

    await waitFor(() => expect(document.body.textContent).toContain('Our home search'))
    expect(document.body.textContent).toContain('Existing product flows')
  })

  it('shares pending lifecycle state between create and join, then recovers from an error', async () => {
    const runtime = createTestRuntime()
    const createHousehold = runtime.createHousehold
    let rejectCreate: ((error: Error) => void) | undefined
    runtime.createHousehold = vi.fn(
      () =>
        new Promise<void>((_, reject) => {
          rejectCreate = reject
        }),
    )
    mount(runtime)

    await waitFor(() => expect(findButton('Start a search')).toBeTruthy())
    findButton('Start a search')?.click()
    await waitFor(() => {
      expect(findButton('Creating…')?.disabled).toBe(true)
      expect(findButton('Join')?.disabled).toBe(true)
    })
    rejectCreate?.(new Error('Could not create search'))
    await waitFor(() => {
      expect(findButton('Start a search')?.disabled).toBe(false)
      expect(findButton('Join')?.disabled).toBe(false)
      expect(document.querySelector('[role="alert"]')?.textContent).toContain(
        'Could not create search',
      )
    })

    runtime.createHousehold = createHousehold
    findButton('Start a search')?.click()
    await waitFor(() => expect(document.body.textContent).toContain('Existing product flows'))
  })

  it('renames the active search through the runtime', async () => {
    const runtime = createTestRuntime()
    mount(runtime)
    await waitFor(() => expect(findButton('Start a search')).toBeTruthy())
    findButton('Start a search')?.click()
    await waitFor(() => expect(findButton('Our search settings')).toBeTruthy())
    findButton('Our search settings')?.click()
    await waitFor(() => {
      expect(document.querySelector('input[aria-label="Search name"]')).toBeTruthy()
    })
    const nameInput = document.querySelector<HTMLInputElement>('input[aria-label="Search name"]')
    if (!nameInput) throw new Error('Search name input is missing')
    nameInput.value = 'Forest edge search'
    nameInput.dispatchEvent(new InputEvent('input', { bubbles: true }))
    await waitFor(() => expect(findButton('Save')).toBeTruthy())
    findButton('Save')?.click()

    await waitFor(() =>
      expect(document.querySelector('h1')?.textContent).toBe('Forest edge search'),
    )
    await waitFor(() => expect(document.querySelector('[role="dialog"]')).toBeNull())
    expect(document.body.textContent).toContain('Name saved')
  })

  it('rolls back the header and settings name when a rename is rejected', async () => {
    const runtime = createTestRuntime()
    let rejectRename: ((reason?: unknown) => void) | undefined
    runtime.renameActiveHousehold = () =>
      new Promise<void>((_, reject) => {
        rejectRename = reject
      })
    mount(runtime)
    await waitFor(() => expect(findButton('Start a search')).toBeTruthy())
    findButton('Start a search')?.click()
    await waitFor(() => expect(findButton('Our search settings')).toBeTruthy())
    findButton('Our search settings')?.click()
    await waitFor(() => {
      expect(
        document.querySelector<HTMLInputElement>('input[aria-label="Search name"]'),
      ).toBeTruthy()
    })
    const nameInput = document.querySelector<HTMLInputElement>('input[aria-label="Search name"]')
    if (!nameInput) throw new Error('Search name input is missing')
    nameInput.value = 'Rejected search'
    nameInput.dispatchEvent(new InputEvent('input', { bubbles: true }))
    findButton('Save')?.click()

    await waitFor(() => expect(findButton('Save')?.disabled).toBe(true))
    rejectRename?.(new Error('Storage is unavailable'))

    await waitFor(() => {
      expect(document.querySelector('h1')?.textContent).toBe('Our home search')
      expect(nameInput.value).toBe('Our home search')
      expect(document.querySelector('[role="alert"]')?.textContent).toContain(
        'Storage is unavailable',
      )
    })
  })

  it('shares the invitation locally with full-access warnings', async () => {
    mount(createTestRuntime())
    await waitFor(() => expect(findButton('Start a search')).toBeTruthy())
    findButton('Start a search')?.click()
    await waitFor(() => expect(findButton('Our search settings')).toBeTruthy())
    findButton('Our search settings')?.click()

    await waitFor(() =>
      expect(
        document.querySelector<HTMLInputElement>('input[aria-label="Invitation link"]')?.value,
      ).toContain('#household='),
    )
    expect(document.body.textContent).toContain('Anyone with it can edit')
    expect(document.body.textContent).toContain("can't be taken back")
    await waitFor(() =>
      expect(document.querySelector('img[alt="Invitation QR code"]')).toBeTruthy(),
    )
  })

  it('lists and switches the searches kept on this device', async () => {
    mount(createTestRuntime())
    await waitFor(() => expect(findButton('Start a search')).toBeTruthy())
    findButton('Start a search')?.click()
    await waitFor(() => expect(findButton('Our search settings')).toBeTruthy())
    findButton('Our search settings')?.click()

    await waitFor(() => expect(document.body.textContent).toContain('Lake search'))
    expect(document.body.textContent).toContain('Our home search')
    findButton('Switch')?.click()

    await waitFor(() => expect(document.querySelector('h1')?.textContent).toBe('Lake search'))
  })

  it('requires confirmation before removing a search from this device', async () => {
    const runtime = createTestRuntime()
    const remove = vi.spyOn(runtime, 'removeHousehold')
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(false)
    mount(runtime)
    await waitFor(() => expect(findButton('Start a search')).toBeTruthy())
    findButton('Start a search')?.click()
    await waitFor(() => expect(findButton('Our search settings')).toBeTruthy())
    findButton('Our search settings')?.click()
    await waitFor(() => expect(findButton('Remove this search from this device')).toBeTruthy())
    findButton('Remove this search from this device')?.click()

    expect(confirm).toHaveBeenCalledWith(expect.stringContaining('other devices'))
    expect(remove).not.toHaveBeenCalled()

    confirm.mockReturnValue(true)
    findButton('Remove this search from this device')?.click()
    await waitFor(() => expect(remove).toHaveBeenCalledOnce())
    await waitFor(() => expect(findButton('Start a search')).toBeTruthy())
  })

  it('joins a search from a pasted invitation link', async () => {
    const runtime = createTestRuntime()
    const join = vi.spyOn(runtime, 'joinHousehold')
    mount(runtime)
    await waitFor(() => expect(findButton('Join')).toBeTruthy())
    const linkInput = document.querySelector<HTMLInputElement>(
      'input[aria-label="Invitation link"]',
    )
    if (!linkInput) throw new Error('Invitation link input is missing')
    linkInput.value = 'not a link'
    linkInput.dispatchEvent(new InputEvent('input', { bubbles: true }))
    await new Promise((resolve) => setTimeout(resolve))
    findButton('Join')?.click()
    await waitFor(() =>
      expect(document.querySelector('[role="alert"]')?.textContent).toContain('invitation link'),
    )
    expect(join).not.toHaveBeenCalled()

    linkInput.value = 'https://example.test/find-me-home/#household=abc123XYZ_-'
    linkInput.dispatchEvent(new InputEvent('input', { bubbles: true }))
    await new Promise((resolve) => setTimeout(resolve))
    findButton('Join')?.click()
    await waitFor(() => expect(join).toHaveBeenCalledWith('abc123XYZ_-'))
  })
})
