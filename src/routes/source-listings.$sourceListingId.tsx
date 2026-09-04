import { For, Show, createEffect, createMemo, createSignal } from 'solid-js'
import { useNavigate } from '@solidjs/router'
import { CandidatePlotsMap } from '../components/CandidatePlotsMap'
import { useHousehold } from '../households/context'
import { paths } from '../paths'
import type {
  CandidatePlotRecord,
  SourceListingRecord,
} from '../source-listings/model'
import { candidatePlotMapItem } from '../source-listings/map'
import { formatDate } from './index'
import {
  AUTOMATIC_CHECK_KEYS,
  automaticCheckRevision,
} from '../automatic-checks'
import type { AutomaticCheckKey } from '../automatic-checks'

export const preloadSourceListing = () => undefined

export default function SourceListingPage(props: {
  params: Record<string, string | undefined>
}) {
  const household = useHousehold()
  const navigate = useNavigate()
  const listing = createMemo(() =>
    household.getSourceListing(props.params.sourceListingId ?? ''),
  )
  const [selectedPlotId, setSelectedPlotId] = createSignal<string>()
  const [error, setError] = createSignal('')
  const [busy, setBusy] = createSignal(false)
  const positionedPlots = createMemo(() =>
    (listing()?.candidatePlots ?? []).flatMap((candidatePlot, index) => {
      const item = candidatePlotMapItem(
        candidatePlot,
        candidatePlot.name ?? `Candidate Plot ${index + 1}`,
      )
      return item ? [item] : []
    }),
  )
  const planned = createMemo(() => {
    const id = listing()?.id
    return id ? household.getVisitPlan().sourceListingIds.includes(id) : false
  })

  const addPlot = async () => {
    const current = listing()
    if (!current) return
    setBusy(true)
    setError('')
    try {
      setSelectedPlotId(await household.addCandidatePlot(current.id))
    } catch (caught) {
      setError(errorMessage(caught))
    } finally {
      setBusy(false)
    }
  }

  const togglePlan = async () => {
    const current = listing()
    if (!current) return
    setBusy(true)
    setError('')
    try {
      const ids = household.getVisitPlan().sourceListingIds
      await household.setVisitPlan(
        planned()
          ? ids.filter((id) => id !== current.id)
          : [...ids, current.id],
      )
    } catch (caught) {
      setError(errorMessage(caught))
    } finally {
      setBusy(false)
    }
  }

  const completeVisit = async () => {
    const current = listing()
    if (!current) return
    setBusy(true)
    setError('')
    try {
      await household.markSourceListingVisited(current.id)
      navigate(paths.visitPlan)
    } catch (caught) {
      setError(errorMessage(caught))
      setBusy(false)
    }
  }

  const remove = async () => {
    const current = listing()
    if (!current) return
    if (
      !window.confirm(
        `Remove "${current.title ?? 'Untitled Source Listing'}" and all its Candidate Plots from this Household and its Visit Plan? Importing the same marketplace advertisement later can restore it.`,
      )
    )
      return
    setBusy(true)
    setError('')
    try {
      await household.removeSourceListing(current.id)
      navigate(paths.home)
    } catch (caught) {
      setError(errorMessage(caught))
      setBusy(false)
    }
  }

  return (
    <main class="min-h-screen bg-[#f6f4ec] px-5 py-8 text-[#17231d] sm:px-10">
      <Show when={listing()} fallback={<p>Source Listing not found.</p>}>
        {(item) => (
          <div class="mx-auto max-w-5xl">
            <div class="flex flex-wrap gap-x-5 gap-y-2">
              <a
                class="text-sm font-bold text-[#315f73] underline"
                href={paths.visitPlan}
              >
                Visit Plan
              </a>
              <a
                class="text-sm font-bold text-[#315f73] underline"
                href={paths.home}
              >
                Saved Source Listings
              </a>
            </div>
            <header class="mt-8 border-b border-[#17231d]/20 pb-8 sm:flex sm:items-end sm:justify-between sm:gap-6">
              <div>
                <p class="font-mono text-xs font-bold uppercase text-[#315f73]">
                  Aruodas · {item().sourceId}
                </p>
                <h1 class="mt-3 font-serif text-4xl sm:text-6xl">
                  {item().title ?? 'Untitled Source Listing'}
                </h1>
                <p class="mt-4 text-lg text-[#607067]">
                  {item().address ?? 'Location not recorded'}
                </p>
              </div>
              <button
                class="mt-5 border border-[#24483a] px-5 py-3 font-bold text-[#24483a] sm:mt-0"
                disabled={busy()}
                onClick={() => void togglePlan()}
              >
                {planned() ? 'Remove from Visit Plan' : 'Add to Visit Plan'}
              </button>
            </header>
            <div class="mt-8 grid gap-8 lg:grid-cols-[1fr_18rem]">
              <section class="min-w-0">
                <div class="flex flex-wrap items-center justify-between gap-3">
                  <h2 class="font-serif text-3xl">Candidate Plots</h2>
                  <button
                    class="bg-[#d96a45] px-4 py-3 text-sm font-bold text-white disabled:opacity-50"
                    disabled={busy()}
                    onClick={() => void addPlot()}
                  >
                    + Add Candidate Plot
                  </button>
                </div>
                <Show when={positionedPlots().length > 0}>
                  <div class="mt-5">
                    <CandidatePlotsMap
                      plots={positionedPlots()}
                      selectedPlotId={selectedPlotId()}
                      onSelect={setSelectedPlotId}
                    />
                  </div>
                </Show>
                <Show when={error()}>
                  <p class="mt-4 font-bold text-[#a13d22]" role="alert">
                    {error()}
                  </p>
                </Show>
                <For each={item().candidatePlots}>
                  {(plot, index) => (
                    <CandidatePlotEditor
                      plot={plot}
                      sourceListing={item()}
                      importedAddress={item().address}
                      number={index() + 1}
                      selected={selectedPlotId() === plot.id}
                      onSave={(update) =>
                        household.updateCandidatePlot(
                          item().id,
                          plot.id,
                          update,
                        )
                      }
                    />
                  )}
                </For>
              </section>
              <aside class="space-y-5">
                <Show when={item().photos[0]}>
                  {(photo) => (
                    <img
                      class="aspect-[4/3] w-full object-cover"
                      src={photo()}
                      alt=""
                    />
                  )}
                </Show>
                <div class="bg-[#e7edf0] p-5">
                  <p>{item().description ?? 'No description imported.'}</p>
                  <p class="mt-4 text-sm">
                    <b>Last visited:</b> {formatDate(item().visitedAt)}
                  </p>
                  <a
                    class="mt-5 inline-block font-bold text-[#315f73] underline"
                    href={item().url}
                    target="_blank"
                    rel="noreferrer"
                  >
                    Open original advert
                  </a>
                </div>
                <div class="border border-[#24483a] bg-[#e4efe7] p-5">
                  <p class="font-mono text-[10px] font-bold uppercase tracking-[0.14em] text-[#24483a]">
                    Visit complete
                  </p>
                  <p class="mt-2 text-sm text-[#526058]">
                    Records the latest Visit and removes this Source Listing
                    from the Visit Plan. Candidate Plot observations stay saved.
                  </p>
                  <button
                    class="mt-4 w-full bg-[#24483a] px-4 py-3 text-sm font-bold text-white disabled:opacity-50"
                    disabled={busy()}
                    onClick={() => void completeVisit()}
                  >
                    Mark Source Listing visited
                  </button>
                </div>
                <div class="border border-[#a13d22]/30 bg-[#fff1eb] p-5">
                  <p class="font-mono text-[10px] font-bold uppercase tracking-[0.14em] text-[#a13d22]">
                    Remove from Household
                  </p>
                  <p class="mt-2 text-sm text-[#6f3525]">
                    Removes this Source Listing and its Candidate Plots from the
                    Household and Visit Plan. Re-importing the same
                    advertisement can restore it without losing Household
                    observations.
                  </p>
                  <button
                    class="mt-4 w-full border border-[#a13d22] px-4 py-3 text-sm font-bold text-[#a13d22] disabled:opacity-50"
                    disabled={busy()}
                    onClick={() => void remove()}
                  >
                    Remove Source Listing
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

function CandidatePlotEditor(props: {
  plot: CandidatePlotRecord
  sourceListing: SourceListingRecord
  importedAddress: string | null
  number: number
  selected: boolean
  onSave: (
    update: Parameters<
      ReturnType<typeof useHousehold>['updateCandidatePlot']
    >[2],
  ) => Promise<void>
}) {
  const household = useHousehold()
  const [name, setName] = createSignal(props.plot.name ?? '')
  const [price, setPrice] = createSignal(textNumber(props.plot.priceEur))
  const [area, setArea] = createSignal(textNumber(props.plot.areaAres))
  const [purpose, setPurpose] = createSignal(props.plot.purposeText ?? '')
  const [notes, setNotes] = createSignal(props.plot.notes ?? '')
  const [clueKind, setClueKind] = createSignal<
    'parcel' | 'coordinates' | 'address'
  >(
    props.plot.parcelNumberClue
      ? 'parcel'
      : props.plot.latitudeClue !== null
        ? 'coordinates'
        : 'address',
  )
  const [parcel, setParcel] = createSignal(props.plot.parcelNumberClue ?? '')
  const [latitude, setLatitude] = createSignal(
    textNumber(props.plot.latitudeClue),
  )
  const [longitude, setLongitude] = createSignal(
    textNumber(props.plot.longitudeClue),
  )
  const [address, setAddress] = createSignal(
    props.plot.addressClue ?? props.importedAddress ?? '',
  )
  const [precision, setPrecision] = createSignal<'exact' | 'approx'>(
    props.plot.coordinateCluePrecision ?? 'approx',
  )
  const [road, setRoad] = createSignal(textNumber(props.plot.roadAccessRating))
  const [feeling, setFeeling] = createSignal(
    textNumber(props.plot.areaFeelingRating),
  )
  const [view, setView] = createSignal(textNumber(props.plot.viewRating))
  const [status, setStatus] = createSignal('')
  const directionsDestination = () => {
    if (
      props.plot.resolvedLatitude !== null &&
      props.plot.resolvedLongitude !== null
    ) {
      return `${props.plot.resolvedLatitude},${props.plot.resolvedLongitude}`
    }
    if (props.plot.latitudeClue !== null && props.plot.longitudeClue !== null) {
      return `${props.plot.latitudeClue},${props.plot.longitudeClue}`
    }
    return props.plot.addressClue
  }
  const directionsUrl = () => {
    const destination = directionsDestination()
    return destination
      ? `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(destination)}`
      : null
  }
  const resolveLocation = () =>
    props.plot.locationResolutionState === 'resolved'
      ? undefined
      : household.resolveCandidatePlotLocation(
          props.plot.sourceListingId,
          props.plot.id,
        )
  const runAutomaticChecks = () =>
    household.runCandidatePlotAutomaticChecks(
      props.plot.sourceListingId,
      props.plot.id,
    )

  createEffect(
    () => {
      const revision = automaticCheckRevision({
        plot: props.plot,
        sourceListing: props.sourceListing,
      })
      return {
        key: `${props.plot.locationResolutionState}:${revision}:${props.plot.automaticChecksRevision ?? 'unchecked'}`,
        revision,
      }
    },
    ({ revision }) => {
      queueMicrotask(() => {
        void (async () => {
          if (props.plot.locationResolutionState === 'missing')
            await resolveLocation()
          if (
            !props.plot.automaticChecks ||
            props.plot.automaticChecks.length !== AUTOMATIC_CHECK_KEYS.length ||
            props.plot.automaticChecksRevision !== revision
          )
            await runAutomaticChecks()
        })().catch(() => undefined)
      })
    },
  )

  const save = async () => {
    setStatus('Saving...')
    try {
      await props.onSave({
        name: optionalText(name()),
        priceEur: optionalNumber(price()),
        areaAres: optionalNumber(area()),
        purposeText: optionalText(purpose()),
        notes: optionalText(notes()),
        parcelNumberClue: optionalText(parcel()),
        latitudeClue: optionalNumber(latitude()),
        longitudeClue: optionalNumber(longitude()),
        coordinateCluePrecision:
          latitude().trim() || longitude().trim() ? precision() : null,
        addressClue: optionalText(address()),
        roadAccessRating: optionalNumber(road()),
        areaFeelingRating: optionalNumber(feeling()),
        viewRating: optionalNumber(view()),
      })
      setStatus('Saved')
    } catch (caught) {
      setStatus(errorMessage(caught))
    }
  }

  return (
    <article
      class={`mt-5 border bg-white p-5 ${props.selected ? 'border-[#d96a45]' : 'border-[#17231d]/20'}`}
    >
      <p class="font-mono text-xs font-bold uppercase text-[#607067]">
        Candidate Plot {props.number}
      </p>
      <Show when={directionsUrl()}>
        {(url) => (
          <a
            class="mt-2 inline-block text-sm font-bold text-[#315f73] underline"
            href={url()}
            target="_blank"
            rel="noreferrer"
          >
            Open directions
          </a>
        )}
      </Show>
      <section class="mt-4 border border-[#315f73]/20 bg-[#e7edf0] p-4">
        <div class="flex flex-wrap items-center justify-between gap-3">
          <h3 class="font-serif text-xl">Resolved Location Data</h3>
          <Show when={props.plot.locationResolutionState !== 'resolved'}>
            <button
              class="border border-[#315f73] px-3 py-2 text-xs font-bold text-[#315f73] disabled:opacity-50"
              disabled={household.isCandidatePlotLocationRunning(props.plot.id)}
              onClick={() => void resolveLocation()}
            >
              {household.isCandidatePlotLocationRunning(props.plot.id)
                ? 'Resolving...'
                : 'Retry location'}
            </button>
          </Show>
        </div>
        <Show
          when={props.plot.locationResolutionState === 'resolved'}
          fallback={
            <p class="mt-2 text-sm">
              {props.plot.locationResolutionState === 'unavailable'
                ? 'Location service unavailable. Retry when online.'
                : props.plot.locationResolutionState === 'no-result'
                  ? 'No location found. Check the Recorded Location Clue and retry.'
                  : 'Waiting to resolve the Recorded Location Clue.'}
            </p>
          }
        >
          <dl class="mt-3 grid gap-2 text-sm sm:grid-cols-2">
            <div>
              <dt class="font-bold">Coordinates</dt>
              <dd>
                {props.plot.resolvedLatitude}, {props.plot.resolvedLongitude}
              </dd>
            </div>
            <div>
              <dt class="font-bold">Precision</dt>
              <dd>{props.plot.resolvedPrecision}</dd>
            </div>
            <div>
              <dt class="font-bold">Address</dt>
              <dd>{props.plot.resolvedAddress ?? 'Unavailable'}</dd>
            </div>
            <div>
              <dt class="font-bold">Unique parcel number</dt>
              <dd>{props.plot.resolvedParcelNumber ?? 'Not found'}</dd>
            </div>
            <div>
              <dt class="font-bold">Cadastral number</dt>
              <dd>{props.plot.resolvedCadastralNumber ?? 'Not found'}</dd>
            </div>
            <div>
              <dt class="font-bold">Parcel dataset</dt>
              <dd>{props.plot.parcelDatasetVersion ?? 'Not loaded'}</dd>
            </div>
          </dl>
        </Show>
      </section>
      <section class="mt-4 border border-[#24483a]/20 bg-[#e4efe7] p-4">
        <div class="flex flex-wrap items-center justify-between gap-3">
          <h3 class="font-serif text-xl">Automatic Checks</h3>
          <button
            class="border border-[#24483a] px-3 py-2 text-xs font-bold text-[#24483a] disabled:opacity-50"
            disabled={household.isCandidatePlotAutomaticChecksRunning(
              props.plot.id,
            )}
            onClick={() => void runAutomaticChecks()}
          >
            {household.isCandidatePlotAutomaticChecksRunning(props.plot.id)
              ? 'Checking...'
              : props.plot.automaticChecks
                ? 'Retry checks'
                : 'Run checks'}
          </button>
        </div>
        <div class="mt-3 grid gap-2">
          <For each={AUTOMATIC_CHECK_KEYS}>
            {(key) => {
              const check = () =>
                props.plot.automaticChecks?.find((result) => result.key === key)
              return (
                <div class="border border-[#24483a]/15 bg-white px-3 py-2 text-sm">
                  <div class="flex items-start justify-between gap-3">
                    <b>{automaticCheckLabel(key)}</b>
                    <span class="font-mono text-xs font-bold uppercase">
                      {check()?.status ?? 'unknown'}
                    </span>
                  </div>
                  <p class="mt-1">{check()?.value ?? 'Not checked'}</p>
                  <Show when={check()?.detail}>
                    <p class="mt-1 text-xs text-[#607067]">{check()!.detail}</p>
                  </Show>
                </div>
              )
            }}
          </For>
        </div>
        <p class="mt-3 text-xs text-[#526058]">
          Checks are independent advisory results, not an aggregate score.
        </p>
      </section>
      <div class="mt-4 grid gap-4 sm:grid-cols-2">
        <Field label="Name" value={name()} onInput={setName} />
        <Field label="Price (€)" value={price()} onInput={setPrice} />
        <Field label="Area (a)" value={area()} onInput={setArea} />
        <Field label="Purpose" value={purpose()} onInput={setPurpose} />
      </div>
      <label class="mt-4 block text-sm font-bold">
        Notes
        <textarea
          class="mt-2 min-h-24 w-full border border-[#17231d]/25 p-3 font-normal"
          value={notes()}
          onInput={(event) => setNotes(event.currentTarget.value)}
        />
      </label>
      <fieldset class="mt-5 border-t border-[#17231d]/10 pt-4">
        <legend class="font-serif text-xl">Recorded Location Clue</legend>
        <select
          class="mt-3 border border-[#17231d]/25 p-3"
          value={clueKind()}
          onChange={(event) =>
            setClueKind(
              event.currentTarget.value as typeof clueKind extends () => infer T
                ? T
                : never,
            )
          }
        >
          <option value="parcel">Unique parcel number</option>
          <option value="coordinates">Coordinates</option>
          <option value="address">Address</option>
        </select>
        <Show when={clueKind() === 'parcel'}>
          <div class="mt-3">
            <Field
              label="Unique parcel number"
              value={parcel()}
              onInput={setParcel}
            />
          </div>
        </Show>
        <Show when={clueKind() === 'coordinates'}>
          <div class="mt-3 grid gap-4 sm:grid-cols-3">
            <Field label="Latitude" value={latitude()} onInput={setLatitude} />
            <Field
              label="Longitude"
              value={longitude()}
              onInput={setLongitude}
            />
            <label class="text-sm font-bold">
              Precision
              <select
                class="mt-2 w-full border border-[#17231d]/25 p-3 font-normal"
                value={precision()}
                onChange={(event) =>
                  setPrecision(event.currentTarget.value as 'exact' | 'approx')
                }
              >
                <option value="exact">Exact</option>
                <option value="approx">Approximate</option>
              </select>
            </label>
          </div>
        </Show>
        <Show when={clueKind() === 'address'}>
          <div class="mt-3">
            <Field label="Address" value={address()} onInput={setAddress} />
          </div>
        </Show>
      </fieldset>
      <fieldset class="mt-5 border-t border-[#17231d]/10 pt-4">
        <legend class="font-serif text-xl">Manual Ratings</legend>
        <div class="mt-3 grid gap-4 sm:grid-cols-3">
          <Rating label="Road/access" value={road()} onInput={setRoad} />
          <Rating label="Area feeling" value={feeling()} onInput={setFeeling} />
          <Rating label="View" value={view()} onInput={setView} />
        </div>
      </fieldset>
      <div class="mt-5 flex items-center gap-3">
        <button
          class="bg-[#24483a] px-5 py-3 text-sm font-bold text-white"
          onClick={() => void save()}
        >
          Save Candidate Plot
        </button>
        <span role="status" class="text-sm">
          {status()}
        </span>
      </div>
    </article>
  )
}

const automaticCheckLabel = (key: AutomaticCheckKey) =>
  ({
    price: 'Price',
    area: 'Area',
    radius: 'Radius',
    purpose: 'Purpose',
    walk_to_stop: 'Walk to transit stop',
    commute: 'Transit to city centre',
    eso_cost: 'ESO cost',
    budget: 'Plot + ESO budget',
    crime: 'Crime density',
    legal_flags: 'Legal flags',
    noise: 'Noise',
    livability: 'Livability',
    water_sewage: 'Water / sewage',
  })[key]

function Field(props: {
  label: string
  value: string
  onInput: (value: string) => void
}) {
  return (
    <label class="text-sm font-bold">
      {props.label}
      <input
        class="mt-2 w-full border border-[#17231d]/25 p-3 font-normal"
        value={props.value}
        onInput={(event) => props.onInput(event.currentTarget.value)}
      />
    </label>
  )
}

function Rating(props: {
  label: string
  value: string
  onInput: (value: string) => void
}) {
  return (
    <label class="text-sm font-bold">
      {props.label}
      <select
        class="mt-2 w-full border border-[#17231d]/25 p-3 font-normal"
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

const optionalText = (value: string) => value.trim() || null
const optionalNumber = (value: string) => {
  if (!value.trim()) return null
  const parsed = Number(value.replace(',', '.'))
  if (!Number.isFinite(parsed)) throw new Error('Enter a valid number')
  return parsed
}
const textNumber = (value: number | null) => value?.toString() ?? ''
const errorMessage = (error: unknown) =>
  error instanceof Error ? error.message : String(error)
