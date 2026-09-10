import {
  For,
  Show,
  action,
  affects,
  createEffect,
  createMemo,
  createOptimistic,
  createSignal,
  isPending,
  untrack,
} from 'solid-js'
import { useNavigate } from '@solidjs/router'
import { CandidatePlotsMap } from '../components/CandidatePlotsMap'
import type { MapFocusRequest } from '../components/CandidatePlotsMap'
import { CheckStrip, CheckSummaryText } from '../components/CheckStrip'
import { FannedStack } from '../components/FannedStack'
import { GoSeeButton } from '../components/GoSeeButton'
import { DirectionsPicker } from '../components/DirectionsPicker'
import { CheckIcon } from '../components/icons'
import { MarkAreaDialog } from '../components/MarkAreaDialog'
import {
  candidatePlotDirectionsDestination,
  sourceListingDirectionsDestination,
  validCoordinate,
} from '../directions'
import { useHousehold } from '../households/context'
import { paths, routes } from '../paths'
import type {
  CandidatePlotRecord,
  LocationClueKind,
  SourceListingRecord,
  SourceListingDetail,
} from '../source-listings/model'
import { candidatePlotName, sourceListingMapItems } from '../source-listings/map'
import { candidatePlotSeedFacts } from '../source-listings/mark-area'
import { AUTOMATIC_CHECK_KEYS, automaticCheckRevision } from '../automatic-checks'
import { checkCells, checkStatusTagClass, checkStatusWord } from '../check-summary'
import { candidatePlotRegiaUrl, describeLks94 } from '../location-resolution'
import { formatAgo, formatDateLong, formatDateShort } from '../format'

export const preloadSourceListing = () => undefined

const utilityLabel = {
  electricity: 'electricity',
  water: 'water',
  sewage: 'sewage',
  gas: 'gas',
} as const

export default function SourceListingPage(props: { params: Record<string, string | undefined> }) {
  const household = useHousehold()
  const navigate = useNavigate()
  const listing = createMemo<SourceListingDetail | undefined>(() =>
    household.getSourceListing(props.params.sourceListingId ?? ''),
  )
  const [selectedPlotId, setSelectedPlotId] = createSignal<string>()
  const [focus, setFocus] = createSignal<MapFocusRequest>()
  let focusNonce = 0
  const [photoIndex, setPhotoIndex] = createSignal(0)
  const [error, setError] = createSignal('')
  const [marking, setMarking] = createSignal(false)
  const positionedPlots = createMemo(() => {
    const current = listing()
    return current ? sourceListingMapItems(current) : []
  })
  const title = () => {
    const current = listing()
    return current ? (current.title ?? `Aruodas advert ${current.sourceId}`) : ''
  }
  const utilities = () =>
    (Object.keys(utilityLabel) as Array<keyof typeof utilityLabel>).filter(
      (key) => listing()?.utilities?.[key] !== undefined,
    )

  const scrollTo = (id: string) =>
    requestAnimationFrame(() =>
      document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' }),
    )
  const selectFromMap = (plotId: string) => {
    setSelectedPlotId(plotId)
    scrollTo(`area-${plotId}`)
  }
  const showOnMap = (plotId: string) => {
    setSelectedPlotId(plotId)
    setFocus({ plotId, nonce: ++focusNonce })
    scrollTo('bigmap')
  }

  const markByHand = action(function* () {
    affects(listing)
    setError('')
    try {
      const current = listing()
      if (!current) return
      const id = yield household.addCandidatePlot(current.id, candidatePlotSeedFacts(current))
      setSelectedPlotId(id)
      scrollTo(`area-${id}`)
    } catch (caught) {
      setError(errorMessage(caught))
      throw caught
    }
  })
  const markFromRegia = action(function* (input: {
    latitude: number
    longitude: number
    parcelNumber: string | null
  }) {
    affects(listing)
    setError('')
    try {
      const current = listing()
      if (!current) return
      const id = yield household.addCandidatePlot(current.id, {
        ...candidatePlotSeedFacts(current),
        areaAres: null,
        purposeText: null,
        latitudeClue: input.latitude,
        longitudeClue: input.longitude,
        coordinateCluePrecision: 'exact',
        parcelNumberClue: input.parcelNumber,
        primaryLocationClue: input.parcelNumber ? 'parcel_number' : 'coordinates',
        addressClue: null,
      })
      setSelectedPlotId(id)
      scrollTo(`area-${id}`)
    } catch (caught) {
      setError(errorMessage(caught))
      throw caught
    }
  })
  const completeVisit = action(function* () {
    affects(listing)
    setError('')
    try {
      const current = listing()
      if (!current) return
      yield household.markSourceListingVisited(current.id)
      navigate(routes.visitPlan)
    } catch (caught) {
      setError(errorMessage(caught))
      throw caught
    }
  })
  const removeListing = action(function* (id: string) {
    affects(listing)
    setError('')
    try {
      yield household.removeSourceListing(id)
      navigate(routes.home)
    } catch (caught) {
      setError(errorMessage(caught))
      throw caught
    }
  })
  const busy = () => isPending(listing)
  const remove = () => {
    const current = listing()
    if (!current) return
    if (
      !window.confirm(
        `Remove "${title()}" and its marked areas from the search? Saving the same advert again can bring it back.`,
      )
    )
      return
    void removeListing(current.id).catch(() => undefined)
  }

  return (
    <main class="wrap">
      <a class="crumb" href={paths.home}>
        ‹ All plots
      </a>
      <Show
        when={listing() !== undefined}
        fallback={
          <div class="panel empty">
            <h2>This plot isn't here any more</h2>
            <p>It may have been removed on another device.</p>
            <a class="btn" href={paths.home}>
              Back to plots
            </a>
          </div>
        }
      >
        <>
          <header class="head">
            <div>
              <h1>{title()}</h1>
              <div class="place">{listing()!.address ?? 'Location not recorded yet'}</div>
              <div class="tags">
                <a class="tag blue" href={listing()!.url} target="_blank" rel="noreferrer">
                  Aruodas {listing()!.sourceId} ↗
                </a>
                <Show
                  when={listing()!.visitedAt !== null}
                  fallback={<span class="tag">not visited yet</span>}
                >
                  <span class="tag pass">visited {formatDateShort(listing()!.visitedAt)}</span>
                </Show>
                <span class="tag">changed {formatAgo(listing()!.updatedAt)}</span>
              </div>
            </div>
            <div>
              <DirectionsPicker
                destination={() => sourceListingDirectionsDestination(listing()!)}
              />
              <GoSeeButton sourceListingId={listing()!.id} />
            </div>
          </header>

          <div class="cols">
            <div>
              <Show
                when={positionedPlots().length > 0}
                fallback={
                  <div class="panel blue">
                    <b>Not on the map yet.</b>{' '}
                    <span class="muted">
                      Add a location hint to one of the marked areas below and we'll look it up.
                    </span>
                  </div>
                }
              >
                <div id="bigmap">
                  <CandidatePlotsMap
                    plots={positionedPlots()}
                    selectedPlotId={selectedPlotId()}
                    onSelect={selectFromMap}
                    focus={focus()}
                  />
                </div>
              </Show>

              <div class="section-h">
                <div>
                  <h2>Marked areas</h2>
                  <p class="small muted" style={{ margin: '2px 0 0' }}>
                    {listing()!.candidatePlots.length === 1
                      ? 'The whole plot as advertised. Mark another area if you would only buy part of it, or want to compare a split.'
                      : `${listing()!.candidatePlots.length} ways of buying this plot, compared side by side.`}
                  </p>
                </div>
                <button
                  class="btn stake ghost"
                  type="button"
                  disabled={busy()}
                  onClick={() => setMarking(true)}
                >
                  + Mark another area
                </button>
              </div>
              <MarkAreaDialog
                open={marking()}
                onClose={() => setMarking(false)}
                listing={listing}
                onMarkByHand={() => markByHand()}
                onMarkFromRegia={(input) => markFromRegia(input)}
                onShowExisting={showOnMap}
              />
              <Show when={error()}>
                <p class="alert" role="alert">
                  {error()}
                </p>
              </Show>
              <For each={listing()?.candidatePlots ?? []} keyed={(plot) => plot.id}>
                {(plot, index) => (
                  <CandidatePlotEditor
                    plot={plot}
                    sourceListing={listing}
                    importedAddress={() => listing()?.address ?? null}
                    number={() => index() + 1}
                    total={() => listing()?.candidatePlots.length ?? 0}
                    selected={() => selectedPlotId() === plot().id}
                    onShowOnMap={() => showOnMap(plot().id)}
                    onSave={(update) =>
                      household.updateCandidatePlot(listing()!.id, plot().id, update)
                    }
                    onRemove={() => household.removeCandidatePlot(listing()!.id, plot().id)}
                  />
                )}
              </For>
            </div>

            <aside>
              <Show
                when={listing()!.photos.length > 0}
                fallback={<div class="panel soft muted small">No photos came with the advert.</div>}
              >
                <div class="gallery">
                  <img
                    src={listing()!.photos[Math.min(photoIndex(), listing()!.photos.length - 1)]}
                    alt=""
                  />
                  <Show when={listing()!.photos.length > 1}>
                    <div class="thumbs">
                      <For each={listing()!.photos}>
                        {(photo, index) => (
                          <button
                            type="button"
                            aria-label={`Photo ${index() + 1}`}
                            aria-pressed={index() === photoIndex() ? 'true' : 'false'}
                            onClick={() => setPhotoIndex(index())}
                          >
                            <img src={photo} alt="" />
                          </button>
                        )}
                      </For>
                    </div>
                  </Show>
                </div>
              </Show>
              <div class="panel soft" style={{ 'margin-top': '14px' }}>
                <p class="aside-p first">
                  <Show
                    when={listing()!.description}
                    fallback={<span class="muted">No description came with the advert.</span>}
                  >
                    {listing()!.description}
                  </Show>
                </p>
                <Show when={utilities().length > 0}>
                  <div class="util">
                    <For each={utilities()}>
                      {(key) => <span class="tag pass">{utilityLabel[key]} mentioned</span>}
                    </For>
                  </div>
                </Show>
                <p class="aside-p">
                  <b>Last visit:</b> {formatDateLong(listing()!.visitedAt)}
                </p>
                <a
                  class="linkbtn"
                  style={{ display: 'inline-block', 'margin-top': '8px' }}
                  href={listing()!.url}
                  target="_blank"
                  rel="noreferrer"
                >
                  Open the original advert ↗
                </a>
              </div>
              <div class="panel stake" style={{ 'margin-top': '14px' }}>
                <h3>We went to see it</h3>
                <p class="small" style={{ margin: '6px 0 12px' }}>
                  Records today's visit and takes it off the "going to see" list. Your notes and
                  ratings stay.
                </p>
                <button
                  class="btn stake wide"
                  type="button"
                  disabled={busy()}
                  onClick={() => void completeVisit().catch(() => undefined)}
                >
                  <CheckIcon /> Mark as visited
                </button>
              </div>
              <ListingRatings sourceListing={listing()!} />
              <ListingRemoval class="listing-removal-aside" busy={busy} onRemove={remove} />
            </aside>
          </div>
          <ListingRemoval class="listing-removal-bottom" busy={busy} onRemove={remove} />
        </>
      </Show>
      <FannedStack />
    </main>
  )
}

function ListingRemoval(props: { class: string; busy: () => boolean; onRemove: () => void }) {
  return (
    <div class={`panel danger listing-removal ${props.class}`}>
      <h3>Remove this plot</h3>
      <p class="small" style={{ margin: '6px 0 12px' }}>
        Removes it and its marked areas for everyone in the search. Saving the same advert again
        brings it back with your notes.
      </p>
      <button
        class="btn danger wide"
        type="button"
        disabled={props.busy()}
        onClick={props.onRemove}
      >
        Remove plot
      </button>
    </div>
  )
}

type ClueKind = 'parcel' | 'coordinates' | 'address'

const clueKindOf = (kind: LocationClueKind): ClueKind =>
  kind === 'parcel_number' ? 'parcel' : kind

const locationClueKindOf = (kind: ClueKind): LocationClueKind =>
  kind === 'parcel' ? 'parcel_number' : kind

/**
 * The stored Primary Location Clue wins; otherwise mirror the resolver's
 * default order so the selector shows what will actually be used.
 */
const initialClueKind = (plot: CandidatePlotRecord): ClueKind =>
  plot.primaryLocationClue
    ? clueKindOf(plot.primaryLocationClue)
    : plot.parcelNumberClue
      ? 'parcel'
      : plot.latitudeClue !== null
        ? 'coordinates'
        : 'address'

function CandidatePlotEditor(props: {
  plot: () => CandidatePlotRecord
  sourceListing: () => SourceListingRecord | undefined
  importedAddress: () => string | null
  number: () => number
  total: () => number
  selected: () => boolean
  onShowOnMap: () => void
  onSave: (
    update: Parameters<ReturnType<typeof useHousehold>['updateCandidatePlot']>[2],
  ) => Promise<void>
  onRemove: () => Promise<void>
}) {
  const household = useHousehold()
  const initialPlot = untrack(props.plot)
  const [name, setName] = createSignal(initialPlot.name ?? '')
  const [price, setPrice] = createSignal(textNumber(initialPlot.priceEur))
  const [area, setArea] = createSignal(textNumber(initialPlot.areaAres))
  const [purpose, setPurpose] = createSignal(initialPlot.purposeText ?? '')
  const [notes, setNotes] = createSignal(initialPlot.notes ?? '')
  const [clueKind, setClueKind] = createSignal<ClueKind>(initialClueKind(initialPlot))
  const [parcel, setParcel] = createSignal(initialPlot.parcelNumberClue ?? '')
  const [latitude, setLatitude] = createSignal(textNumber(initialPlot.latitudeClue))
  const [longitude, setLongitude] = createSignal(textNumber(initialPlot.longitudeClue))
  const initialAddress = untrack(props.importedAddress)
  const [address, setAddress] = createSignal(initialPlot.addressClue ?? initialAddress ?? '')
  const [precision, setPrecision] = createSignal<'exact' | 'approx'>(
    initialPlot.coordinateCluePrecision ?? 'approx',
  )
  const [status, setStatus] = createSignal<{ text: string; bad: boolean }>()
  const match = () => props.plot().registeredParcelMatch ?? null
  const registryArea = () => props.plot().registeredParcelAreaAres ?? null
  const registryPurpose = () => props.plot().registeredParcelPurposeText ?? null

  const heading = () => candidatePlotName(props.plot(), props.number() - 1, props.total())
  const located = () =>
    validCoordinate(props.plot().resolvedLatitude, props.plot().resolvedLongitude) !== null
  const needsLocationRetry = () =>
    props.plot().locationResolutionState !== 'resolved' ||
    (props.plot().locationResolutionState === 'resolved' &&
      props.plot().resolvedParcelNumber !== null &&
      match() === null) ||
    ((props.plot().latitudeClue !== null || props.plot().longitudeClue !== null) &&
      (props.plot().resolvedParcelNumber === null ||
        props.plot().resolvedCadastralNumber === null ||
        props.plot().resolvedBoundary === null))
  const locationDiagnostic = () => household.getCandidatePlotLocationDiagnostic(props.plot().id)
  const locationNote = () => {
    switch (props.plot().locationResolutionState) {
      case 'resolved':
        if (match() === 'confirmed') return 'Exact shape from the land registry.'
        if (match() === 'provisional')
          return 'Probably this parcel — the hint was not exact, so the registry match is unconfirmed.'
        if (
          props.plot().resolvedParcelNumber === null &&
          props.plot().resolvedPrecision === 'exact'
        )
          return 'Here, but no registered parcel was found at this point.'
        return 'Roughly here — the hint was not precise enough for the exact shape.'
      case 'no-result':
        return 'Nothing found for this hint. Check the location hint below and try again.'
      case 'unavailable':
        return 'The location service could not be reached. Try again when online.'
      default:
        return 'Waiting to look up the location hint…'
    }
  }
  const clueLks94 = () => {
    const plot = props.plot()
    if (plot.latitudeClue === null || plot.longitudeClue === null) return null
    try {
      return describeLks94(plot.latitudeClue, plot.longitudeClue)
    } catch (caught) {
      return `LKS94 projection failed: ${errorMessage(caught)}`
    }
  }
  const hasPartialLocation = () =>
    located() || props.plot().resolvedAddress !== null || props.plot().resolvedParcelNumber !== null
  const resolveLocation = () =>
    needsLocationRetry()
      ? household.resolveCandidatePlotLocation(props.plot().sourceListingId, props.plot().id)
      : undefined
  const runAutomaticChecks = () =>
    household.runCandidatePlotAutomaticChecks(props.plot().sourceListingId, props.plot().id)
  const cells = () => checkCells(props.plot().automaticChecks)
  const hasChecks = () => cells().some((cell) => cell.status !== 'unknown')

  createEffect(
    () => {
      const plot = props.plot()
      const sourceListing = props.sourceListing()
      if (!sourceListing) return undefined
      const revision = automaticCheckRevision({ plot, sourceListing })
      return {
        key: `${plot.locationResolutionState}:${revision}:${plot.automaticChecksRevision ?? 'unchecked'}`,
        revision,
      }
    },
    (current) => {
      if (!current) return
      queueMicrotask(() => {
        void (async () => {
          const plot = props.plot()
          if (plot.locationResolutionState === 'missing') await resolveLocation()
          if (
            !plot.automaticChecks ||
            plot.automaticChecks.length !== AUTOMATIC_CHECK_KEYS.length ||
            plot.automaticChecksRevision !== current.revision
          )
            await runAutomaticChecks()
        })().catch(() => undefined)
      })
    },
  )

  const save = action(function* () {
    affects(props.plot)
    setStatus(undefined)
    try {
      yield props.onSave({
        name: optionalText(name()),
        priceEur: optionalNumber(price()),
        areaAres: optionalNumber(area()),
        purposeText: optionalText(purpose()),
        notes: optionalText(notes()),
        parcelNumberClue: optionalText(parcel()),
        latitudeClue: optionalNumber(latitude()),
        longitudeClue: optionalNumber(longitude()),
        coordinateCluePrecision: latitude().trim() || longitude().trim() ? precision() : null,
        addressClue: optionalText(address()),
        primaryLocationClue: locationClueKindOf(clueKind()),
      })
      setStatus({ text: 'Saved', bad: false })
    } catch (caught) {
      setStatus({ text: errorMessage(caught), bad: true })
      throw caught
    }
  })
  const remove = action(function* () {
    affects(props.plot)
    setStatus(undefined)
    try {
      yield props.onRemove()
    } catch (caught) {
      setStatus({ text: errorMessage(caught), bad: true })
      throw caught
    }
  })
  const saving = () => isPending(props.plot)
  const confirmRemove = () => {
    if (!window.confirm(`Remove "${heading()}"? This cannot be undone.`)) return
    void remove().catch(() => undefined)
  }

  return (
    <article
      class={`panel area ${props.selected() ? 'selected' : ''}`}
      id={`area-${props.plot().id}`}
    >
      <div class="area-h">
        <h3>
          <span class="num" aria-hidden="true">
            {props.number()}
          </span>
          {heading()}
        </h3>
        <div class="rowline tight">
          <Show when={candidatePlotRegiaUrl(props.plot())}>
            <a
              class="btn ghost sm"
              href={candidatePlotRegiaUrl(props.plot()) ?? ''}
              target="_blank"
              rel="noopener noreferrer"
            >
              REGIA
            </a>
          </Show>
          <DirectionsPicker destination={() => candidatePlotDirectionsDestination(props.plot())} />
          <Show when={located()}>
            <button class="btn ghost sm" type="button" onClick={props.onShowOnMap}>
              Show on map
            </button>
          </Show>
        </div>
      </div>

      <section class="panel blue block">
        <div class="sub-h">
          <h4>Where it is</h4>
          <Show when={needsLocationRetry()}>
            <button
              class="btn blue sm"
              type="button"
              disabled={household.isCandidatePlotLocationRunning(props.plot().id)}
              onClick={() => void resolveLocation()?.catch(() => undefined)}
            >
              {household.isCandidatePlotLocationRunning(props.plot().id)
                ? 'Looking up…'
                : 'Look up again'}
            </button>
          </Show>
        </div>
        <p class="small" style={{ margin: '6px 0 0' }} role="status">
          {locationNote()}
        </p>
        <Show when={hasPartialLocation()}>
          <dl class="kv">
            <dt>Address</dt>
            <dd>{props.plot().resolvedAddress ?? 'Unavailable'}</dd>
            <dt>Coordinates</dt>
            <dd>
              {located()
                ? `${props.plot().resolvedLatitude}, ${props.plot().resolvedLongitude}`
                : 'Unavailable'}
            </dd>
            <dt>Unique parcel no.</dt>
            <dd>{props.plot().resolvedParcelNumber ?? 'Not found'}</dd>
            <dt>Cadastral no.</dt>
            <dd>{props.plot().resolvedCadastralNumber ?? 'Not found'}</dd>
            <dt>Registry match</dt>
            <dd>
              {match() === 'confirmed'
                ? 'Confirmed'
                : match() === 'provisional'
                  ? 'Unconfirmed'
                  : 'No parcel'}
            </dd>
            <dt>Registry data</dt>
            <dd>{props.plot().parcelDatasetVersion ?? 'Not loaded'}</dd>
          </dl>
        </Show>
        <Show when={clueLks94()}>
          <p class="small muted" style={{ margin: '10px 0 0' }}>
            Hint {props.plot().latitudeClue}, {props.plot().longitudeClue} → {clueLks94()}
          </p>
        </Show>
        <Show when={locationDiagnostic()}>
          <details class="diag" style={{ 'margin-top': '10px' }}>
            <summary>What went wrong</summary>
            <pre>{locationDiagnostic()}</pre>
          </details>
        </Show>
      </section>

      <section class="panel soft block">
        <div class="sub-h">
          <h4>Automatic checks</h4>
          <button
            class="btn ghost sm"
            type="button"
            disabled={household.isCandidatePlotAutomaticChecksRunning(props.plot().id)}
            onClick={() => void runAutomaticChecks().catch(() => undefined)}
          >
            {household.isCandidatePlotAutomaticChecksRunning(props.plot().id)
              ? 'Checking…'
              : hasChecks()
                ? 'Check again'
                : 'Run checks'}
          </button>
        </div>
        <div style={{ 'margin-top': '10px' }}>
          <CheckStrip checks={props.plot().automaticChecks} large />
        </div>
        <div class="small" style={{ 'margin-top': '6px' }}>
          <CheckSummaryText checks={props.plot().automaticChecks} block />
        </div>
        <div class="checklist">
          <For each={cells()}>
            {(cell) => (
              <div class={`check ${cell.status}`}>
                <b>{cell.label}</b>
                <span class={`tag ${checkStatusTagClass(cell.status)}`}>
                  {checkStatusWord(cell.status)}
                </span>
                <span class="v">{cell.value}</span>
                <Show when={cell.detail}>
                  <span class="d">{cell.detail}</span>
                </Show>
              </div>
            )}
          </For>
        </div>
        <p class="small muted" style={{ margin: '10px 0 0' }}>
          Each check is independent advice — there is no overall score.
        </p>
      </section>

      <section class="block bare">
        <div class="grid2">
          <Field
            label="Name for this area"
            value={name()}
            onInput={setName}
            placeholder="e.g. Whole plot"
          />
          <Field label="Price (€)" value={price()} onInput={setPrice} inputmode="decimal" />
          <RegistryBackedField
            label="Area (ares)"
            testId="area-registry"
            value={area()}
            registryValue={registryArea()}
            match={match()}
            updateRevision={props.plot().updatedAt}
            onInput={setArea}
            inputmode="decimal"
          />
          <RegistryBackedField
            label="Land purpose"
            testId="purpose-registry"
            value={purpose()}
            registryValue={registryPurpose()}
            match={match()}
            updateRevision={props.plot().updatedAt}
            onInput={setPurpose}
          />
        </div>
        <label class="f" style={{ 'margin-top': '14px' }}>
          Our notes
          <textarea value={notes()} onInput={(event) => setNotes(event.currentTarget.value)} />
        </label>
      </section>

      <section class="panel soft block">
        <div class="sub-h">
          <h4>Location hint</h4>
          <span class="small muted">What we use to find it on the map</span>
        </div>
        <label class="f" style={{ 'margin-top': '8px' }}>
          Find it by
          <select
            name="clue-kind"
            value={clueKind()}
            onChange={(event) => setClueKind(event.currentTarget.value as ClueKind)}
          >
            <option value="parcel">Unique parcel number (most exact)</option>
            <option value="coordinates">Coordinates</option>
            <option value="address">Address</option>
          </select>
        </label>
        <div style={{ 'margin-top': '10px' }}>
          <Show when={clueKind() === 'parcel'}>
            <Field
              label="Unique parcel number"
              value={parcel()}
              onInput={setParcel}
              placeholder="4400-1234-5678"
            />
            <p class="small muted" style={{ margin: '6px 0 0' }}>
              Found on the advert or in the Registrų centras extract.
            </p>
          </Show>
          <Show when={clueKind() === 'coordinates'}>
            <div class="grid2">
              <Field
                label="Latitude"
                value={latitude()}
                onInput={setLatitude}
                inputmode="decimal"
              />
              <Field
                label="Longitude"
                value={longitude()}
                onInput={setLongitude}
                inputmode="decimal"
              />
              <label class="f">
                How exact
                <select
                  value={precision()}
                  onChange={(event) =>
                    setPrecision(event.currentTarget.value as 'exact' | 'approx')
                  }
                >
                  <option value="exact">Exactly on the plot</option>
                  <option value="approx">Roughly there</option>
                </select>
              </label>
            </div>
          </Show>
          <Show when={clueKind() === 'address'}>
            <Field label="Address" value={address()} onInput={setAddress} />
          </Show>
        </div>
      </section>

      <div class="rowline" style={{ 'margin-top': '16px' }}>
        <button
          class="btn"
          type="button"
          disabled={saving()}
          onClick={() => void save().catch(() => undefined)}
        >
          Save this area
        </button>
        <button class="btn danger ghost" type="button" disabled={saving()} onClick={confirmRemove}>
          Delete area
        </button>
        <Show
          when={saving()}
          fallback={
            <Show when={status()}>
              {(current) => (
                <span class={`status-text ${current().bad ? 'bad' : ''}`} role="status">
                  {current().text}
                </span>
              )}
            </Show>
          }
        >
          <span class="status-text" role="status">
            Saving…
          </span>
        </Show>
      </div>
    </article>
  )
}

function Field(props: {
  label: string
  value: string
  onInput: (value: string) => void
  placeholder?: string
  inputmode?: 'decimal'
}) {
  return (
    <label class="f">
      {props.label}
      <input
        value={props.value}
        placeholder={props.placeholder}
        inputmode={props.inputmode}
        onInput={(event) => props.onInput(event.currentTarget.value)}
      />
    </label>
  )
}

/**
 * Area and land purpose are Effective Plot Facts: a confirmed Registered
 * Parcel supplies them read-only, and the household's own entry stays
 * behind an "edit" toggle as the fallback.
 */
function RegistryBackedField(props: {
  label: string
  testId: string
  value: string
  registryValue: string | number | null
  match: 'confirmed' | 'provisional' | null
  /** Saving or a fresh resolution collapses the fallback input again. */
  updateRevision: number
  onInput: (value: string) => void
  inputmode?: 'decimal'
}) {
  const [editingOurs, setEditingOurs] = createSignal(false)
  createEffect(
    () => props.updateRevision,
    () => {
      setEditingOurs(false)
    },
  )
  const hasRegistryValue = () => props.registryValue !== null
  const confirmed = () => props.match === 'confirmed' && hasRegistryValue()
  const registryText = () => String(props.registryValue ?? '')
  return (
    <Show
      when={confirmed() && !editingOurs()}
      fallback={
        <>
          <Field
            label={props.label}
            value={props.value}
            onInput={props.onInput}
            inputmode={props.inputmode}
          />
          <Show when={props.match === 'provisional' && hasRegistryValue()}>
            <p class="small muted">Registry (unconfirmed): {registryText()}</p>
          </Show>
          <Show when={confirmed()}>
            <p class="small muted">Used only if the registry match is lost.</p>
          </Show>
        </>
      }
    >
      <div class="f readonly" data-testid={props.testId}>
        {props.label}
        <div>
          <b>{registryText()}</b> <span class="tag pass">From the registry</span>
        </div>
        <button class="linkbtn" type="button" onClick={() => setEditingOurs(true)}>
          {props.value.trim() ? `Ours: ${props.value} — edit` : 'Enter our own'}
        </button>
      </div>
    </Show>
  )
}

function ListingRatings(props: { sourceListing: SourceListingDetail }) {
  const household = useHousehold()
  const [error, setError] = createSignal('')
  const [ratings, setRatings] = createOptimistic(
    () => ({
      roadAccessRating: props.sourceListing.roadAccessRating,
      areaFeelingRating: props.sourceListing.areaFeelingRating,
      viewRating: props.sourceListing.viewRating,
    }),
    { loadingValue: { roadAccessRating: null, areaFeelingRating: null, viewRating: null } },
  )
  const save = action(function* (
    key: 'roadAccessRating' | 'areaFeelingRating' | 'viewRating',
    value: number | null,
  ) {
    setError('')
    const next = { ...ratings(), [key]: value }
    setRatings(next)
    try {
      yield household.updateSourceListingRatings(props.sourceListing.id, next)
    } catch (caught) {
      setError(errorMessage(caught))
      throw caught
    }
  })
  const change =
    (key: 'roadAccessRating' | 'areaFeelingRating' | 'viewRating') => (value: number | null) =>
      void save(key, value).catch(() => undefined)

  return (
    <section
      class="panel soft"
      style={{ 'margin-top': '14px' }}
      role="region"
      aria-label="Our ratings"
    >
      <div class="sub-h">
        <h3>Our ratings</h3>
        <span class="small muted">Your impressions, not tied to an area</span>
      </div>
      <Stars
        label="Road & access"
        value={ratings().roadAccessRating}
        onChange={change('roadAccessRating')}
      />
      <Stars
        label="Feel of the area"
        value={ratings().areaFeelingRating}
        onChange={change('areaFeelingRating')}
      />
      <Stars label="View" value={ratings().viewRating} onChange={change('viewRating')} />
      <Show when={error()}>
        <p class="small bad" role="alert">
          Couldn't save rating. Try again.
        </p>
      </Show>
    </section>
  )
}

/** Five stars; clicking the current one clears the rating. */
function Stars(props: {
  label: string
  value: number | null
  onChange: (value: number | null) => void
}) {
  return (
    <div class="rating">
      <span>{props.label}</span>
      <span class="stars" role="group" aria-label={props.label}>
        <For each={[1, 2, 3, 4, 5]}>
          {(star) => (
            <button
              type="button"
              class={props.value !== null && props.value >= star ? 'on' : ''}
              aria-label={`${star} of 5`}
              aria-pressed={props.value === star ? 'true' : 'false'}
              onClick={() => props.onChange(props.value === star ? null : star)}
            >
              ★
            </button>
          )}
        </For>
      </span>
    </div>
  )
}

const optionalText = (value: string) => value.trim() || null
const optionalNumber = (value: string) => {
  if (!value.trim()) return null
  const parsed = Number(value.replace(',', '.'))
  if (!Number.isFinite(parsed)) throw new Error('Enter a number — check price and area')
  return parsed
}
const textNumber = (value: number | null) => value?.toString() ?? ''
const errorMessage = (error: unknown) => (error instanceof Error ? error.message : String(error))
