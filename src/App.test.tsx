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
  [...document.querySelectorAll('button')].find(
    (button) => button.textContent.trim() === name,
  )

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
  const active = (
    name: string,
    householdId = 'household-id',
  ): HouseholdRuntimeState => ({
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
    switchHousehold: async (householdId) =>
      publish(active('Lake search', householdId)),
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
      expect(document.body.textContent).toContain(
        'Check what we found, then save',
      ),
    )
  })
  it('renders a directly loaded imported Source Listing', async () => {
    const runtime = createTestRuntime()
    const listing: SourceListingDetail = {
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
          roadAccessRating: null,
          areaFeelingRating: null,
          viewRating: null,
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

    await waitFor(() =>
      expect(document.body.textContent).toContain('Imported listing'),
    )
    await waitFor(() => {
      expect(runtime.resolveCandidatePlotLocation).toHaveBeenCalledTimes(1)
      expect(runtime.runCandidatePlotAutomaticChecks).toHaveBeenCalledTimes(1)
    })

    listing.candidatePlots[0].locationResolutionState = 'resolved'
    await runtime.renameActiveHousehold('Parcel retry')
    await waitFor(() => expect(findButton('Look up again')).toBeTruthy())
    findButton('Look up again')?.click()
    await waitFor(() =>
      expect(runtime.resolveCandidatePlotLocation).toHaveBeenCalledTimes(2),
    )

    const updateCandidatePlot = vi.spyOn(runtime, 'updateCandidatePlot')
    const clueKind = document.querySelector<HTMLSelectElement>(
      'select[name="clue-kind"]',
    )
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
        }),
      ),
    )
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
      expect(document.body.textContent).toContain(
        'Bringing over your Aruodas favourites',
      ),
    )
    expect(document.body.textContent).toContain('2 clippings are on their way')
    expect(document.body.textContent).not.toContain('All sorted')
    expect(runtime.captureImportInbox).toHaveBeenCalledTimes(1)

    settle?.(false)
    await waitFor(() =>
      expect(document.body.textContent).toContain(
        'Your favourites did not come through',
      ),
    )
    expect(document.body.textContent).toContain('Household is changing')
    expect(document.body.textContent).not.toContain('All sorted')
    expect(sessionStorage.getItem('find-me-home-import-draft')).toContain(
      '11-2',
    )

    findButton('Try again')?.click()
    await waitFor(() =>
      expect(runtime.captureImportInbox).toHaveBeenCalledTimes(2),
    )
    await waitFor(() =>
      expect(document.body.textContent).toContain(
        'Bringing over your Aruodas favourites',
      ),
    )
    expect(document.body.textContent).not.toContain('did not come through')

    settle?.(true)
    await waitFor(() =>
      expect(document.body.textContent).toContain('All sorted'),
    )
    expect(document.body.textContent).toContain(
      'Brought over from your Aruodas favourites just now',
    )
    expect(document.body.textContent).toContain('2already saved')
    expect(document.body.textContent).not.toContain('Household is changing')
    expect(sessionStorage.getItem('find-me-home-import-draft')).toBeNull()
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
    expect(document.body.textContent).not.toContain(
      'Check what we found, then save',
    )

    findButton('Start a search')?.click()

    await waitFor(() =>
      expect(document.body.textContent).toContain(
        'Check what we found, then save',
      ),
    )
    expect(document.body.textContent).toContain('Žemųjų Rusokų sklypas')
    expect(sessionStorage.getItem('find-me-home-import-draft')).toContain(
      'Žemųjų Rusokų sklypas',
    )
  })

  it('offers create or join before mounting Household content', async () => {
    mount(createTestRuntime())

    await waitFor(() => expect(findButton('Start a search')).toBeTruthy())
    expect(document.body.textContent).toContain("Join someone's search")
    expect(document.body.textContent).not.toContain('Existing product flows')

    findButton('Start a search')?.click()

    await waitFor(() =>
      expect(document.body.textContent).toContain('Our home search'),
    )
    expect(document.body.textContent).toContain('Existing product flows')
  })

  it('renames the active search through the runtime', async () => {
    const runtime = createTestRuntime()
    mount(runtime)
    await waitFor(() => expect(findButton('Start a search')).toBeTruthy())
    findButton('Start a search')?.click()
    await waitFor(() => expect(findButton('Our search settings')).toBeTruthy())
    findButton('Our search settings')?.click()
    await waitFor(() => {
      expect(
        document.querySelector('input[aria-label="Search name"]'),
      ).toBeTruthy()
    })
    const nameInput = document.querySelector<HTMLInputElement>(
      'input[aria-label="Search name"]',
    )
    if (!nameInput) throw new Error('Search name input is missing')
    nameInput.value = 'Forest edge search'
    nameInput.dispatchEvent(new InputEvent('input', { bubbles: true }))
    await waitFor(() => expect(findButton('Save')).toBeTruthy())
    findButton('Save')?.click()

    await waitFor(() =>
      expect(document.querySelector('h1')?.textContent).toBe(
        'Forest edge search',
      ),
    )
  })

  it('shares the invitation locally with full-access warnings', async () => {
    mount(createTestRuntime())
    await waitFor(() => expect(findButton('Start a search')).toBeTruthy())
    findButton('Start a search')?.click()
    await waitFor(() => expect(findButton('Our search settings')).toBeTruthy())
    findButton('Our search settings')?.click()

    await waitFor(() =>
      expect(
        document.querySelector<HTMLInputElement>(
          'input[aria-label="Invitation link"]',
        )?.value,
      ).toContain('#household='),
    )
    expect(document.body.textContent).toContain('Anyone with it can edit')
    expect(document.body.textContent).toContain("can't be taken back")
    await waitFor(() =>
      expect(
        document.querySelector('img[alt="Invitation QR code"]'),
      ).toBeTruthy(),
    )
  })

  it('lists and switches the searches kept on this device', async () => {
    mount(createTestRuntime())
    await waitFor(() => expect(findButton('Start a search')).toBeTruthy())
    findButton('Start a search')?.click()
    await waitFor(() => expect(findButton('Our search settings')).toBeTruthy())
    findButton('Our search settings')?.click()

    await waitFor(() =>
      expect(document.body.textContent).toContain('Lake search'),
    )
    expect(document.body.textContent).toContain('Our home search')
    findButton('Switch')?.click()

    await waitFor(() =>
      expect(document.querySelector('h1')?.textContent).toBe('Lake search'),
    )
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
    await waitFor(() =>
      expect(findButton('Remove this search from this device')).toBeTruthy(),
    )
    findButton('Remove this search from this device')?.click()

    expect(confirm).toHaveBeenCalledWith(
      expect.stringContaining('other devices'),
    )
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
      expect(document.querySelector('[role="alert"]')?.textContent).toContain(
        'invitation link',
      ),
    )
    expect(join).not.toHaveBeenCalled()

    linkInput.value = 'https://example.test/find-me-home/#household=abc123XYZ_-'
    linkInput.dispatchEvent(new InputEvent('input', { bubbles: true }))
    await new Promise((resolve) => setTimeout(resolve))
    findButton('Join')?.click()
    await waitFor(() => expect(join).toHaveBeenCalledWith('abc123XYZ_-'))
  })
})
