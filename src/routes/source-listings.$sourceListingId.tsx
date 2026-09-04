import { For, Show, createEffect, createMemo, createSignal } from 'solid-js'
import { useNavigate } from '@solidjs/router'
import { CandidatePlotsMap } from '../components/CandidatePlotsMap'
import type { MapFocusRequest } from '../components/CandidatePlotsMap'
import { CheckStrip, CheckSummaryText } from '../components/CheckStrip'
import { FannedStack } from '../components/FannedStack'
import { GoSeeButton } from '../components/GoSeeButton'
import { CheckIcon, PinIcon } from '../components/icons'
import { useHousehold } from '../households/context'
import { paths } from '../paths'
import type {
  CandidatePlotRecord,
  SourceListingRecord,
} from '../source-listings/model'
import {
  candidatePlotName,
  sourceListingMapItems,
} from '../source-listings/map'
import {
  AUTOMATIC_CHECK_KEYS,
  automaticCheckRevision,
} from '../automatic-checks'
import {
  checkCells,
  checkStatusTagClass,
  checkStatusWord,
} from '../check-summary'
import { describeLks94 } from '../location-resolution'
import { formatAgo, formatDateLong, formatDateShort } from '../format'

export const preloadSourceListing = () => undefined

const utilityLabel = {
  electricity: 'electricity',
  water: 'water',
  sewage: 'sewage',
  gas: 'gas',
} as const

export default function SourceListingPage(props: {
  params: Record<string, string | undefined>
}) {
  const household = useHousehold()
  const navigate = useNavigate()
  const listing = createMemo(() =>
    household.getSourceListing(props.params.sourceListingId ?? ''),
  )
  const [selectedPlotId, setSelectedPlotId] = createSignal<string>()
  const [focus, setFocus] = createSignal<MapFocusRequest>()
  const [photoIndex, setPhotoIndex] = createSignal(0)
  const [error, setError] = createSignal('')
  const [busy, setBusy] = createSignal(false)
  const positionedPlots = createMemo(() => {
    const current = listing()
    return current ? sourceListingMapItems(current) : []
  })
  const title = () => {
    const current = listing()
    return current
      ? (current.title ?? `Aruodas advert ${current.sourceId}`)
      : ''
  }
  const utilities = () =>
    (Object.keys(utilityLabel) as Array<keyof typeof utilityLabel>).filter(
      (key) => listing()?.utilities?.[key] !== undefined,
    )

  const scrollTo = (id: string) =>
    requestAnimationFrame(() =>
      document
        .getElementById(id)
        ?.scrollIntoView({ behavior: 'smooth', block: 'start' }),
    )
  const selectFromMap = (plotId: string) => {
    setSelectedPlotId(plotId)
    scrollTo(`area-${plotId}`)
  }
  const showOnMap = (plotId: string) => {
    setSelectedPlotId(plotId)
    setFocus({ plotId, nonce: Date.now() })
    scrollTo('bigmap')
  }

  const run = async (action: () => Promise<void>) => {
    setBusy(true)
    setError('')
    try {
      await action()
    } catch (caught) {
      setError(errorMessage(caught))
    } finally {
      setBusy(false)
    }
  }
  const addPlot = () =>
    run(async () => {
      const current = listing()
      if (!current) return
      const id = await household.addCandidatePlot(current.id)
      setSelectedPlotId(id)
      scrollTo(`area-${id}`)
    })
  const completeVisit = () =>
    run(async () => {
      const current = listing()
      if (!current) return
      await household.markSourceListingVisited(current.id)
      navigate(paths.visitPlan)
    })
  const remove = () => {
    const current = listing()
    if (!current) return
    if (
      !window.confirm(
        `Remove "${title()}" and its marked areas from the search? Saving the same advert again can bring it back.`,
      )
    )
      return
    void run(async () => {
      await household.removeSourceListing(current.id)
      navigate(paths.home)
    })
  }

  return (
    <main class="wrap">
      <a class="crumb" href={paths.home}>
        ‹ All plots
      </a>
      <Show
        when={listing()}
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
        {(item) => (
          <>
            <header class="head">
              <div>
                <h1>{title()}</h1>
                <div class="place">
                  {item().address ?? 'Location not recorded yet'}
                </div>
                <div class="tags">
                  <a
                    class="tag blue"
                    href={item().url}
                    target="_blank"
                    rel="noreferrer"
                  >
                    Aruodas {item().sourceId} ↗
                  </a>
                  <Show
                    when={item().visitedAt !== null}
                    fallback={<span class="tag">not visited yet</span>}
                  >
                    <span class="tag pass">
                      visited {formatDateShort(item().visitedAt)}
                    </span>
                  </Show>
                  <span class="tag">changed {formatAgo(item().updatedAt)}</span>
                </div>
              </div>
              <div>
                <GoSeeButton sourceListingId={item().id} />
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
                        Add a location hint to one of the marked areas below and
                        we'll look it up.
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
                      {item().candidatePlots.length === 1
                        ? 'The whole plot as advertised. Mark another area if you would only buy part of it, or want to compare a split.'
                        : `${item().candidatePlots.length} ways of buying this plot, compared side by side.`}
                    </p>
                  </div>
                  <button
                    class="btn stake ghost"
                    type="button"
                    disabled={busy()}
                    onClick={() => void addPlot()}
                  >
                    + Mark another area
                  </button>
                </div>
                <Show when={error()}>
                  <p class="alert" role="alert">
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
                      total={item().candidatePlots.length}
                      selected={selectedPlotId() === plot.id}
                      onShowOnMap={() => showOnMap(plot.id)}
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
              </div>

              <aside>
                <Show
                  when={item().photos.length > 0}
                  fallback={
                    <div class="panel soft muted small">
                      No photos came with the advert.
                    </div>
                  }
                >
                  <div class="gallery">
                    <img
                      src={
                        item().photos[
                          Math.min(photoIndex(), item().photos.length - 1)
                        ]
                      }
                      alt=""
                    />
                    <Show when={item().photos.length > 1}>
                      <div class="thumbs">
                        <For each={item().photos}>
                          {(photo, index) => (
                            <button
                              type="button"
                              aria-label={`Photo ${index() + 1}`}
                              aria-pressed={
                                index() === photoIndex() ? 'true' : 'false'
                              }
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
                      when={item().description}
                      fallback={
                        <span class="muted">
                          No description came with the advert.
                        </span>
                      }
                    >
                      {item().description}
                    </Show>
                  </p>
                  <Show when={utilities().length > 0}>
                    <div class="util">
                      <For each={utilities()}>
                        {(key) => (
                          <span class="tag pass">
                            {utilityLabel[key]} mentioned
                          </span>
                        )}
                      </For>
                    </div>
                  </Show>
                  <p class="aside-p">
                    <b>Last visit:</b> {formatDateLong(item().visitedAt)}
                  </p>
                  <a
                    class="linkbtn"
                    style={{ display: 'inline-block', 'margin-top': '8px' }}
                    href={item().url}
                    target="_blank"
                    rel="noreferrer"
                  >
                    Open the original advert ↗
                  </a>
                </div>
                <div class="panel stake" style={{ 'margin-top': '14px' }}>
                  <h3>We went to see it</h3>
                  <p class="small" style={{ margin: '6px 0 12px' }}>
                    Records today's visit and takes it off the "going to see"
                    list. Your notes and ratings stay.
                  </p>
                  <button
                    class="btn stake wide"
                    type="button"
                    disabled={busy()}
                    onClick={() => void completeVisit()}
                  >
                    <CheckIcon /> Mark as visited
                  </button>
                </div>
                <div class="panel danger" style={{ 'margin-top': '14px' }}>
                  <h3>Remove this plot</h3>
                  <p class="small" style={{ margin: '6px 0 12px' }}>
                    Removes it and its marked areas for everyone in the search.
                    Saving the same advert again brings it back with your notes.
                  </p>
                  <button
                    class="btn danger wide"
                    type="button"
                    disabled={busy()}
                    onClick={remove}
                  >
                    Remove plot
                  </button>
                </div>
              </aside>
            </div>
          </>
        )}
      </Show>
      <FannedStack />
    </main>
  )
}

type ClueKind = 'parcel' | 'coordinates' | 'address'

function CandidatePlotEditor(props: {
  plot: CandidatePlotRecord
  sourceListing: SourceListingRecord
  importedAddress: string | null
  number: number
  total: number
  selected: boolean
  onShowOnMap: () => void
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
  const [clueKind, setClueKind] = createSignal<ClueKind>(
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
  const [road, setRoad] = createSignal(props.plot.roadAccessRating)
  const [feeling, setFeeling] = createSignal(props.plot.areaFeelingRating)
  const [view, setView] = createSignal(props.plot.viewRating)
  const [status, setStatus] = createSignal<{ text: string; bad: boolean }>()

  const heading = () =>
    candidatePlotName(props.plot, props.number - 1, props.total)
  const located = () =>
    props.plot.resolvedLatitude !== null &&
    props.plot.resolvedLongitude !== null
  const directionsDestination = () => {
    if (located())
      return `${props.plot.resolvedLatitude},${props.plot.resolvedLongitude}`
    if (props.plot.latitudeClue !== null && props.plot.longitudeClue !== null)
      return `${props.plot.latitudeClue},${props.plot.longitudeClue}`
    return props.plot.addressClue
  }
  const directionsUrl = () => {
    const destination = directionsDestination()
    return destination
      ? `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(destination)}`
      : null
  }
  const needsLocationRetry = () =>
    props.plot.locationResolutionState !== 'resolved' ||
    ((props.plot.latitudeClue !== null || props.plot.longitudeClue !== null) &&
      (props.plot.resolvedParcelNumber === null ||
        props.plot.resolvedCadastralNumber === null ||
        props.plot.resolvedBoundary === null))
  const locationDiagnostic = () =>
    household.getCandidatePlotLocationDiagnostic(props.plot.id)
  const locationNote = () => {
    switch (props.plot.locationResolutionState) {
      case 'resolved':
        return props.plot.resolvedPrecision === 'exact'
          ? 'Exact shape from the land registry.'
          : 'Roughly here — the hint was not precise enough for the exact shape.'
      case 'no-result':
        return 'Nothing found for this hint. Check the location hint below and try again.'
      case 'unavailable':
        return 'The location service could not be reached. Try again when online.'
      default:
        return 'Waiting to look up the location hint…'
    }
  }
  const clueLks94 = () => {
    if (props.plot.latitudeClue === null || props.plot.longitudeClue === null)
      return null
    try {
      return describeLks94(props.plot.latitudeClue, props.plot.longitudeClue)
    } catch (caught) {
      return `LKS94 projection failed: ${errorMessage(caught)}`
    }
  }
  const hasPartialLocation = () =>
    located() ||
    props.plot.resolvedAddress !== null ||
    props.plot.resolvedParcelNumber !== null
  const resolveLocation = () =>
    needsLocationRetry()
      ? household.resolveCandidatePlotLocation(
          props.plot.sourceListingId,
          props.plot.id,
        )
      : undefined
  const runAutomaticChecks = () =>
    household.runCandidatePlotAutomaticChecks(
      props.plot.sourceListingId,
      props.plot.id,
    )
  const cells = () => checkCells(props.plot.automaticChecks)
  const hasChecks = () => cells().some((cell) => cell.status !== 'unknown')

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
    setStatus({ text: 'Saving…', bad: false })
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
        roadAccessRating: road(),
        areaFeelingRating: feeling(),
        viewRating: view(),
      })
      setStatus({ text: 'Saved', bad: false })
    } catch (caught) {
      setStatus({ text: errorMessage(caught), bad: true })
    }
  }

  return (
    <article
      class={`panel area ${props.selected ? 'selected' : ''}`}
      id={`area-${props.plot.id}`}
    >
      <div class="area-h">
        <h3>
          <span class="num" aria-hidden="true">
            {props.number}
          </span>
          {heading()}
        </h3>
        <div class="rowline tight">
          <Show when={directionsUrl()}>
            {(url) => (
              <a
                class="btn ghost sm"
                href={url()}
                target="_blank"
                rel="noreferrer"
              >
                <PinIcon /> Directions
              </a>
            )}
          </Show>
          <Show when={located()}>
            <button
              class="btn ghost sm"
              type="button"
              onClick={props.onShowOnMap}
            >
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
              disabled={household.isCandidatePlotLocationRunning(props.plot.id)}
              onClick={() => void resolveLocation()}
            >
              {household.isCandidatePlotLocationRunning(props.plot.id)
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
            <dd>{props.plot.resolvedAddress ?? 'Unavailable'}</dd>
            <dt>Coordinates</dt>
            <dd>
              {located()
                ? `${props.plot.resolvedLatitude}, ${props.plot.resolvedLongitude}`
                : 'Unavailable'}
            </dd>
            <dt>Unique parcel no.</dt>
            <dd>{props.plot.resolvedParcelNumber ?? 'Not found'}</dd>
            <dt>Cadastral no.</dt>
            <dd>{props.plot.resolvedCadastralNumber ?? 'Not found'}</dd>
            <dt>Registry data</dt>
            <dd>{props.plot.parcelDatasetVersion ?? 'Not loaded'}</dd>
          </dl>
        </Show>
        <Show when={clueLks94()}>
          {(lks94) => (
            <p class="small muted" style={{ margin: '10px 0 0' }}>
              Hint {props.plot.latitudeClue}, {props.plot.longitudeClue} →{' '}
              {lks94()}
            </p>
          )}
        </Show>
        <Show when={locationDiagnostic()}>
          {(diagnostic) => (
            <details class="diag" style={{ 'margin-top': '10px' }}>
              <summary>What went wrong</summary>
              <pre>{diagnostic()}</pre>
            </details>
          )}
        </Show>
      </section>

      <section class="panel soft block">
        <div class="sub-h">
          <h4>Automatic checks</h4>
          <button
            class="btn ghost sm"
            type="button"
            disabled={household.isCandidatePlotAutomaticChecksRunning(
              props.plot.id,
            )}
            onClick={() => void runAutomaticChecks()}
          >
            {household.isCandidatePlotAutomaticChecksRunning(props.plot.id)
              ? 'Checking…'
              : hasChecks()
                ? 'Check again'
                : 'Run checks'}
          </button>
        </div>
        <div style={{ 'margin-top': '10px' }}>
          <CheckStrip checks={props.plot.automaticChecks} large />
        </div>
        <div class="small" style={{ 'margin-top': '6px' }}>
          <CheckSummaryText checks={props.plot.automaticChecks} block />
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
          <Field
            label="Price (€)"
            value={price()}
            onInput={setPrice}
            inputmode="decimal"
          />
          <Field
            label="Area (ares)"
            value={area()}
            onInput={setArea}
            inputmode="decimal"
          />
          <Field label="Land purpose" value={purpose()} onInput={setPurpose} />
        </div>
        <label class="f" style={{ 'margin-top': '14px' }}>
          Our notes
          <textarea
            value={notes()}
            onInput={(event) => setNotes(event.currentTarget.value)}
          />
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
            onChange={(event) =>
              setClueKind(event.currentTarget.value as ClueKind)
            }
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
                    setPrecision(
                      event.currentTarget.value as 'exact' | 'approx',
                    )
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

      <section class="panel soft block">
        <div class="sub-h">
          <h4>Our ratings</h4>
          <span class="small muted">After you've been there</span>
        </div>
        <Stars label="Road & access" value={road()} onChange={setRoad} />
        <Stars
          label="Feel of the area"
          value={feeling()}
          onChange={setFeeling}
        />
        <Stars label="View" value={view()} onChange={setView} />
      </section>

      <div class="rowline" style={{ 'margin-top': '16px' }}>
        <button class="btn" type="button" onClick={() => void save()}>
          Save this area
        </button>
        <Show when={status()}>
          {(current) => (
            <span
              class={`status-text ${current().bad ? 'bad' : ''}`}
              role="status"
            >
              {current().text}
            </span>
          )}
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
  if (!Number.isFinite(parsed))
    throw new Error('Enter a number — check price and area')
  return parsed
}
const textNumber = (value: number | null) => value?.toString() ?? ''
const errorMessage = (error: unknown) =>
  error instanceof Error ? error.message : String(error)
