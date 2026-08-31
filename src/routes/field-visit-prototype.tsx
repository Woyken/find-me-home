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
  area: string
  price: string
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
  { key: 'B', name: 'Plot tabs, next stop' },
  { key: 'C', name: 'Expandable notebooks' },
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
        area: '15 a',
        price: 'EUR 42,000',
        ratings: { access: 0, area: 0, view: 0 },
      },
      {
        id: 12,
        name: 'Rear 12 a plot',
        area: '12 a',
        price: 'EUR 36,000',
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
        area: '10.6 a',
        price: 'EUR 38,500',
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
        area: '11 a',
        price: 'EUR 55,000',
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
  const [saveState, setSaveState] = createSignal('All ratings saved')
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

  const complete = (id: number) => {
    setListings((current) => current.filter((listing) => listing.id !== id))
    setActiveId(undefined)
  }

  return { listings, activeId, setActiveId, saveState, move, rate, complete }
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
            onComplete={() => visit.complete(listing().id)}
          />
        )}
      </Show>
    </div>
  )
}

function VariantB() {
  const visit = createVisitState()
  const [plotIndex, setPlotIndex] = createSignal(0)
  const current = () => visit.listings()[0]

  return (
    <div class="mx-auto min-h-screen max-w-md bg-[#17231c] pb-28 text-white shadow-xl">
      <Show
        when={current()}
        fallback={<EmptyPlan message="Visit Plan complete for today." dark />}
      >
        {(listing) => (
          <>
            <header class="px-5 pb-4 pt-5">
              <div class="flex items-center justify-between text-xs font-bold uppercase tracking-[0.14em] text-[#9eb2a5]">
                <span>Stop 1 of {visit.listings().length}</span>
                <button
                  class="rounded-full border border-white/20 px-3 py-2 text-white"
                  onClick={() => visit.move(listing().id, 1)}
                >
                  Send later
                </button>
              </div>
              <h1 class="mt-7 font-serif text-4xl font-bold leading-none">
                {listing().place}
              </h1>
              <p class="mt-3 text-[#c7d2ca]">{listing().address}</p>
              <div class="mt-5 grid grid-cols-2 gap-3">
                <a
                  class="rounded-xl bg-[#f3d778] px-4 py-3 text-center text-sm font-bold text-[#17231c]"
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
            <section class="mt-3 rounded-t-[2rem] bg-[#f8f5ec] px-5 pb-10 pt-6 text-[#17251c]">
              <div class="flex gap-2 overflow-x-auto pb-2">
                <For each={listing().plots}>
                  {(plot, index) => (
                    <button
                      class={`whitespace-nowrap rounded-full px-4 py-2 text-sm font-bold ${plotIndex() === index() ? 'bg-[#315d45] text-white' : 'bg-[#e5e8df]'}`}
                      onClick={() => setPlotIndex(index())}
                    >
                      Plot {index() + 1}: {plot.area}
                    </button>
                  )}
                </For>
              </div>
              <PlotNotebook
                plot={listing().plots[plotIndex()] ?? listing().plots[0]}
                saveState={visit.saveState()}
                onRate={visit.rate}
              />
              <button
                class="mt-7 w-full rounded-2xl bg-[#b9422f] px-5 py-4 font-bold text-white"
                onClick={() => {
                  setPlotIndex(0)
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
  const [selectedId, setSelectedId] = createSignal(initialListings[0].id)
  const selected = () =>
    visit.listings().find((listing) => listing.id === selectedId()) ??
    visit.listings()[0]

  return (
    <div class="min-h-screen pb-28 lg:grid lg:grid-cols-[22rem_1fr]">
      <aside class="border-b border-[#d6d9d1] bg-[#213329] p-4 text-white lg:min-h-screen lg:border-b-0 lg:border-r">
        <header class="mb-4 px-1 py-2">
          <p class="text-xs font-bold uppercase tracking-[0.2em] text-[#a9bcaf]">
            Find Me Home
          </p>
          <h1 class="mt-1 font-serif text-3xl font-bold">Visit Plan</h1>
        </header>
        <div class="flex gap-2 overflow-x-auto lg:flex-col lg:overflow-visible">
          <For each={visit.listings()}>
            {(listing, index) => (
              <button
                class={`min-w-64 rounded-xl p-4 text-left lg:min-w-0 ${selected()?.id === listing.id ? 'bg-[#f3d778] text-[#17251c]' : 'bg-white/8'}`}
                onClick={() => setSelectedId(listing.id)}
              >
                <div class="flex items-center justify-between">
                  <b>
                    {index() + 1}. {listing.place}
                  </b>
                  <span class="text-xs">{listing.travel}</span>
                </div>
                <p class="mt-1 truncate text-xs opacity-70">
                  {listing.address}
                </p>
                <div class="mt-3 flex gap-2">
                  <span
                    class="rounded border border-current px-2 py-1 text-xs"
                    onClick={(event) => {
                      event.stopPropagation()
                      visit.move(listing.id, -1)
                    }}
                  >
                    Earlier
                  </span>
                  <span
                    class="rounded border border-current px-2 py-1 text-xs"
                    onClick={(event) => {
                      event.stopPropagation()
                      visit.move(listing.id, 1)
                    }}
                  >
                    Later
                  </span>
                </div>
              </button>
            )}
          </For>
        </div>
      </aside>
      <section class="mx-auto w-full max-w-3xl p-5 pb-12 sm:p-10">
        <Show
          when={selected()}
          fallback={<EmptyPlan message="Nothing remains in the Visit Plan." />}
        >
          {(listing) => (
            <>
              <header class="flex flex-wrap items-start justify-between gap-4">
                <div>
                  <p class="text-xs font-bold uppercase tracking-[0.16em] text-[#647168]">
                    At the destination
                  </p>
                  <h2 class="mt-2 font-serif text-4xl font-bold">
                    {listing().place}
                  </h2>
                  <p class="mt-2 text-[#647168]">{listing().address}</p>
                </div>
                <div class="flex gap-2">
                  <a
                    class="rounded-xl border-2 border-[#315d45] px-4 py-3 text-sm font-bold text-[#315d45]"
                    href="https://www.aruodas.lt"
                    target="_blank"
                  >
                    Original ad
                  </a>
                  <a
                    class="rounded-xl bg-[#315d45] px-4 py-3 text-sm font-bold text-white"
                    href={directionsHref}
                    target="_blank"
                  >
                    Directions
                  </a>
                </div>
              </header>
              <div class="mt-7 space-y-4">
                <For each={listing().plots}>
                  {(plot, index) => (
                    <details
                      class="rounded-2xl border border-[#d6d9d1] bg-white p-5 shadow-sm"
                      open={index() === 0}
                    >
                      <summary class="cursor-pointer list-none font-bold">
                        <span class="flex items-center justify-between gap-3">
                          <span>{plot.name}</span>
                          <span class="text-sm text-[#647168]">
                            {plot.price}
                          </span>
                        </span>
                      </summary>
                      <div class="mt-5 border-t border-[#e5e7e0] pt-5">
                        <RatingRows plot={plot} onRate={visit.rate} />
                      </div>
                    </details>
                  )}
                </For>
              </div>
              <div class="mt-5 flex items-center justify-between text-xs text-[#647168]">
                <span>{visit.saveState()}</span>
                <span>Ratings belong to each Candidate Plot</span>
              </div>
              <button
                class="mt-8 w-full rounded-xl bg-[#315d45] px-5 py-4 font-bold text-white"
                onClick={() => visit.complete(listing().id)}
              >
                Finish this Visit
              </button>
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
          <h2 class="text-xl font-bold">{props.plot.name}</h2>
          <p class="mt-1 text-sm text-[#68756d]">{props.plot.area}</p>
        </div>
        <b class="text-sm">{props.plot.price}</b>
      </div>
      <div class="mt-5 border-t border-[#e5e7e0] pt-5">
        <RatingRows plot={props.plot} onRate={props.onRate} />
      </div>
      <p class="mt-5 text-right text-xs font-medium text-[#68756d]">
        {props.saveState}
      </p>
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
