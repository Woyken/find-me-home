import { createFileRoute } from '@tanstack/solid-router'
import { For, Show, createSignal, onCleanup } from 'solid-js'

export const Route = createFileRoute('/field-visit-prototype')({
  component: FieldVisitPrototype,
})

type VariantKey = 'A' | 'B' | 'C'
type RatingKey = 'access' | 'area' | 'view'
type Plot = {
  id: number
  name: string
  addressLabel: string
  area: string
  price: string
  notes: string
  mapState: 'boundary' | 'location' | 'paper'
  ratings: Record<RatingKey, number>
}
type SourceListing = {
  id: number
  place: string
  address: string
  distance: string
  travel: string
  price: string
  plots: Array<Plot>
}

const variants: Array<{ key: VariantKey; name: string }> = [
  { key: 'A', name: 'Stacked plot cards' },
  { key: 'B', name: 'Colored boundary map' },
  { key: 'C', name: 'Hybrid field atlas' },
]

const directionsHref =
  'https://www.google.com/maps/dir/?api=1&destination=54.81241%2C25.40862'

const initialListings: Array<SourceListing> = [
  {
    id: 1,
    place: 'Kalikstiskes',
    address: 'Kalikstiskiu k., Vilniaus r.',
    distance: '24 km',
    travel: '31 min',
    price: 'EUR 42,000',
    plots: [
      {
        id: 11,
        name: '15 a roadside plot',
        addressLabel: '10',
        area: '15 a',
        price: 'EUR 42,000',
        notes: '',
        mapState: 'boundary',
        ratings: { access: 0, area: 0, view: 0 },
      },
      {
        id: 12,
        name: 'Rear 12 a plot',
        addressLabel: '11A',
        area: '12 a',
        price: 'EUR 36,000',
        notes: '',
        mapState: 'location',
        ratings: { access: 0, area: 0, view: 0 },
      },
      {
        id: 13,
        name: 'Proposed corner plot',
        addressLabel: '11B',
        area: '9 a',
        price: 'EUR 31,000',
        notes: '',
        mapState: 'paper',
        ratings: { access: 0, area: 0, view: 0 },
      },
    ],
  },
  {
    id: 2,
    place: 'Maisiagala',
    address: 'Vilniaus g. 18, Maisiagala',
    distance: '18 km',
    travel: '22 min',
    price: 'EUR 38,500',
    plots: [
      {
        id: 21,
        name: 'Household plot',
        addressLabel: '18',
        area: '10.6 a',
        price: 'EUR 38,500',
        notes: '',
        mapState: 'location',
        ratings: { access: 0, area: 0, view: 0 },
      },
    ],
  },
  {
    id: 3,
    place: 'Riese',
    address: 'Berzu g., Didzioji Riese',
    distance: '13 km',
    travel: '19 min',
    price: 'EUR 55,000',
    plots: [
      {
        id: 31,
        name: 'Corner plot',
        addressLabel: '7',
        area: '11 a',
        price: 'EUR 55,000',
        notes: '',
        mapState: 'boundary',
        ratings: { access: 0, area: 0, view: 0 },
      },
    ],
  },
]

function cloneListings() {
  return initialListings.map((listing) => ({
    ...listing,
    plots: listing.plots.map((plot) => ({
      ...plot,
      ratings: { ...plot.ratings },
    })),
  }))
}

function FieldVisitPrototype() {
  const initialVariant = () => {
    if (typeof window === 'undefined') return 'A'
    const value = new URLSearchParams(window.location.search).get('variant')
    return value === 'B' || value === 'C' ? value : 'A'
  }
  const [variant, setVariant] = createSignal<VariantKey>(initialVariant())

  const switchVariant = (direction: number) => {
    const index = variants.findIndex((item) => item.key === variant())
    const next =
      variants[(index + direction + variants.length) % variants.length]
    setVariant(next.key)
    const url = new URL(window.location.href)
    url.searchParams.set('variant', next.key)
    window.history.replaceState(null, '', url)
  }

  const onKeyDown = (event: KeyboardEvent) => {
    const target = event.target as HTMLElement
    if (target.matches('input, textarea, select, [contenteditable]')) return
    if (event.key === 'ArrowLeft') switchVariant(-1)
    if (event.key === 'ArrowRight') switchVariant(1)
  }

  if (typeof window !== 'undefined') {
    window.addEventListener('keydown', onKeyDown)
    onCleanup(() => window.removeEventListener('keydown', onKeyDown))
  }

  return (
    <main class="min-h-screen bg-[#f3f0e8] text-[#17251c]">
      <Show when={variant() === 'A'}>
        <VariantA />
      </Show>
      <Show when={variant() === 'B'}>
        <VariantB />
      </Show>
      <Show when={variant() === 'C'}>
        <VariantC />
      </Show>
      <PrototypeSwitcher
        current={variant()}
        onPrevious={() => switchVariant(-1)}
        onNext={() => switchVariant(1)}
      />
    </main>
  )
}

function createVisitState() {
  const [listings, setListings] = createSignal(cloneListings())
  const [activeId, setActiveId] = createSignal<number>()
  const [saveState, setSaveState] = createSignal('All changes saved')
  let saveTimer: ReturnType<typeof setTimeout> | undefined

  onCleanup(() => saveTimer && clearTimeout(saveTimer))

  const move = (id: number, direction: -1 | 1) => {
    setListings((current) => {
      const next = [...current]
      const index = next.findIndex((listing) => listing.id === id)
      const destination = index + direction
      if (index < 0 || destination < 0 || destination >= next.length)
        return next
      ;[next[index], next[destination]] = [next[destination], next[index]]
      return next
    })
  }

  const rate = (plotId: number, key: RatingKey, value: number) => {
    setListings((current) =>
      current.map((listing) => ({
        ...listing,
        plots: listing.plots.map((plot) =>
          plot.id === plotId
            ? { ...plot, ratings: { ...plot.ratings, [key]: value } }
            : plot,
        ),
      })),
    )
    setSaveState('Saving...')
    if (saveTimer) clearTimeout(saveTimer)
    saveTimer = setTimeout(() => setSaveState('Saved just now'), 500)
  }

  const updateNotes = (plotId: number, notes: string) => {
    setListings((current) =>
      current.map((listing) => ({
        ...listing,
        plots: listing.plots.map((plot) =>
          plot.id === plotId ? { ...plot, notes } : plot,
        ),
      })),
    )
    setSaveState('Saving...')
    if (saveTimer) clearTimeout(saveTimer)
    saveTimer = setTimeout(() => setSaveState('Saved just now'), 500)
  }

  const complete = (id: number) => {
    setListings((current) => current.filter((listing) => listing.id !== id))
    setActiveId(undefined)
  }

  return {
    listings,
    activeId,
    setActiveId,
    saveState,
    move,
    rate,
    updateNotes,
    complete,
  }
}

function VariantA() {
  const visit = createVisitState()
  const active = () =>
    visit.listings().find((listing) => listing.id === visit.activeId())

  return (
    <div class="mx-auto min-h-screen max-w-md bg-[#faf8f2] pb-28 shadow-xl">
      <Show
        when={active()}
        fallback={
          <>
            <header class="bg-[#183e2b] px-5 pb-7 pt-6 text-white">
              <p class="text-xs font-bold uppercase tracking-[0.2em] text-[#b9d1c2]">
                Saturday fieldwork
              </p>
              <div class="mt-2 flex items-end justify-between">
                <div>
                  <h1 class="font-serif text-4xl font-bold">Visit Plan</h1>
                  <p class="mt-1 text-sm text-[#d4e2d8]">
                    {visit.listings().length} stops, drag-free ordering
                  </p>
                </div>
                <span class="rounded-full bg-white/10 px-3 py-2 text-xs font-bold">
                  Vilnius
                </span>
              </div>
            </header>
            <section class="space-y-3 p-4">
              <For
                each={visit.listings()}
                fallback={
                  <EmptyPlan message="Every Source Listing has been visited." />
                }
              >
                {(listing, index) => (
                  <article class="grid grid-cols-[2.5rem_1fr] overflow-hidden rounded-2xl border border-[#d8ddd5] bg-white shadow-sm">
                    <div class="flex flex-col items-center justify-center gap-1 bg-[#edf0e9] py-3">
                      <button
                        aria-label={`Move ${listing.place} earlier`}
                        class="grid size-8 place-items-center rounded-full disabled:opacity-20"
                        disabled={index() === 0}
                        onClick={() => visit.move(listing.id, -1)}
                      >
                        ^
                      </button>
                      <b class="text-sm">{index() + 1}</b>
                      <button
                        aria-label={`Move ${listing.place} later`}
                        class="grid size-8 place-items-center rounded-full disabled:opacity-20"
                        disabled={index() === visit.listings().length - 1}
                        onClick={() => visit.move(listing.id, 1)}
                      >
                        v
                      </button>
                    </div>
                    <button
                      class="p-4 text-left"
                      onClick={() => visit.setActiveId(listing.id)}
                    >
                      <div class="flex items-start justify-between gap-3">
                        <div>
                          <h2 class="text-lg font-bold">{listing.place}</h2>
                          <p class="mt-1 text-sm text-[#627067]">
                            {listing.address}
                          </p>
                        </div>
                        <span class="whitespace-nowrap text-sm font-bold text-[#315d45]">
                          {listing.travel}
                        </span>
                      </div>
                      <div class="mt-4 flex items-center justify-between border-t border-[#edf0e9] pt-3 text-xs text-[#627067]">
                        <span>{listing.plots.length} Candidate Plot(s)</span>
                        <b class="text-[#315d45]">Open stop &gt;</b>
                      </div>
                    </button>
                  </article>
                )}
              </For>
            </section>
          </>
        }
      >
        {(listing) => (
          <ListingInspection
            listing={listing()}
            saveState={visit.saveState()}
            onBack={() => visit.setActiveId(undefined)}
            onRate={visit.rate}
            onNotes={visit.updateNotes}
            onComplete={() => visit.complete(listing().id)}
          />
        )}
      </Show>
    </div>
  )
}

function VariantB() {
  const visit = createVisitState()
  const [selectedPlotId, setSelectedPlotId] = createSignal<number>()
  const current = () => visit.listings()[0]
  const selectedPlot = () =>
    current()?.plots.find((plot) => plot.id === selectedPlotId())

  return (
    <div class="mx-auto min-h-screen max-w-md bg-[#e8ede6] pb-28 shadow-xl">
      <Show
        when={current()}
        fallback={<EmptyPlan message="Visit Plan complete for today." />}
      >
        {(listing) => (
          <>
            <header class="bg-[#183e2b] px-5 pb-5 pt-5 text-white">
              <div class="flex items-center justify-between text-xs font-bold uppercase tracking-[0.14em] text-[#b8cabd]">
                <span>Stop 1 of {visit.listings().length}</span>
                <button
                  class="rounded-full border border-white/20 px-3 py-2 text-white"
                  onClick={() => visit.move(listing().id, 1)}
                >
                  Send later
                </button>
              </div>
              <h1 class="mt-5 font-serif text-3xl font-bold leading-none">
                {listing().place}
              </h1>
              <p class="mt-2 text-sm text-[#c7d2ca]">{listing().address}</p>
              <div class="mt-4 grid grid-cols-2 gap-3">
                <a
                  class="rounded-xl bg-white px-4 py-3 text-center text-sm font-bold text-[#17231c]"
                  href="https://www.aruodas.lt"
                  target="_blank"
                >
                  Open original ad
                </a>
                <a
                  class="rounded-xl border border-white/25 px-4 py-3 text-center text-sm font-bold"
                  href={directionsHref}
                  target="_blank"
                >
                  Directions
                </a>
              </div>
            </header>
            <section class="p-4 text-[#17251c]">
              <BoundaryMap
                plots={listing().plots}
                selectedPlotId={selectedPlotId()}
                colorMode="distinct"
                onSelect={setSelectedPlotId}
              />
              <p class="mt-3 text-center text-sm text-[#53635a]">
                Tap a colored Candidate Plot boundary to rate it.
              </p>
              <Show
                when={selectedPlot()}
                fallback={
                  <div class="mt-4 rounded-2xl border border-dashed border-[#aeb9b0] bg-white/60 p-6 text-center text-sm text-[#53635a]">
                    No Candidate Plot selected
                  </div>
                }
              >
                {(plot) => (
                  <PlotNotebook
                    plot={plot()}
                    eyebrow="Selected from map"
                    saveState={visit.saveState()}
                    onRate={visit.rate}
                    onNotes={visit.updateNotes}
                  />
                )}
              </Show>
              <button
                class="mt-7 w-full rounded-2xl bg-[#b9422f] px-5 py-4 font-bold text-white"
                onClick={() => {
                  setSelectedPlotId(undefined)
                  visit.complete(listing().id)
                }}
              >
                Mark Source Listing visited
              </button>
              <p class="mt-3 text-center text-xs text-[#68756d]">
                Removes this stop and opens the next one.
              </p>
            </section>
          </>
        )}
      </Show>
    </div>
  )
}

function VariantC() {
  const visit = createVisitState()
  const [selectedPlotId, setSelectedPlotId] = createSignal<number>()
  const [locationStatus, setLocationStatus] = createSignal<
    'idle' | 'locating' | 'live' | 'unavailable'
  >('idle')
  const [currentLocation, setCurrentLocation] = createSignal<{
    latitude: number
    longitude: number
    accuracy: number
  }>()
  let locationWatchId: number | undefined
  let locationStartTimer: ReturnType<typeof setTimeout> | undefined
  const current = () => visit.listings()[0]
  const selectedPlot = () =>
    current()?.plots.find((plot) => plot.id === selectedPlotId())

  const startLocationWatch = () => {
    if (!navigator.geolocation) {
      setLocationStatus('unavailable')
      return
    }
    if (locationWatchId !== undefined)
      navigator.geolocation.clearWatch(locationWatchId)
    setLocationStatus('locating')
    locationWatchId = navigator.geolocation.watchPosition(
      (position) => {
        setCurrentLocation({
          latitude: position.coords.latitude,
          longitude: position.coords.longitude,
          accuracy: position.coords.accuracy,
        })
        setLocationStatus('live')
      },
      () => setLocationStatus('unavailable'),
      { enableHighAccuracy: true, maximumAge: 5000, timeout: 10000 },
    )
  }

  if (typeof window !== 'undefined')
    locationStartTimer = setTimeout(startLocationWatch, 0)
  onCleanup(() => {
    if (locationStartTimer) clearTimeout(locationStartTimer)
    if (locationWatchId !== undefined)
      navigator.geolocation.clearWatch(locationWatchId)
  })

  return (
    <div class="mx-auto min-h-screen max-w-md bg-[#faf8f2] pb-28 shadow-xl">
      <section>
        <Show
          when={current()}
          fallback={<EmptyPlan message="Nothing remains in the Visit Plan." />}
        >
          {(listing) => (
            <>
              <header class="px-5 pb-4 pt-5">
                <div class="flex items-center justify-between">
                  <div>
                    <p class="text-xs font-bold uppercase tracking-[0.16em] text-[#647168]">
                      Stop 1 of {visit.listings().length}
                    </p>
                    <h2 class="mt-1 font-serif text-3xl font-bold">
                      {listing().place}
                    </h2>
                  </div>
                  <button
                    class="rounded-full border border-[#b8c0b9] px-3 py-2 text-xs font-bold"
                    onClick={() => visit.move(listing().id, 1)}
                  >
                    Later
                  </button>
                </div>
                <p class="mt-2 text-sm text-[#647168]">{listing().address}</p>
                <div class="mt-4 flex gap-2">
                  <a
                    class="flex-1 rounded-xl border border-[#315d45] px-4 py-3 text-center text-sm font-bold text-[#315d45]"
                    href="https://www.aruodas.lt"
                    target="_blank"
                  >
                    Original ad
                  </a>
                  <a
                    class="flex-1 rounded-xl bg-[#315d45] px-4 py-3 text-center text-sm font-bold text-white"
                    href={directionsHref}
                    target="_blank"
                  >
                    Directions
                  </a>
                </div>
              </header>
              <div class="px-4">
                <FieldAtlas
                  plots={listing().plots}
                  selectedPlotId={selectedPlotId()}
                  currentLocation={currentLocation()}
                  locationStatus={locationStatus()}
                  onLocate={startLocationWatch}
                  onSelect={setSelectedPlotId}
                />
                <div class="mt-3 grid grid-cols-3 gap-2">
                  <For each={listing().plots}>
                    {(plot) => (
                      <button
                        class={`rounded-xl border p-3 text-left ${selectedPlotId() === plot.id ? 'border-[#315d45] bg-[#e4eee7]' : 'border-[#cbd1c8] bg-white'}`}
                        onClick={() => setSelectedPlotId(plot.id)}
                      >
                        <b class="block text-lg">{plot.addressLabel}</b>
                        <span class="mt-1 block text-[0.65rem] leading-tight text-[#647168]">
                          {mapStateLabel(plot.mapState)}
                        </span>
                      </button>
                    )}
                  </For>
                </div>
              </div>
              <div class="px-4">
                <Show
                  when={selectedPlot()}
                  fallback={
                    <p class="mt-6 text-center text-sm text-[#647168]">
                      Tap an address on the map or below it to open field notes.
                    </p>
                  }
                >
                  {(plot) => (
                    <PlotNotebook
                      plot={plot()}
                      eyebrow="Field notes"
                      saveState={visit.saveState()}
                      onRate={visit.rate}
                      onNotes={visit.updateNotes}
                      showPaperReference
                    />
                  )}
                </Show>
                <button
                  class="mt-7 w-full rounded-xl bg-[#315d45] px-5 py-4 font-bold text-white"
                  onClick={() => {
                    setSelectedPlotId(undefined)
                    visit.complete(listing().id)
                  }}
                >
                  Finish this Visit
                </button>
              </div>
            </>
          )}
        </Show>
      </section>
    </div>
  )
}

function ListingInspection(props: {
  listing: SourceListing
  saveState: string
  onBack: () => void
  onRate: (plotId: number, key: RatingKey, value: number) => void
  onNotes: (plotId: number, notes: string) => void
  onComplete: () => void
}) {
  return (
    <>
      <header class="bg-[#183e2b] px-5 pb-6 pt-5 text-white">
        <button class="text-sm font-bold text-[#c7d8cc]" onClick={props.onBack}>
          &lt; Visit Plan
        </button>
        <h1 class="mt-5 font-serif text-4xl font-bold">
          {props.listing.place}
        </h1>
        <p class="mt-2 text-sm text-[#c7d8cc]">{props.listing.address}</p>
        <div class="mt-5 grid grid-cols-2 gap-3">
          <a
            class="rounded-xl bg-white px-4 py-3 text-center text-sm font-bold text-[#183e2b]"
            href="https://www.aruodas.lt"
            target="_blank"
          >
            Open original ad
          </a>
          <a
            class="rounded-xl border border-white/30 px-4 py-3 text-center text-sm font-bold"
            href={directionsHref}
            target="_blank"
          >
            Get directions
          </a>
        </div>
      </header>
      <section class="p-5">
        <div class="flex items-end justify-between gap-4">
          <div>
            <p class="text-xs font-bold uppercase tracking-[0.15em] text-[#68756d]">
              Candidate Plots
            </p>
            <h2 class="mt-1 font-serif text-2xl font-bold">
              Rate what you can see
            </h2>
          </div>
          <span class="text-xs text-[#68756d]">{props.saveState}</span>
        </div>
        <div class="mt-4 space-y-4">
          <For each={props.listing.plots}>
            {(plot, index) => (
              <PlotNotebook
                plot={plot}
                eyebrow={`Candidate Plot ${index() + 1} of ${props.listing.plots.length}`}
                saveState={props.saveState}
                onRate={props.onRate}
                onNotes={props.onNotes}
              />
            )}
          </For>
        </div>
        <button
          class="mt-7 w-full rounded-xl bg-[#b9422f] px-5 py-4 font-bold text-white"
          onClick={props.onComplete}
        >
          Mark Source Listing visited
        </button>
      </section>
    </>
  )
}

function PlotNotebook(props: {
  plot: Plot
  eyebrow?: string
  saveState: string
  onRate: (plotId: number, key: RatingKey, value: number) => void
  onNotes: (plotId: number, notes: string) => void
  showPaperReference?: boolean
}) {
  return (
    <div class="rounded-2xl border border-[#d6d9d1] bg-white p-5 shadow-sm">
      <Show when={props.eyebrow}>
        <p class="mb-3 text-[0.65rem] font-bold uppercase tracking-[0.16em] text-[#68756d]">
          {props.eyebrow}
        </p>
      </Show>
      <div class="flex items-start justify-between gap-4">
        <div>
          <div class="flex items-center gap-2">
            <span class="rounded-md bg-[#183e2b] px-2 py-1 text-xs font-bold text-white">
              {props.plot.addressLabel}
            </span>
            <h2 class="text-xl font-bold">{props.plot.name}</h2>
          </div>
          <p class="mt-1 text-sm text-[#68756d]">{props.plot.area}</p>
        </div>
        <b class="text-sm">{props.plot.price}</b>
      </div>
      <div class="mt-5 border-t border-[#e5e7e0] pt-5">
        <RatingRows plot={props.plot} onRate={props.onRate} />
      </div>
      <Show when={props.showPaperReference && props.plot.mapState === 'paper'}>
        <details class="mt-5 rounded-xl border border-[#d8d3c2] bg-[#f7f1df] p-3">
          <summary class="cursor-pointer text-sm font-bold">
            View plan from original ad
          </summary>
          <div class="relative mt-3 h-40 overflow-hidden rounded-lg border border-[#c7bea5] bg-[#eee5cc] p-3 shadow-inner">
            <div class="absolute inset-3 rotate-[-2deg] border border-[#9d947d] bg-[#faf5e7] shadow-sm">
              <div class="absolute left-5 top-5 h-20 w-28 skew-x-[-8deg] border-2 border-[#6d685b]" />
              <div class="absolute bottom-5 right-5 font-serif text-xs italic text-[#6d685b]">
                Plot 11B, conceptual division
              </div>
            </div>
          </div>
          <p class="mt-2 text-xs text-[#726b59]">
            Reference image only. It is not positioned or traced onto the map.
          </p>
        </details>
      </Show>
      <label class="mt-5 block border-t border-[#e5e7e0] pt-5">
        <span class="text-sm font-bold">Notes</span>
        <span class="ml-2 text-xs text-[#748078]">optional</span>
        <textarea
          class="mt-2 min-h-24 w-full rounded-xl border border-[#cbd1c8] bg-[#fbfaf6] p-3 text-sm outline-none focus:border-[#315d45]"
          placeholder="Access, surroundings, questions to follow up..."
          value={props.plot.notes}
          onInput={(event) =>
            props.onNotes(props.plot.id, event.currentTarget.value)
          }
        />
      </label>
      <p class="mt-5 text-right text-xs font-medium text-[#68756d]">
        {props.saveState}
      </p>
    </div>
  )
}

function mapStateLabel(state: Plot['mapState']) {
  if (state === 'boundary') return 'Boundary available'
  if (state === 'location') return 'Location only'
  return 'Ad plan only'
}

function FieldAtlas(props: {
  plots: Array<Plot>
  selectedPlotId: number | undefined
  currentLocation:
    { latitude: number; longitude: number; accuracy: number } | undefined
  locationStatus: 'idle' | 'locating' | 'live' | 'unavailable'
  onLocate: () => void
  onSelect: (plotId: number) => void
}) {
  const positionedPlots = () =>
    props.plots.filter((plot) => plot.mapState !== 'paper')
  const markerX = () =>
    Math.max(
      28,
      Math.min(
        332,
        180 +
          ((props.currentLocation?.longitude ?? 25.40862) - 25.40862) * 40000,
      ),
    )
  const markerY = () =>
    Math.max(
      55,
      Math.min(
        275,
        165 -
          ((props.currentLocation?.latitude ?? 54.81241) - 54.81241) * 55000,
      ),
    )
  return (
    <div class="relative h-80 overflow-hidden rounded-2xl border border-[#bdc8bd] bg-[#dbe3d6] shadow-inner">
      <div class="absolute inset-0 opacity-70 [background-image:linear-gradient(30deg,transparent_47%,#f5f1df_48%,#f5f1df_52%,transparent_53%),linear-gradient(105deg,transparent_47%,#b7c8b4_48%,#b7c8b4_51%,transparent_52%)] [background-size:82px_67px,105px_91px]" />
      <div class="absolute left-4 top-4 rounded-lg bg-white/90 px-3 py-2 text-[0.65rem] font-bold uppercase tracking-[0.14em] text-[#53635a] shadow-sm">
        Field atlas
      </div>
      <button
        class="absolute right-4 top-4 z-10 rounded-lg border border-[#b7c4c9] bg-white/95 px-3 py-2 text-[0.65rem] font-bold text-[#245f78] shadow-sm"
        onClick={props.onLocate}
      >
        {props.locationStatus === 'locating'
          ? 'Locating...'
          : props.locationStatus === 'live'
            ? 'Center on me'
            : props.locationStatus === 'unavailable'
              ? 'Retry location'
              : 'Show my location'}
      </button>
      <svg
        class="absolute inset-0 size-full"
        viewBox="0 0 360 320"
        role="img"
        aria-label="Map with Candidate Plot boundaries and approximate locations"
      >
        <For each={positionedPlots()}>
          {(plot, index) => {
            const selected = () => props.selectedPlotId === plot.id
            const isBoundary = () => plot.mapState === 'boundary'
            const x = () => (index() === 0 ? 136 : 250)
            const y = () => (index() === 0 ? 150 : 170)
            return (
              <g
                class="cursor-pointer"
                role="button"
                tabindex="0"
                aria-label={`Open address ${plot.addressLabel}, ${mapStateLabel(plot.mapState)}`}
                onClick={() => props.onSelect(plot.id)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter' || event.key === ' ')
                    props.onSelect(plot.id)
                }}
              >
                <Show
                  when={isBoundary()}
                  fallback={
                    <>
                      <circle
                        cx={x()}
                        cy={y()}
                        r="48"
                        fill="#477b5b"
                        fill-opacity={selected() ? '0.3' : '0.16'}
                        stroke="#477b5b"
                        stroke-width={selected() ? '4' : '2'}
                        stroke-dasharray="8 7"
                      />
                      <circle cx={x()} cy={y()} r="5" fill="#315d45" />
                    </>
                  }
                >
                  <polygon
                    points="64,98 187,70 205,206 80,225"
                    fill="#477b5b"
                    fill-opacity={selected() ? '0.62' : '0.36'}
                    stroke={selected() ? '#17251c' : '#477b5b'}
                    stroke-width={selected() ? '5' : '3'}
                  />
                </Show>
                <rect
                  x={x() - 24}
                  y={y() - 17}
                  width="48"
                  height="34"
                  rx="8"
                  fill="white"
                  stroke="#315d45"
                  stroke-width="3"
                />
                <text
                  x={x()}
                  y={y() + 6}
                  text-anchor="middle"
                  font-size="15"
                  font-weight="800"
                  fill="#17251c"
                >
                  {plot.addressLabel}
                </text>
              </g>
            )
          }}
        </For>
        <Show when={props.locationStatus === 'live' && props.currentLocation}>
          <g aria-label="Your live location">
            <circle
              cx={markerX()}
              cy={markerY()}
              r={Math.max(
                22,
                Math.min(55, (props.currentLocation?.accuracy ?? 20) / 2),
              )}
              fill="#2684c7"
              fill-opacity="0.16"
              stroke="#2684c7"
              stroke-opacity="0.35"
              stroke-width="2"
            />
            <circle
              cx={markerX()}
              cy={markerY()}
              r="10"
              fill="#2684c7"
              stroke="white"
              stroke-width="4"
            />
          </g>
        </Show>
      </svg>
      <div class="absolute bottom-11 left-3 rounded-lg bg-white/95 px-2 py-1 text-[0.6rem] font-bold text-[#245f78] shadow-sm">
        <Show
          when={props.locationStatus === 'live'}
          fallback={
            props.locationStatus === 'unavailable'
              ? 'Location unavailable - map still works'
              : 'Waiting for your location'
          }
        >
          {props.currentLocation?.accuracy
            ? `Live position +/- ${Math.round(props.currentLocation.accuracy)} m`
            : 'Live position'}
        </Show>
      </div>
      <div class="absolute bottom-3 left-3 right-3 flex justify-between gap-2 text-[0.6rem] font-bold text-[#53635a]">
        <span class="rounded bg-white/90 px-2 py-1">Solid = boundary</span>
        <span class="rounded bg-white/90 px-2 py-1">Halo = location only</span>
        <span class="rounded bg-white/90 px-2 py-1">Missing = ad plan</span>
      </div>
    </div>
  )
}

function BoundaryMap(props: {
  plots: Array<Plot>
  selectedPlotId: number | undefined
  colorMode: 'distinct' | 'shared'
  onSelect: (plotId: number) => void
}) {
  const boundaryColors = ['#d35343', '#e0a128']
  return (
    <div class="relative h-80 overflow-hidden rounded-2xl border border-[#bdc8bd] bg-[#dbe3d6] shadow-inner">
      <div class="absolute inset-0 opacity-70 [background-image:linear-gradient(30deg,transparent_47%,#f5f1df_48%,#f5f1df_52%,transparent_53%),linear-gradient(105deg,transparent_47%,#b7c8b4_48%,#b7c8b4_51%,transparent_52%)] [background-size:82px_67px,105px_91px]" />
      <div class="absolute left-4 top-4 rounded-lg bg-white/90 px-3 py-2 text-[0.65rem] font-bold uppercase tracking-[0.14em] text-[#53635a] shadow-sm">
        Candidate Plot boundaries
      </div>
      <svg
        class="absolute inset-0 size-full"
        viewBox="0 0 360 320"
        role="img"
        aria-label="Map of Candidate Plot boundaries"
      >
        <For each={props.plots}>
          {(plot, index) => {
            const points = () =>
              index() === 0
                ? '64,98 187,70 205,206 80,225'
                : '187,70 302,92 290,218 205,206'
            const color = () =>
              props.colorMode === 'shared'
                ? '#477b5b'
                : boundaryColors[index() % boundaryColors.length]
            const selected = () => props.selectedPlotId === plot.id
            return (
              <g
                class="cursor-pointer"
                role="button"
                tabindex="0"
                aria-label={`Open ${plot.name}`}
                onClick={() => props.onSelect(plot.id)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter' || event.key === ' ')
                    props.onSelect(plot.id)
                }}
              >
                <polygon
                  points={points()}
                  fill={color()}
                  fill-opacity={selected() ? '0.68' : '0.42'}
                  stroke={selected() ? '#17251c' : color()}
                  stroke-width={selected() ? '5' : '3'}
                />
                <circle
                  cx={index() === 0 ? '136' : '249'}
                  cy="145"
                  r="18"
                  fill="white"
                  stroke={color()}
                  stroke-width="3"
                />
                <text
                  x={index() === 0 ? '136' : '249'}
                  y="151"
                  text-anchor="middle"
                  font-size="16"
                  font-weight="800"
                  fill="#17251c"
                >
                  {plot.addressLabel}
                </text>
              </g>
            )
          }}
        </For>
      </svg>
      <div class="absolute bottom-3 right-3 rounded bg-white/90 px-2 py-1 text-[0.6rem] font-medium text-[#647168]">
        Approximate boundaries
      </div>
    </div>
  )
}

function RatingRows(props: {
  plot: Plot
  onRate: (plotId: number, key: RatingKey, value: number) => void
}) {
  const rows: Array<{ key: RatingKey; label: string }> = [
    { key: 'access', label: 'Road / access' },
    { key: 'area', label: 'Area feeling' },
    { key: 'view', label: 'View' },
  ]
  return (
    <div class="space-y-5">
      <For each={rows}>
        {(row) => (
          <div>
            <div class="mb-2 flex items-center justify-between">
              <span class="text-sm font-bold">{row.label}</span>
              <span class="text-xs text-[#748078]">
                {props.plot.ratings[row.key] || 'Not rated'}
              </span>
            </div>
            <div class="grid grid-cols-5 gap-2">
              <For each={[1, 2, 3, 4, 5]}>
                {(value) => (
                  <button
                    aria-label={`${row.label}: ${value} stars`}
                    class={`h-11 rounded-lg border text-lg font-bold ${value <= props.plot.ratings[row.key] ? 'border-[#315d45] bg-[#315d45] text-white' : 'border-[#cbd1c8] bg-[#f8f7f2] text-[#7c877f]'}`}
                    onClick={() => props.onRate(props.plot.id, row.key, value)}
                  >
                    {value}
                  </button>
                )}
              </For>
            </div>
          </div>
        )}
      </For>
    </div>
  )
}

function EmptyPlan(props: { message: string; dark?: boolean }) {
  return (
    <div
      class={`grid min-h-[70vh] place-items-center p-8 text-center ${props.dark ? 'text-white' : ''}`}
    >
      <div>
        <div class="mx-auto grid size-16 place-items-center rounded-full border-2 border-current text-2xl">
          OK
        </div>
        <h2 class="mt-5 font-serif text-3xl font-bold">Plan cleared</h2>
        <p class="mt-2 opacity-70">{props.message}</p>
      </div>
    </div>
  )
}

function PrototypeSwitcher(props: {
  current: VariantKey
  onPrevious: () => void
  onNext: () => void
}) {
  const current = () => variants.find((item) => item.key === props.current)!
  return (
    <div class="fixed bottom-4 left-1/2 z-[1000] flex -translate-x-1/2 items-center gap-2 rounded-full bg-black p-2 text-white shadow-2xl">
      <button
        class="grid size-10 place-items-center rounded-full hover:bg-white/10"
        aria-label="Previous variant"
        onClick={props.onPrevious}
      >
        &lt;
      </button>
      <div class="min-w-44 text-center text-xs font-bold">
        {current().key} / {current().name}
      </div>
      <button
        class="grid size-10 place-items-center rounded-full hover:bg-white/10"
        aria-label="Next variant"
        onClick={props.onNext}
      >
        &gt;
      </button>
    </div>
  )
}
