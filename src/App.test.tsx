// @vitest-environment jsdom

import { render } from '@solidjs/web'
import { afterEach, describe, expect, it, vi } from 'vitest'
import App from './App'
import { HouseholdHeader } from './components/HouseholdHeader'
import type { HouseholdRuntime } from './households/runtime'
import type { HouseholdRuntimeState } from './households/model'
import { encodeImportFragment } from './imports/aruodas'
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
    saveReviewedImport: async () => {
      throw new Error('Not used')
    },
    addCandidatePlot: async () => {
      throw new Error('Not used')
    },
    updateCandidatePlot: async () => undefined,
    resolveCandidatePlotLocation: async () => undefined,
    isCandidatePlotLocationRunning: () => false,
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
          latitudeClue: null,
          longitudeClue: null,
          coordinateCluePrecision: null,
          addressClue: 'Vilniaus r.',
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
    history.replaceState(null, '', '/source-listings/listing-id')

    mountRouter(runtime)

    await waitFor(() =>
      expect(document.body.textContent).toContain('Imported listing'),
    )
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
    await waitFor(() => expect(findButton('Create Household')).toBeTruthy())
    expect(document.body.textContent).not.toContain('Review before saving')

    findButton('Create Household')?.click()

    await waitFor(() =>
      expect(document.body.textContent).toContain('Review before saving'),
    )
    expect(document.body.textContent).toContain('Žemųjų Rusokų sklypas')
    expect(sessionStorage.getItem('find-me-home-import-draft')).toContain(
      'Žemųjų Rusokų sklypas',
    )
  })

  it('offers create or join before mounting Household content', async () => {
    mount(createTestRuntime())

    await waitFor(() => expect(findButton('Create Household')).toBeTruthy())
    expect(document.body.textContent).toContain('Join Household')
    expect(document.body.textContent).not.toContain('Existing product flows')

    findButton('Create Household')?.click()

    await waitFor(() =>
      expect(document.body.textContent).toContain('Our home search'),
    )
    expect(document.body.textContent).toContain('Existing product flows')
  })

  it('renames the active Household through the runtime', async () => {
    const runtime = createTestRuntime()
    mount(runtime)
    await waitFor(() => expect(findButton('Create Household')).toBeTruthy())
    findButton('Create Household')?.click()
    await waitFor(() => expect(findButton('Rename Household')).toBeTruthy())
    findButton('Rename Household')?.click()
    await waitFor(() => {
      expect(
        document.querySelector('input[aria-label="Household name"]'),
      ).toBeTruthy()
    })
    const householdNameInput = document.querySelector<HTMLInputElement>(
      'input[aria-label="Household name"]',
    )
    if (!householdNameInput) throw new Error('Household name input is missing')
    householdNameInput.value = 'Forest edge search'
    householdNameInput.dispatchEvent(new InputEvent('input', { bubbles: true }))
    await waitFor(() => expect(findButton('Save name')).toBeTruthy())
    findButton('Save name')?.click()

    await waitFor(() =>
      expect(document.body.textContent).toContain('Forest edge search'),
    )
  })

  it('shares the invitation locally with full-access warnings', async () => {
    mount(createTestRuntime())
    await waitFor(() => expect(findButton('Create Household')).toBeTruthy())
    findButton('Create Household')?.click()
    await waitFor(() => expect(findButton('Share Household')).toBeTruthy())
    findButton('Share Household')?.click()

    await waitFor(() =>
      expect(
        document.querySelector<HTMLInputElement>(
          'input[aria-label="Household invitation link"]',
        )?.value,
      ).toContain('#household='),
    )
    expect(document.body.textContent).toContain('can edit the Household')
    expect(document.body.textContent).toContain('cannot be revoked')
    await waitFor(() =>
      expect(
        document.querySelector('img[alt="Household invitation QR code"]'),
      ).toBeTruthy(),
    )
  })

  it('lists and switches local Households from the Household menu', async () => {
    mount(createTestRuntime())
    await waitFor(() => expect(findButton('Create Household')).toBeTruthy())
    findButton('Create Household')?.click()
    await waitFor(() => expect(findButton('Households')).toBeTruthy())
    findButton('Households')?.click()

    expect(document.body.textContent).toContain('Our home search')
    await waitFor(() =>
      expect(document.body.textContent).toContain('Lake search'),
    )
    findButton('Lake search')?.click()

    await waitFor(() =>
      expect(document.querySelector('h1')?.textContent).toBe('Lake search'),
    )
  })

  it('requires confirmation before removing a Household from this device', async () => {
    const runtime = createTestRuntime()
    const remove = vi.spyOn(runtime, 'removeHousehold')
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(false)
    mount(runtime)
    await waitFor(() => expect(findButton('Create Household')).toBeTruthy())
    findButton('Create Household')?.click()
    await waitFor(() => expect(findButton('Households')).toBeTruthy())
    findButton('Households')?.click()
    await waitFor(() =>
      expect(findButton('Remove from this device')).toBeTruthy(),
    )
    findButton('Remove from this device')?.click()

    expect(confirm).toHaveBeenCalledWith(
      expect.stringContaining('other devices'),
    )
    expect(remove).not.toHaveBeenCalled()

    confirm.mockReturnValue(true)
    findButton('Remove from this device')?.click()
    await waitFor(() => expect(remove).toHaveBeenCalledOnce())
    await waitFor(() => expect(findButton('Create Household')).toBeTruthy())
  })
})
