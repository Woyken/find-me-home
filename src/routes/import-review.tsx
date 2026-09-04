import { Show, createSignal } from 'solid-js'
import { chooseImportedLocationClue } from '../location-clue'
import { openAddPlotDialog } from '../components/AddPlotDialog'
import { PinIcon } from '../components/icons'
import { useHousehold } from '../households/context'
import { useImport } from '../imports/context'
import { paths } from '../paths'

export default function ImportReview() {
  const imports = useImport()
  const household = useHousehold()
  const transport = imports.draft()
  const imported =
    transport?.kind === 'listing' ? transport.imported : undefined
  const fromInbox =
    transport?.kind === 'listing' && transport.returnTo === 'import-inbox'
  const clue = imported
    ? chooseImportedLocationClue({
        uniqueRegistryNumber: imported.uniqueRegistryNumber,
        latitude: imported.lat,
        longitude: imported.lng,
        address: imported.address,
        precision: imported.locationConfidence,
      })
    : undefined
  const [price, setPrice] = createSignal(imported?.priceEur?.toString() ?? '')
  const [area, setArea] = createSignal(imported?.areaAres?.toString() ?? '')
  const [purpose, setPurpose] = createSignal(imported?.purposeText ?? '')
  const [notes, setNotes] = createSignal('')
  const [busy, setBusy] = createSignal(false)
  const [error, setError] = createSignal('')

  const howWeFindIt = () => {
    if (!clue) return null
    switch (clue.kind) {
      case 'registry':
        return {
          title: "We'll find it by its parcel number",
          detail: `${clue.parcelNumberClue} — the exact shape will be drawn on the map after saving.`,
        }
      case 'coordinates':
        return {
          title: "We'll find it by its coordinates",
          detail:
            clue.coordinateCluePrecision === 'exact'
              ? 'The advert gave an exact point; we will look for the parcel there.'
              : 'The advert only gave a rough point, so the map will show roughly where it is.',
        }
      default:
        return clue.addressClue
          ? {
              title: "We'll find it by its address",
              detail: `${clue.addressClue} — you can add a parcel number later for the exact shape.`,
            }
          : {
              title: 'No location came with the advert',
              detail:
                'Add a location hint on the plot page and we will look it up.',
            }
    }
  }

  const save = async (event: SubmitEvent) => {
    event.preventDefault()
    if (!imported || !clue) return
    setBusy(true)
    setError('')
    try {
      const result = await household.saveReviewedImport({
        imported,
        priceEur: optionalNumber(price(), 'Price'),
        areaAres: optionalNumber(area(), 'Area'),
        purposeText: optionalText(purpose()),
        notes: optionalText(notes()),
        parcelNumberClue: clue.parcelNumberClue,
        latitudeClue: clue.latitudeClue,
        longitudeClue: clue.longitudeClue,
        coordinateCluePrecision: clue.coordinateCluePrecision,
        addressClue: clue.addressClue,
      })
      imports.clear()
      window.location.assign(
        fromInbox
          ? paths.importInbox
          : paths.sourceListing(result.sourceListingId),
      )
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught))
      setBusy(false)
    }
  }

  return (
    <main class="wrap review">
      <Show
        when={imported}
        fallback={
          <div
            class="panel empty"
            style={{ 'max-width': '560px', margin: '40px auto' }}
          >
            <h2>We couldn't read that advert</h2>
            <p role="alert">
              {imports.error() ||
                'The bookmark sent something this version does not understand.'}{' '}
              Try the bookmark again on the advert page, or update the bookmark
              from the Add a plot step.
            </p>
            <div class="rowline" style={{ 'justify-content': 'center' }}>
              <button class="btn" type="button" onClick={imports.clear}>
                Back to plots
              </button>
              <button
                class="btn ghost"
                type="button"
                onClick={openAddPlotDialog}
              >
                Update the bookmark
              </button>
            </div>
          </div>
        }
      >
        {(value) => (
          <>
            <header class="review-head">
              <span class="tag blue">Aruodas {value().sourceId}</span>
              <h1>Check what we found, then save</h1>
              <p>
                We read this from the advert. Fix anything that looks wrong; you
                can change all of it later.
                {fromInbox
                  ? ' After saving you go back to your clippings.'
                  : ''}
              </p>
            </header>
            <div class="review-cols">
              <aside class="panel advert">
                <Show when={value().photos[0]}>
                  {(photo) => <img src={photo()} alt="" />}
                </Show>
                <h2>{value().title ?? 'Land advert with no title'}</h2>
                <div class="p">
                  {value().address ?? 'No address came with the advert'}
                </div>
                <Show when={value().description}>
                  <p class="small" style={{ 'margin-top': '10px' }}>
                    {value().description}
                  </p>
                </Show>
                <a
                  class="linkbtn"
                  style={{ display: 'inline-block', 'margin-top': '10px' }}
                  href={value().url}
                  target="_blank"
                  rel="noreferrer"
                >
                  Open the original advert ↗
                </a>
                <Show when={howWeFindIt()}>
                  {(how) => (
                    <div class="panel blue found">
                      <div class="loc">
                        <PinIcon />
                        <div>
                          <b>{how().title}</b>
                          <div class="small muted">{how().detail}</div>
                        </div>
                      </div>
                    </div>
                  )}
                </Show>
              </aside>
              <form class="panel form" onSubmit={(event) => void save(event)}>
                <h2>The plot</h2>
                <p class="hint">
                  Price and area are used by the automatic checks.
                </p>
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
                  <a
                    class="linkbtn"
                    href={fromInbox ? paths.importInbox : paths.home}
                    onClick={imports.clear}
                  >
                    Cancel
                  </a>
                </div>
                <p class="small muted" style={{ 'margin-top': '12px' }}>
                  After saving we look up the location and run the 13 checks
                  automatically.
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
