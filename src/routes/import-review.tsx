import { Show, createEffect, createMemo, createSignal, onCleanup } from 'solid-js'
import { chooseImportedLocationClue } from '../location-clue'
import { openAddPlotDialog } from '../components/AddPlotDialog'
import { PinIcon } from '../components/icons'
import { useHousehold } from '../households/context'
import { restoreImportTransport } from '../imports/aruodas'
import type { AruodasImport } from '../imports/aruodas'
import { useImport } from '../imports/context'
import { paths } from '../paths'
import type { ReviewedImport } from '../source-listings/model'

export const reviewedImport = (imported: AruodasImport): ReviewedImport => {
  const clue = chooseImportedLocationClue({
    uniqueRegistryNumber: imported.uniqueRegistryNumber,
    latitude: imported.lat,
    longitude: imported.lng,
    address: imported.address,
    precision: imported.locationConfidence,
  })
  return {
    imported,
    priceEur: imported.priceEur ?? null,
    areaAres: imported.areaAres ?? null,
    purposeText: imported.purposeText?.trim() || null,
    notes: null,
    parcelNumberClue: clue.parcelNumberClue,
    latitudeClue: clue.latitudeClue,
    longitudeClue: clue.longitudeClue,
    coordinateCluePrecision: clue.coordinateCluePrecision,
    addressClue: clue.addressClue,
  }
}

/** A price is required before an advert can be saved without human review. */
export const autoReviewedImport = (imported: AruodasImport) => {
  try {
    const restored = restoreImportTransport({ kind: 'listing', imported })
    if (restored.kind !== 'listing' || restored.imported.priceEur === undefined) return undefined
    return reviewedImport(restored.imported)
  } catch {
    return undefined
  }
}

const draftKey = (imported: AruodasImport) => JSON.stringify(imported)

export default function ImportReview() {
  const imports = useImport()
  const household = useHousehold()
  const imported = () => {
    const transport = imports.draft()
    return transport?.kind === 'listing' ? transport.imported : undefined
  }
  const fromInbox = () => {
    const transport = imports.draft()
    return transport?.kind === 'listing' && transport.returnTo === 'import-inbox'
  }
  const clue = createMemo(() => {
    const value = imported()
    return value
      ? chooseImportedLocationClue({
          uniqueRegistryNumber: value.uniqueRegistryNumber,
          latitude: value.lat,
          longitude: value.lng,
          address: value.address,
          precision: value.locationConfidence,
        })
      : undefined
  })
  const [price, setPrice] = createSignal('')
  const [area, setArea] = createSignal('')
  const [purpose, setPurpose] = createSignal('')
  const [notes, setNotes] = createSignal('')
  const [busy, setBusy] = createSignal(false)
  const [autoSaving, setAutoSaving] = createSignal(false)
  const [error, setError] = createSignal('')
  let autoSaveKey: string | undefined
  let latestDraftKey: string | undefined
  let operation = 0
  let disposed = false
  onCleanup(() => {
    disposed = true
  })

  createEffect(imported, (value) => {
    if (!value) return
    const key = draftKey(value)
    if (key === latestDraftKey) return
    latestDraftKey = key
    operation += 1
    autoSaveKey = undefined
    setBusy(false)
    setAutoSaving(false)
    setPrice(value.priceEur?.toString() ?? '')
    setArea(value.areaAres?.toString() ?? '')
    setPurpose(value.purposeText ?? '')
    setNotes('')
    setError('')
  })

  createEffect(
    () => {
      const value = imported()
      return value ? autoReviewedImport(value) : undefined
    },
    (review) => {
      if (!review) return
      const key = draftKey(review.imported)
      if (autoSaveKey === key) return
      autoSaveKey = key
      const saveOperation = ++operation
      setBusy(true)
      setAutoSaving(true)
      setError('')
      void household
        .saveReviewedImport(review)
        .then((result) => {
          if (disposed || operation !== saveOperation) return
          imports.clear()
          window.location.assign(paths.sourceListing(result.sourceListingId))
        })
        .catch((caught) => {
          if (disposed || operation !== saveOperation) return
          setError(caught instanceof Error ? caught.message : String(caught))
          setBusy(false)
          setAutoSaving(false)
        })
    },
  )

  const howWeFindIt = () => {
    const value = clue()
    if (!value) return null
    switch (value.kind) {
      case 'registry':
        return {
          title: "We'll find it by its parcel number",
          detail: `${value.parcelNumberClue} — the exact shape will be drawn on the map after saving.`,
        }
      case 'coordinates':
        return {
          title: "We'll find it by its coordinates",
          detail:
            value.coordinateCluePrecision === 'exact'
              ? 'The advert gave an exact point; we will look for the parcel there.'
              : 'The advert only gave a rough point, so the map will show roughly where it is.',
        }
      default:
        return value.addressClue
          ? {
              title: "We'll find it by its address",
              detail: `${value.addressClue} — you can add a parcel number later for the exact shape.`,
            }
          : {
              title: 'No location came with the advert',
              detail: 'Add a location hint on the plot page and we will look it up.',
            }
    }
  }

  const save = async (event: SubmitEvent) => {
    event.preventDefault()
    const value = imported()
    const locationClue = clue()
    if (!value || !locationClue) return
    const saveOperation = ++operation
    setBusy(true)
    setError('')
    try {
      const result = await household.saveReviewedImport({
        ...reviewedImport(value),
        priceEur: optionalNumber(price(), 'Price'),
        areaAres: optionalNumber(area(), 'Area'),
        purposeText: optionalText(purpose()),
        notes: optionalText(notes()),
      })
      if (disposed || operation !== saveOperation) return
      imports.clear()
      window.location.assign(
        fromInbox() ? paths.importInbox : paths.sourceListing(result.sourceListingId),
      )
    } catch (caught) {
      if (disposed || operation !== saveOperation) return
      setError(caught instanceof Error ? caught.message : String(caught))
      setBusy(false)
    }
  }

  return (
    <main class="wrap review">
      <Show
        when={imported()}
        keyed
        fallback={
          <div class="panel empty" style={{ 'max-width': '560px', margin: '40px auto' }}>
            <h2>We couldn't read that advert</h2>
            <p role="alert">
              {imports.error() || 'The bookmark sent something this version does not understand.'}{' '}
              Try the bookmark again on the advert page, or update the bookmark from the Add a plot
              step.
            </p>
            <div class="rowline" style={{ 'justify-content': 'center' }}>
              <button class="btn" type="button" onClick={imports.clear}>
                Back to plots
              </button>
              <button class="btn ghost" type="button" onClick={openAddPlotDialog}>
                Update the bookmark
              </button>
            </div>
          </div>
        }
      >
        {(value) => (
          <>
            <header class="review-head">
              <span class="tag blue">Aruodas {value.sourceId}</span>
              <h1>Check what we found, then save</h1>
              <p>
                We read this from the advert. Fix anything that looks wrong; you can change all of
                it later.
                {fromInbox() ? ' After saving you go back to your clippings.' : ''}
              </p>
            </header>
            <div class="review-cols">
              <aside class="panel advert">
                <Show when={value.photos[0]}>{(photo) => <img src={photo()} alt="" />}</Show>
                <h2>{value.title ?? 'Land advert with no title'}</h2>
                <div class="p">{value.address ?? 'No address came with the advert'}</div>
                <Show when={value.description}>
                  <p class="small" style={{ 'margin-top': '10px' }}>
                    {value.description}
                  </p>
                </Show>
                <a
                  class="linkbtn"
                  style={{ display: 'inline-block', 'margin-top': '10px' }}
                  href={value.url}
                  target="_blank"
                  rel="noreferrer"
                >
                  Open the original advert ↗
                </a>
                <Show when={howWeFindIt()} keyed>
                  {(how) => (
                    <div class="panel blue found">
                      <div class="loc">
                        <PinIcon />
                        <div>
                          <b>{how.title}</b>
                          <div class="small muted">{how.detail}</div>
                        </div>
                      </div>
                    </div>
                  )}
                </Show>
              </aside>
              <form class="panel form" onSubmit={(event) => void save(event)}>
                <h2>The plot</h2>
                <p class="hint">Price and area are used by the automatic checks.</p>
                <div class="grid2">
                  <label class="f">
                    Price (€)
                    <input
                      aria-label="Price"
                      inputmode="decimal"
                      value={price()}
                      onInput={(event) => setPrice(event.currentTarget.value)}
                    />
                  </label>
                  <label class="f">
                    Area (ares)
                    <input
                      aria-label="Area"
                      inputmode="decimal"
                      value={area()}
                      onInput={(event) => setArea(event.currentTarget.value)}
                    />
                  </label>
                </div>
                <label class="f" style={{ 'margin-top': '14px' }}>
                  Land purpose
                  <input
                    aria-label="Land purpose"
                    value={purpose()}
                    onInput={(event) => setPurpose(event.currentTarget.value)}
                  />
                </label>
                <label class="f" style={{ 'margin-top': '14px' }}>
                  Our notes{' '}
                  <span class="muted" style={{ 'font-weight': '400' }}>
                    (optional)
                  </span>
                  <textarea
                    aria-label="Notes"
                    placeholder="Why this one caught your eye"
                    value={notes()}
                    onInput={(event) => setNotes(event.currentTarget.value)}
                  />
                </label>
                <Show when={error()}>
                  <p class="alert" role="alert" style={{ margin: '10px 0 0' }}>
                    {error()}
                  </p>
                </Show>
                <div class="rowline" style={{ 'margin-top': '18px' }}>
                  <button class="btn" type="submit" disabled={busy()}>
                    {busy() ? 'Saving…' : 'Save plot'}
                  </button>
                  <Show when={!autoSaving()}>
                    <a
                      class="linkbtn"
                      href={fromInbox() ? paths.importInbox : paths.home}
                      onClick={imports.clear}
                    >
                      Cancel
                    </a>
                  </Show>
                </div>
                <p class="small muted" style={{ 'margin-top': '12px' }}>
                  After saving we look up the location and run the 13 checks automatically.
                </p>
              </form>
            </div>
          </>
        )}
      </Show>
    </main>
  )
}

const optionalText = (value: string) => value.trim() || null
const optionalNumber = (value: string, label: string) => {
  if (!value.trim()) return null
  const number = Number(value.replace(',', '.'))
  if (!Number.isFinite(number)) throw new Error(`${label} must be a number.`)
  return number
}
