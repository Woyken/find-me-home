import { Link, createFileRoute, useRouter } from '@tanstack/solid-router'
import { For, Show, createMemo, createSignal } from 'solid-js'
import { CandidatePlotMap } from '../components/CandidatePlotMap'
import {
  addCandidatePlot,
  deleteSavedSourceListing,
  fetchSourceListing,
  saveCandidatePlotFacts,
  saveCandidatePlotHouseholdNotes,
  saveCandidatePlotLocation,
  updateVisitPlan,
} from '../server-functions/source-listings'
import type { SourceListingDetail } from '../server/source-listings'
import { formatDate } from './index'

export const Route = createFileRoute('/source-listings/$sourceListingId')({
  loader: ({ params }) =>
    fetchSourceListing({ data: { id: Number(params.sourceListingId) } }),
  component: SourceListingPage,
})

function SourceListingPage() {
  const listing = Route.useLoaderData()
  const router = useRouter()
  const [busy, setBusy] = createSignal(false)
  const [deleteError, setDeleteError] = createSignal('')
  const [selectedPlotId, setSelectedPlotId] = createSignal<number | null>(null)
  const [plotSearch, setPlotSearch] = createSignal('')
  const [plotError, setPlotError] = createSignal('')
  const plots = () => listing()?.candidatePlots ?? []
  const selectedIndex = createMemo(() => {
    const selectedId = selectedPlotId()
    const index = plots().findIndex((plot) => plot.id === selectedId)
    return index < 0 ? 0 : index
  })
  const selectedPlot = createMemo(() => plots()[selectedIndex()])
  const filteredPlots = createMemo(() => {
    const query = plotSearch().trim().toLocaleLowerCase()
    if (!query) return plots()
    return plots().filter((plot, index) =>
      plotSearchText(plot, index).toLocaleLowerCase().includes(query),
    )
  })
  const selectPlot = (plotId: number) => {
    setSelectedPlotId(plotId)
    setPlotSearch('')
  }
  const addPlot = async () => {
    const current = listing()
    if (!current) return
    setBusy(true)
    setPlotError('')
    try {
      const result = await addCandidatePlot({
        data: { sourceListingId: current.id },
      })
      setSelectedPlotId(result.plotId)
      setPlotSearch('')
      await router.invalidate({ sync: true })
    } catch (caught) {
      setPlotError(caught instanceof Error ? caught.message : String(caught))
    } finally {
      setBusy(false)
    }
  }
  const toggle = async () => {
    const current = listing()
    if (!current) return
    setBusy(true)
    try {
      await updateVisitPlan({
        data: { id: current.id, included: current.visitPlanPosition === null },
      })
      await router.invalidate({ sync: true })
    } finally {
      setBusy(false)
    }
  }
  const remove = async () => {
    const current = listing()
    if (!current) return
    const confirmed = window.confirm(
      `Delete "${current.title ?? 'Untitled Source Listing'}" and all of its Candidate Plots? This cannot be undone.`,
    )
    if (!confirmed) return
    setBusy(true)
    setDeleteError('')
    try {
      await deleteSavedSourceListing({ data: { id: current.id } })
      await router.navigate({ to: '/' })
    } catch (caught) {
      setDeleteError(caught instanceof Error ? caught.message : String(caught))
      setBusy(false)
    }
  }
  return (
    <main class="min-h-screen bg-[#f6f4ec] px-5 py-8 text-[#17231d] sm:px-10">
      <Show when={listing()} fallback={<p>Source Listing not found.</p>}>
        {(item) => (
          <div class="mx-auto max-w-5xl">
            <Link class="text-sm font-bold text-[#315f73] underline" to="/">
              ← Saved Source Listings
            </Link>
            <header class="mt-8 border-b border-[#17231d]/20 pb-8">
              <div class="flex flex-col justify-between gap-6 sm:flex-row sm:items-end">
                <div>
                  <p class="font-mono text-[11px] font-bold uppercase tracking-[0.18em] text-[#315f73]">
                    Aruodas · {item().sourceId}
                  </p>
                  <h1 class="mt-3 max-w-3xl font-serif text-4xl leading-tight sm:text-6xl">
                    {item().title ?? 'Untitled Source Listing'}
                  </h1>
                  <p class="mt-4 text-lg text-[#607067]">
                    {item().address ?? 'Location not recorded'}
                  </p>
                </div>
                <button
                  class="border border-[#24483a] px-5 py-3 font-bold text-[#24483a] hover:bg-[#24483a] hover:text-white disabled:opacity-50"
                  disabled={busy()}
                  onClick={toggle}
                >
                  {item().visitPlanPosition === null
                    ? 'Add to Visit Plan'
                    : 'Remove from plan'}
                </button>
              </div>
            </header>
            <div class="mt-8 grid gap-8 lg:grid-cols-[1fr_18rem]">
              <section>
                <div class="flex flex-wrap items-center justify-between gap-3">
                  <h2 class="font-serif text-3xl">Candidate Plots</h2>
                  <button
                    class="bg-[#d96a45] px-4 py-3 text-sm font-bold text-white disabled:opacity-50"
                    disabled={busy()}
                    onClick={addPlot}
                  >
                    {busy() ? 'Adding…' : '+ Add Candidate Plot'}
                  </button>
                </div>
                <Show when={plotError()}>
                  <p class="mt-3 text-sm font-bold text-[#a13d22]">
                    {plotError()}
                  </p>
                </Show>
                <div class="mt-5 border border-[#17231d]/20 bg-[#e7edf0] p-4 sm:p-5">
                  <label class="block font-mono text-[10px] font-bold uppercase tracking-[0.14em] text-[#52616a]">
                    Find a Candidate Plot
                    <input
                      type="search"
                      autocomplete="off"
                      class="mt-2 w-full border border-[#17231d]/25 bg-white px-3 py-3 font-sans text-sm font-normal normal-case tracking-normal outline-none focus:border-[#315f73]"
                      value={plotSearch()}
                      placeholder="Search address, parcel number, or plot"
                      onInput={(event) =>
                        setPlotSearch(event.currentTarget.value)
                      }
                    />
                  </label>
                  <label class="mt-3 block font-mono text-[10px] font-bold uppercase tracking-[0.14em] text-[#52616a]">
                    Selected Candidate Plot
                    <select
                      class="mt-2 w-full border border-[#17231d]/25 bg-white px-3 py-3 font-sans text-sm font-bold normal-case tracking-normal outline-none focus:border-[#315f73]"
                      value={
                        filteredPlots().some(
                          (plot) => plot.id === selectedPlot().id,
                        )
                          ? selectedPlot().id
                          : ''
                      }
                      onChange={(event) =>
                        selectPlot(Number(event.currentTarget.value))
                      }
                    >
                      <Show
                        when={
                          plotSearch().trim() &&
                          !filteredPlots().some(
                            (plot) => plot.id === selectedPlot().id,
                          )
                        }
                      >
                        <option value="" disabled>
                          Choose a matching Candidate Plot
                        </option>
                      </Show>
                      <For each={filteredPlots()}>
                        {(plot) => (
                          <option value={plot.id}>
                            {plotSelectorLabel(plot, plots().indexOf(plot))}
                          </option>
                        )}
                      </For>
                    </select>
                  </label>
                  <Show when={filteredPlots().length === 0}>
                    <p class="mt-2 text-xs text-[#607067]">
                      No Candidate Plots match this search. Clear it to see all
                      plots.
                    </p>
                  </Show>
                  <div class="mt-3 grid grid-cols-[1fr_auto_1fr] items-center gap-2">
                    <button
                      class="border border-[#24483a] px-3 py-2 text-sm font-bold text-[#24483a] disabled:opacity-35"
                      disabled={selectedIndex() === 0}
                      onClick={() =>
                        selectPlot(plots()[selectedIndex() - 1].id)
                      }
                    >
                      ← Previous
                    </button>
                    <span class="font-mono text-[10px] text-[#607067]">
                      {selectedIndex() + 1} / {plots().length}
                    </span>
                    <button
                      class="border border-[#24483a] px-3 py-2 text-sm font-bold text-[#24483a] disabled:opacity-35"
                      disabled={selectedIndex() >= plots().length - 1}
                      onClick={() =>
                        selectPlot(plots()[selectedIndex() + 1].id)
                      }
                    >
                      Next →
                    </button>
                  </div>
                </div>
                <div class="mt-4">
                  <Show when={selectedPlot()} keyed>
                    {(plot) => (
                      <CandidatePlotCard
                        plot={plot}
                        number={selectedIndex() + 1}
                        sourceListingId={item().id}
                      />
                    )}
                  </Show>
                </div>
              </section>
              <aside class="space-y-5">
                <Show when={item().photoUrl}>
                  {(photo) => (
                    <img
                      class="aspect-[4/3] w-full object-cover"
                      src={photo()}
                      alt=""
                    />
                  )}
                </Show>
                <div class="bg-[#e7edf0] p-5">
                  <Detail
                    label="Candidate Plots"
                    value={String(item().candidatePlotCount)}
                  />
                  <div class="mt-4">
                    <Detail
                      label="Last visited"
                      value={formatDate(item().visitedAt)}
                    />
                  </div>
                  <a
                    class="mt-5 inline-block text-sm font-bold text-[#315f73] underline"
                    href={item().url}
                    target="_blank"
                    rel="noreferrer"
                  >
                    Open original advert
                  </a>
                </div>
                <div class="border border-[#a13d22]/30 bg-[#fff1eb] p-5">
                  <p class="font-mono text-[10px] font-bold uppercase tracking-[0.14em] text-[#a13d22]">
                    Permanent action
                  </p>
                  <p class="mt-2 text-sm text-[#6f3525]">
                    Deletes this Source Listing and all of its Candidate Plots.
                  </p>
                  <Show when={deleteError()}>
                    <p class="mt-3 text-sm font-bold text-[#a13d22]">
                      {deleteError()}
                    </p>
                  </Show>
                  <button
                    class="mt-4 w-full border border-[#a13d22] px-4 py-3 text-sm font-bold text-[#a13d22] hover:bg-[#a13d22] hover:text-white disabled:opacity-50"
                    disabled={busy()}
                    onClick={remove}
                  >
                    Delete Source Listing
                  </button>
                </div>
              </aside>
            </div>
          </div>
        )}
      </Show>
    </main>
  )
}

type CandidatePlot = SourceListingDetail['candidatePlots'][number]
type LocationClueKind = 'registry' | 'coordinates' | 'address'

function plotSelectorLabel(plot: CandidatePlot, index: number) {
  const displayLocation =
    plot.resolvedAddress ??
    plot.addressClue ??
    plot.resolvedParcelNumber ??
    plot.resolvedCadastralNumber ??
    plot.parcelNumberClue ??
    (plot.resolvedLatitude !== null && plot.resolvedLongitude !== null
      ? `${plot.resolvedLatitude}, ${plot.resolvedLongitude}`
      : plot.latitudeClue !== null && plot.longitudeClue !== null
        ? `${plot.latitudeClue}, ${plot.longitudeClue}`
        : null)
  return `${index + 1}. ${displayLocation ?? 'Unpositioned Candidate Plot'}`
}

function plotSearchText(plot: CandidatePlot, index: number) {
  return [
    plotSelectorLabel(plot, index),
    plot.name,
    plot.addressClue,
    plot.resolvedAddress,
    plot.parcelNumberClue,
    plot.resolvedParcelNumber,
    plot.resolvedCadastralNumber,
  ]
    .filter(Boolean)
    .join(' ')
}

function CandidatePlotCard(props: {
  plot: CandidatePlot
  number: number
  sourceListingId: number
}) {
  const router = useRouter()
  const initialClueKind: LocationClueKind = props.plot.parcelNumberClue
    ? 'registry'
    : props.plot.latitudeClue !== null || props.plot.longitudeClue !== null
      ? 'coordinates'
      : 'address'
  const [clueKind, setClueKind] = createSignal(initialClueKind)
  const [parcel, setParcel] = createSignal(props.plot.parcelNumberClue ?? '')
  const [latitude, setLatitude] = createSignal(
    props.plot.latitudeClue?.toString() ?? '',
  )
  const [longitude, setLongitude] = createSignal(
    props.plot.longitudeClue?.toString() ?? '',
  )
  const [address, setAddress] = createSignal(props.plot.addressClue ?? '')
  const [price, setPrice] = createSignal(props.plot.priceEur?.toString() ?? '')
  const [area, setArea] = createSignal(props.plot.areaAres?.toString() ?? '')
  const [purpose, setPurpose] = createSignal(props.plot.purposeText ?? '')
  const [notes, setNotes] = createSignal(props.plot.notes ?? '')
  const [roadAccessRating, setRoadAccessRating] = createSignal(
    props.plot.roadAccessRating?.toString() ?? '',
  )
  const [areaFeelingRating, setAreaFeelingRating] = createSignal(
    props.plot.areaFeelingRating?.toString() ?? '',
  )
  const [viewRating, setViewRating] = createSignal(
    props.plot.viewRating?.toString() ?? '',
  )
  const [busy, setBusy] = createSignal(false)
  const [error, setError] = createSignal('')
  const [saved, setSaved] = createSignal(false)

  const save = async () => {
    setBusy(true)
    setError('')
    setSaved(false)
    try {
      const latitudeClue =
        clueKind() === 'coordinates'
          ? parseOptionalCoordinate(latitude(), 'Latitude')
          : null
      const longitudeClue =
        clueKind() === 'coordinates'
          ? parseOptionalCoordinate(longitude(), 'Longitude')
          : null
      await saveCandidatePlotLocation({
        data: {
          sourceListingId: props.sourceListingId,
          plotId: props.plot.id,
          parcelNumberClue:
            clueKind() === 'registry' ? optionalText(parcel()) : null,
          latitudeClue: clueKind() === 'coordinates' ? latitudeClue : null,
          longitudeClue: clueKind() === 'coordinates' ? longitudeClue : null,
          addressClue:
            clueKind() === 'address' ? optionalText(address()) : null,
        },
      })
      setSaved(true)
      await router.invalidate({ sync: true })
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught))
    } finally {
      setBusy(false)
    }
  }

  const saveFacts = () =>
    saveSection(async () => {
      await saveCandidatePlotFacts({
        data: {
          sourceListingId: props.sourceListingId,
          plotId: props.plot.id,
          priceEur: parseOptionalNumber(price(), 'Price'),
          areaAres: parseOptionalNumber(area(), 'Area'),
          purposeText: optionalText(purpose()),
        },
      })
    })

  const saveHouseholdNotes = () =>
    saveSection(async () => {
      await saveCandidatePlotHouseholdNotes({
        data: {
          sourceListingId: props.sourceListingId,
          plotId: props.plot.id,
          notes: optionalText(notes()),
          roadAccessRating: parseOptionalRating(
            roadAccessRating(),
            'Road/access',
          ),
          areaFeelingRating: parseOptionalRating(
            areaFeelingRating(),
            'Area feeling',
          ),
          viewRating: parseOptionalRating(viewRating(), 'View'),
        },
      })
    })

  async function saveSection(action: () => Promise<void>) {
    setBusy(true)
    setError('')
    setSaved(false)
    try {
      await action()
      setSaved(true)
      await router.invalidate({ sync: true })
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught))
    } finally {
      setBusy(false)
    }
  }

  return (
    <article class="border-l-4 border-[#d96a45] bg-white p-5 sm:p-6">
      <p class="font-mono text-[10px] font-bold uppercase tracking-[0.18em] text-[#607067]">
        Candidate Plot {props.number}
      </p>
      <h3 class="mt-2 font-serif text-2xl">
        {props.plot.name ?? 'Candidate Plot'}
      </h3>
      <section class="mt-5 grid gap-4 sm:grid-cols-3">
        <LocationField
          label="Price (€)"
          value={price()}
          onInput={setPrice}
          inputMode="decimal"
        />
        <LocationField
          label="Area (a)"
          value={area()}
          onInput={setArea}
          inputMode="decimal"
        />
        <LocationField label="Purpose" value={purpose()} onInput={setPurpose} />
        <button
          class="bg-[#24483a] px-5 py-3 text-sm font-bold text-white disabled:opacity-50 sm:col-span-3 sm:justify-self-start"
          disabled={busy()}
          onClick={saveFacts}
        >
          {busy() ? 'Saving…' : 'Save Candidate Plot facts'}
        </button>
      </section>

      <section class="mt-6 border-t border-[#17231d]/10 pt-5">
        <div class="flex flex-col gap-1 sm:flex-row sm:items-baseline sm:justify-between">
          <h4 class="font-serif text-xl">Automatic Checks</h4>
          <span class="font-mono text-[9px] uppercase tracking-[0.14em] text-[#748078]">
            Refresh to reveal completed checks
          </span>
        </div>
        <div class="mt-4 grid gap-px bg-[#17231d]/10 sm:grid-cols-2">
          <For each={props.plot.automaticChecks}>
            {(check) => <AutomaticCheckCard check={check} />}
          </For>
        </div>
      </section>

      <section class="mt-6 border-t border-[#17231d]/10 pt-5">
        <div class="flex items-baseline justify-between gap-4">
          <h4 class="font-serif text-xl">Recorded Location Clue</h4>
          <span class="font-mono text-[9px] uppercase tracking-[0.14em] text-[#748078]">
            Choose one
          </span>
        </div>
        <div class="mt-4 grid grid-cols-3 border border-[#17231d]/20">
          <ClueTypeButton
            kind="registry"
            current={clueKind()}
            onSelect={setClueKind}
          >
            Registry number
          </ClueTypeButton>
          <ClueTypeButton
            kind="coordinates"
            current={clueKind()}
            onSelect={setClueKind}
          >
            Coordinates
          </ClueTypeButton>
          <ClueTypeButton
            kind="address"
            current={clueKind()}
            onSelect={setClueKind}
          >
            Address
          </ClueTypeButton>
        </div>
        <div class="mt-4">
          <Show when={clueKind() === 'registry'}>
            <LocationField
              label="Unique registry number"
              value={parcel()}
              onInput={setParcel}
              placeholder="4400-1234-5678"
            />
          </Show>
          <Show when={clueKind() === 'coordinates'}>
            <div class="grid gap-4 sm:grid-cols-2">
              <LocationField
                label="Latitude"
                value={latitude()}
                onInput={setLatitude}
                inputMode="decimal"
              />
              <LocationField
                label="Longitude"
                value={longitude()}
                onInput={setLongitude}
                inputMode="decimal"
              />
            </div>
          </Show>
          <Show when={clueKind() === 'address'}>
            <LocationField
              label="Address"
              value={address()}
              onInput={setAddress}
              placeholder="Street and plot or house number"
            />
          </Show>
        </div>
        <Show when={error()}>
          <p class="mt-3 text-sm font-bold text-[#a13d22]">{error()}</p>
        </Show>
        <div class="mt-4 flex items-center gap-3">
          <button
            class="bg-[#24483a] px-5 py-3 text-sm font-bold text-white disabled:opacity-50"
            disabled={busy()}
            onClick={save}
          >
            {busy() ? 'Saving…' : 'Save location clue'}
          </button>
          <Show when={saved()}>
            <span class="text-sm text-[#526058]">Saved</span>
          </Show>
        </div>
      </section>

      <section class="mt-6 border-t border-[#17231d]/10 pt-5">
        <h4 class="font-serif text-xl">Effective Location</h4>
        <Show
          when={
            props.plot.locationResolutionState === 'resolved' &&
            props.plot.resolvedLatitude !== null &&
            props.plot.resolvedLongitude !== null &&
            props.plot.resolvedPrecision !== null
          }
          fallback={
            props.plot.locationResolutionState === 'running' ? (
              <LocationSkeleton />
            ) : (
              <div class="mt-3 border border-dashed border-[#17231d]/20 bg-[#f6f4ec] p-5 text-sm text-[#607067]">
                No location could be resolved yet.
              </div>
            )
          }
        >
          <div class="mt-3">
            <div class="mb-3 flex justify-end">
              <span class="bg-[#e7edf0] px-2 py-1 font-mono text-[9px] font-bold uppercase tracking-[0.14em] text-[#315f73]">
                {props.plot.resolvedPrecision} ·{' '}
                {formatLocationSource(props.plot.effectiveLocationSource)}
              </span>
            </div>
            <div class="mb-4 grid gap-3 bg-[#f6f4ec] p-4 sm:grid-cols-2">
              <ReadOnlyLocation
                label="Coordinates"
                value={`${props.plot.resolvedLatitude}, ${props.plot.resolvedLongitude}`}
              />
              <ReadOnlyLocation
                label="Resolved address"
                value={props.plot.resolvedAddress ?? 'Unavailable'}
              />
              <ReadOnlyLocation
                label="Unique registry number"
                value={props.plot.resolvedParcelNumber ?? 'Unavailable'}
              />
              <ReadOnlyLocation
                label="Cadastral number"
                value={props.plot.resolvedCadastralNumber ?? 'Unavailable'}
              />
            </div>
            <CandidatePlotMap
              lat={props.plot.resolvedLatitude!}
              lng={props.plot.resolvedLongitude!}
              boundary={props.plot.resolvedBoundary}
              precision={props.plot.resolvedPrecision!}
            />
          </div>
        </Show>
      </section>

      <section class="mt-6 border-t border-[#17231d]/10 pt-5">
        <h4 class="font-serif text-xl">Household Notes</h4>
        <label class="mt-4 block text-sm font-bold">
          Notes
          <textarea
            name="candidate-plot-notes"
            class="mt-2 min-h-24 w-full border border-[#17231d]/25 bg-transparent px-3 py-3 font-normal outline-none focus:border-[#315f73]"
            value={notes()}
            onInput={(event) => setNotes(event.currentTarget.value)}
          />
        </label>
        <div class="mt-4 grid gap-4 sm:grid-cols-3">
          <RatingField
            label="Road/access"
            value={roadAccessRating()}
            onInput={setRoadAccessRating}
          />
          <RatingField
            label="Area feeling"
            value={areaFeelingRating()}
            onInput={setAreaFeelingRating}
          />
          <RatingField
            label="View"
            value={viewRating()}
            onInput={setViewRating}
          />
        </div>
        <Show when={error()}>
          <p class="mt-3 text-sm font-bold text-[#a13d22]">{error()}</p>
        </Show>
        <div class="mt-4 flex items-center gap-3">
          <button
            class="bg-[#24483a] px-5 py-3 text-sm font-bold text-white disabled:opacity-50"
            disabled={busy()}
            onClick={saveHouseholdNotes}
          >
            {busy() ? 'Saving…' : 'Save notes and ratings'}
          </button>
          <Show when={saved()}>
            <span class="text-sm text-[#526058]">Saved</span>
          </Show>
        </div>
      </section>
    </article>
  )
}

function LocationField(props: {
  label: string
  value: string
  onInput: (value: string) => void
  inputMode?: 'decimal' | 'numeric'
  placeholder?: string
}) {
  return (
    <label class="text-sm font-bold">
      {props.label}
      <input
        name={props.label.toLowerCase().replace(/\s+/g, '-')}
        autocomplete="off"
        class="mt-2 w-full border border-[#17231d]/25 bg-transparent px-3 py-3 font-normal outline-none focus:border-[#315f73]"
        value={props.value}
        inputmode={props.inputMode}
        placeholder={props.placeholder}
        onInput={(event) => props.onInput(event.currentTarget.value)}
      />
    </label>
  )
}

function RatingField(props: {
  label: string
  value: string
  onInput: (value: string) => void
}) {
  return (
    <label class="text-sm font-bold">
      {props.label}
      <select
        name={props.label.toLowerCase().replace(/[^a-z]+/g, '-')}
        class="mt-2 w-full border border-[#17231d]/25 bg-white px-3 py-3 font-normal outline-none focus:border-[#315f73]"
        value={props.value}
        onChange={(event) => props.onInput(event.currentTarget.value)}
      >
        <option value="">Not rated</option>
        <For each={[1, 2, 3, 4, 5]}>
          {(rating) => <option value={rating}>{rating} / 5</option>}
        </For>
      </select>
    </label>
  )
}

function AutomaticCheckCard(props: {
  check: CandidatePlot['automaticChecks'][number]
}) {
  const labels = {
    price: 'Price',
    area: 'Area',
    radius: 'Radius',
    purpose: 'Purpose',
    eso_cost: 'ESO cost',
    legal_flags: 'Legal flags',
    water_sewage: 'Water / sewage',
  } as const
  const colors = {
    pass: 'bg-[#e4efe7] text-[#24483a]',
    warning: 'bg-[#f6e9ce] text-[#765516]',
    fail: 'bg-[#f7dfd7] text-[#a13d22]',
    unknown: 'bg-[#e7edf0] text-[#52616a]',
  } as const
  return (
    <div class="min-h-24 bg-[#f6f4ec] p-4">
      <div class="flex items-start justify-between gap-3">
        <p class="font-mono text-[10px] font-bold uppercase tracking-[0.12em] text-[#607067]">
          {labels[props.check.key]}
        </p>
        <Show when={props.check.state === 'completed' && props.check.status}>
          {(status) => (
            <span
              class={`px-2 py-1 font-mono text-[9px] font-bold uppercase tracking-[0.12em] ${colors[status()]}`}
            >
              {status()}
            </span>
          )}
        </Show>
      </div>
      <Show
        when={props.check.state === 'completed'}
        fallback={
          props.check.state === 'running' ? (
            <div
              class="mt-3 animate-pulse"
              aria-label="Running automatic check"
            >
              <div class="h-4 w-2/3 bg-[#ddd9cd]" />
              <div class="mt-2 h-3 w-full bg-[#e5e1d6]" />
            </div>
          ) : (
            <div
              class="mt-3 h-9 border border-dashed border-[#17231d]/15"
              aria-label="Automatic check unavailable"
            />
          )
        }
      >
        <p class="mt-3 text-sm font-bold">{props.check.value}</p>
        <Show when={props.check.detail}>
          <p class="mt-1 text-xs leading-relaxed text-[#607067]">
            {props.check.detail}
          </p>
        </Show>
      </Show>
    </div>
  )
}

function ClueTypeButton(props: {
  kind: LocationClueKind
  current: LocationClueKind
  onSelect: (kind: LocationClueKind) => void
  children: string
}) {
  return (
    <button
      class={`min-w-0 px-2 py-3 text-xs font-bold sm:text-sm ${
        props.current === props.kind ? 'bg-[#24483a] text-white' : ''
      }`}
      onClick={() => props.onSelect(props.kind)}
    >
      {props.children}
    </button>
  )
}

function ReadOnlyLocation(props: { label: string; value: string }) {
  return (
    <div>
      <p class="font-mono text-[9px] uppercase tracking-[0.12em] text-[#748078]">
        {props.label}
      </p>
      <p class="mt-1 break-words text-sm font-bold">{props.value}</p>
    </div>
  )
}

function LocationSkeleton() {
  return (
    <div class="mt-3 animate-pulse" aria-label="Resolving location">
      <div class="h-4 w-2/3 bg-[#e1ded3]" />
      <div class="mt-3 h-64 bg-[#e1ded3]" />
    </div>
  )
}

function formatLocationSource(
  source: CandidatePlot['effectiveLocationSource'],
) {
  if (source === 'parcel_number') return 'parcel number'
  return source ?? 'location clue'
}

const optionalText = (value: string) => value.trim() || null
const parseOptionalCoordinate = (value: string, label: string) => {
  if (!value.trim()) return null
  const parsed = Number(value.replace(',', '.'))
  if (!Number.isFinite(parsed)) throw new Error(`${label} must be a number.`)
  return parsed
}
const parseOptionalNumber = (value: string, label: string) => {
  if (!value.trim()) return null
  const parsed = Number(value.replace(',', '.'))
  if (!Number.isFinite(parsed) || parsed < 0) {
    throw new Error(`${label} must be a positive number.`)
  }
  return parsed
}
const parseOptionalRating = (value: string, label: string) => {
  if (!value) return null
  const parsed = Number(value)
  if (!Number.isSafeInteger(parsed) || parsed < 1 || parsed > 5) {
    throw new Error(`${label} must be rated from 1 to 5.`)
  }
  return parsed
}

function Detail(props: { label: string; value: string }) {
  return (
    <div>
      <p class="font-mono text-[10px] uppercase tracking-[0.12em] text-[#748078]">
        {props.label}
      </p>
      <p class="mt-1 font-bold">{props.value}</p>
    </div>
  )
}
