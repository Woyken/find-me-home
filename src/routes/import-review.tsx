import { Show, createSignal } from 'solid-js'
import { chooseImportedLocationClue } from '../location-clue'
import { useHousehold } from '../households/context'
import { useImport } from '../imports/context'
import { paths } from '../paths'

export default function ImportReview() {
  const imports = useImport()
  const household = useHousehold()
  const imported = imports.draft()
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

  const save = async () => {
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
      window.location.assign(paths.sourceListing(result.sourceListingId))
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught))
      setBusy(false)
    }
  }

  return (
    <main class="min-h-screen bg-[#f6f4ec] px-5 py-8 text-[#17231d] sm:px-10">
      <Show
        when={imported}
        fallback={
          <div class="mx-auto max-w-xl border border-[#17231d]/20 bg-white p-8 text-center">
            <h1 class="font-serif text-3xl">Import could not be read</h1>
            <p role="alert" class="mt-3 text-[#607067]">
              {imports.error()}
            </p>
            <button class="mt-6 font-bold underline" onClick={imports.clear}>
              Return home
            </button>
          </div>
        }
      >
        {(value) => (
          <div class="mx-auto max-w-5xl">
            <p class="font-mono text-xs font-bold uppercase text-[#315f73]">
              Aruodas · {value().sourceId}
            </p>
            <h1 class="mt-2 font-serif text-4xl">Review before saving</h1>
            <div class="mt-8 grid gap-6 lg:grid-cols-[0.8fr_1.2fr]">
              <aside class="bg-[#24483a] p-6 text-white">
                <Show when={value().photos[0]}>
                  {(photo) => (
                    <img
                      class="h-48 w-full object-cover"
                      src={photo()}
                      alt=""
                    />
                  )}
                </Show>
                <h2 class="mt-5 font-serif text-2xl">
                  {value().title ?? 'Untitled Aruodas advert'}
                </h2>
                <p class="mt-3 text-sm">
                  {value().address ?? 'No location imported'}
                </p>
                <a
                  class="mt-6 inline-block font-bold underline"
                  href={value().url}
                  target="_blank"
                  rel="noreferrer"
                >
                  Open original advert
                </a>
              </aside>
              <section class="border border-[#17231d]/15 bg-white p-6 sm:p-9">
                <h2 class="font-serif text-3xl">Initial Candidate Plot</h2>
                <ReviewField label="Price" value={price()} onInput={setPrice} />
                <ReviewField label="Area" value={area()} onInput={setArea} />
                <ReviewField
                  label="Purpose"
                  value={purpose()}
                  onInput={setPurpose}
                />
                <label class="mt-5 block text-sm font-bold">
                  Notes
                  <textarea
                    aria-label="Notes"
                    class="mt-2 h-24 w-full border p-3"
                    value={notes()}
                    onInput={(event) => setNotes(event.currentTarget.value)}
                  />
                </label>
                <Show when={error()}>
                  <p role="alert" class="mt-4 text-[#a13d22]">
                    {error()}
                  </p>
                </Show>
                <button
                  class="mt-7 w-full bg-[#24483a] px-5 py-4 font-bold text-white disabled:opacity-50"
                  disabled={busy()}
                  onClick={save}
                >
                  {busy()
                    ? 'Saving...'
                    : 'Save Source Listing and Candidate Plot'}
                </button>
              </section>
            </div>
          </div>
        )}
      </Show>
    </main>
  )
}

function ReviewField(props: {
  label: string
  value: string
  onInput: (value: string) => void
}) {
  return (
    <label class="mt-5 block text-sm font-bold">
      {props.label}
      <input
        aria-label={props.label}
        class="mt-2 block w-full border p-3 font-normal"
        value={props.value}
        onInput={(event) => props.onInput(event.currentTarget.value)}
      />
    </label>
  )
}

const optionalText = (value: string) => value.trim() || null
const optionalNumber = (value: string, label: string) => {
  if (!value.trim()) return null
  const number = Number(value.replace(',', '.'))
  if (!Number.isFinite(number)) throw new Error(`${label} must be a number.`)
  return number
}
