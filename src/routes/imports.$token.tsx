import { Link, createFileRoute, useNavigate } from '@tanstack/solid-router'
import { Show, createSignal, untrack } from 'solid-js'
import {
  fetchImportDraft,
  saveDraft,
} from '../server-functions/source-listings'

export const Route = createFileRoute('/imports/$token')({
  loader: ({ params }) => fetchImportDraft({ data: { token: params.token } }),
  component: ImportReview,
})

function ImportReview() {
  const draft = () => Route.useLoaderData()()
  const navigate = useNavigate()
  return (
    <main class="min-h-screen bg-[#f6f4ec] px-5 py-8 text-[#17231d] sm:px-10">
      <Show
        when={draft()}
        fallback={
          <div class="mx-auto max-w-xl border border-[#17231d]/20 bg-white p-8 text-center">
            <h1 class="font-serif text-3xl">This draft has expired</h1>
            <p class="mt-3 text-[#607067]">
              Run the bookmarklet from the Aruodas advert again.
            </p>
            <Link
              class="mt-6 inline-block font-bold text-[#315f73] underline"
              to="/"
            >
              Return home
            </Link>
          </div>
        }
      >
        {(loaded) => (
          <ReviewSheet
            draft={loaded()}
            onSaved={(id) =>
              navigate({
                to: '/source-listings/$sourceListingId',
                params: { sourceListingId: String(id) },
              })
            }
          />
        )}
      </Show>
    </main>
  )
}

function ReviewSheet(props: {
  draft: NonNullable<
    ReturnType<typeof Route.useLoaderData>
  > extends () => infer T
    ? NonNullable<Awaited<T>>
    : never
  onSaved: (id: number) => void
}) {
  const draft = untrack(() => props.draft)
  const imported = draft.imported
  const reimporting = draft.existingSourceListingId !== null
  const [price, setPrice] = createSignal(imported.priceEur?.toString() ?? '')
  const [area, setArea] = createSignal(imported.areaAres?.toString() ?? '')
  const [purpose, setPurpose] = createSignal(imported.purposeText ?? '')
  const [address, setAddress] = createSignal(imported.address ?? '')
  const [parcel, setParcel] = createSignal(imported.cadastralNumber ?? '')
  const [lat, setLat] = createSignal(imported.lat?.toString() ?? '')
  const [lng, setLng] = createSignal(imported.lng?.toString() ?? '')
  const [notes, setNotes] = createSignal('')
  const [advanced, setAdvanced] = createSignal(false)
  const [busy, setBusy] = createSignal(false)
  const [error, setError] = createSignal('')
  const save = async () => {
    setBusy(true)
    setError('')
    try {
      const latitudeClue = parseOptionalNumber(lat(), 'Latitude')
      const longitudeClue = parseOptionalNumber(lng(), 'Longitude')
      if ((latitudeClue === null) !== (longitudeClue === null)) {
        throw new Error(
          'Enter both latitude and longitude, or leave both blank.',
        )
      }
      const result = await saveDraft({
        data: {
          token: draft.token,
          priceEur: parseOptionalNumber(price(), 'Price'),
          areaAres: parseOptionalNumber(area(), 'Area'),
          purposeText: optionalText(purpose()),
          addressClue: optionalText(address()),
          parcelNumberClue: optionalText(parcel()),
          latitudeClue,
          longitudeClue,
          notes: optionalText(notes()),
        },
      })
      props.onSaved(result.sourceListingId)
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught))
    } finally {
      setBusy(false)
    }
  }
  return (
    <div class="mx-auto max-w-6xl">
      <header>
        <p class="font-mono text-[11px] font-bold uppercase tracking-[0.2em] text-[#315f73]">
          Aruodas import · expires {draft.expiresAt}
        </p>
        <h1 class="mt-2 font-serif text-4xl sm:text-5xl">
          Review before saving
        </h1>
      </header>
      <div class="mt-8 grid gap-6 lg:grid-cols-[0.8fr_1.2fr]">
        <aside class="bg-[#24483a] p-6 text-white lg:sticky lg:top-8 lg:self-start">
          <p class="font-mono text-[10px] font-bold tracking-[0.2em] text-[#bfd0c2]">
            SOURCE LISTING · {imported.sourceId}
          </p>
          <Show when={imported.photos[0]}>
            <img
              class="mt-5 h-48 w-full object-cover"
              src={imported.photos[0]}
              alt=""
            />
          </Show>
          <h2 class="mt-5 font-serif text-2xl leading-tight">
            {imported.title ?? 'Untitled Aruodas advert'}
          </h2>
          <p class="mt-3 text-sm text-[#dce7d5]">
            {imported.address ?? 'No location imported'}
          </p>
          <Show when={imported.lat !== undefined && imported.lng !== undefined}>
            <div class="mt-5 border border-[#dce7d5]/35 p-4">
              <p class="font-mono text-[10px] uppercase tracking-[0.16em] text-[#bfd0c2]">
                {imported.locationConfidence === 'approx'
                  ? 'Approximate location'
                  : 'Location'}
              </p>
              <a
                class="mt-2 block font-bold underline"
                href={`https://www.google.com/maps/dir/?api=1&destination=${imported.lat},${imported.lng}`}
                target="_blank"
                rel="noreferrer"
              >
                {imported.lat}, {imported.lng} · Open directions
              </a>
            </div>
          </Show>
          <a
            class="mt-6 inline-block text-sm font-bold underline"
            href={imported.url}
            target="_blank"
            rel="noreferrer"
          >
            Open original advert
          </a>
        </aside>
        <section class="border border-[#17231d]/15 bg-white p-6 sm:p-9">
          <Show when={reimporting}>
            <p class="mb-6 border-l-4 border-[#d96a45] bg-[#fff1eb] p-4 text-sm">
              This advert is already saved. Saving refreshes only its Source
              Listing context. Candidate Plot details below are shown only for
              reference and stay unchanged.
            </p>
          </Show>
          <p class="font-mono text-[10px] font-bold uppercase tracking-[0.18em] text-[#607067]">
            Default Candidate Plot
          </p>
          <h2 class="mt-2 font-serif text-3xl">Check the useful bits</h2>
          <div class="mt-7 grid gap-5 sm:grid-cols-2">
            <Field
              label="Price"
              value={price()}
              onInput={setPrice}
              prefix="€"
              inputMode="decimal"
              readOnly={reimporting}
            />
            <Field
              label="Area"
              value={area()}
              onInput={setArea}
              suffix="a"
              inputMode="decimal"
              readOnly={reimporting}
            />
            <Field
              label="Purpose"
              value={purpose()}
              onInput={setPurpose}
              readOnly={reimporting}
            />
            <Field
              label="Address"
              value={address()}
              onInput={setAddress}
              readOnly={reimporting}
            />
          </div>
          <Show when={!reimporting}>
            <button
              class="mt-6 flex w-full justify-between border-y border-[#17231d]/15 py-4 text-left font-bold"
              onClick={() => setAdvanced(!advanced())}
            >
              <span>
                Location clues{' '}
                <small class="font-normal text-[#607067]">optional</small>
              </span>
              <span>{advanced() ? '−' : '+'}</span>
            </button>
            <Show when={advanced()}>
              <div class="mt-5 grid gap-5 sm:grid-cols-2">
                <Field
                  label="Unique parcel number"
                  value={parcel()}
                  onInput={setParcel}
                />
                <Field
                  label="Latitude"
                  value={lat()}
                  onInput={setLat}
                  inputMode="decimal"
                />
                <Field
                  label="Longitude"
                  value={lng()}
                  onInput={setLng}
                  inputMode="decimal"
                />
              </div>
            </Show>
            <label class="mt-6 block text-sm font-bold">
              Note <span class="font-normal text-[#607067]">optional</span>
              <textarea
                name="notes"
                class="mt-2 h-24 w-full border border-[#17231d]/25 p-3 outline-none focus:border-[#315f73]"
                value={notes()}
                onInput={(event) => setNotes(event.currentTarget.value)}
              />
            </label>
          </Show>
          <Show when={error()}>
            <p class="mt-4 text-sm font-bold text-[#a13d22]">{error()}</p>
          </Show>
          <button
            class="mt-7 w-full bg-[#24483a] px-5 py-4 font-bold text-white disabled:opacity-50"
            disabled={busy()}
            onClick={save}
          >
            {busy()
              ? 'Saving…'
              : !reimporting
                ? 'Save Source Listing and Candidate Plot'
                : 'Update Source Listing'}
          </button>
          <p class="mt-3 text-center text-xs text-[#607067]">
            Blank fields are saved as unknown. Nothing optional blocks saving.
          </p>
        </section>
      </div>
    </div>
  )
}

function Field(props: {
  label: string
  value: string
  onInput: (value: string) => void
  prefix?: string
  suffix?: string
  inputMode?: 'decimal'
  readOnly?: boolean
}) {
  const name = () => props.label.toLowerCase().replace(/\s+/g, '-')
  return (
    <label class="block text-sm font-bold">
      {props.label}
      <span class="mt-2 flex items-center border border-[#17231d]/25 px-3 focus-within:border-[#315f73]">
        <Show when={props.prefix}>
          <span class="text-[#607067]">{props.prefix}</span>
        </Show>
        <input
          name={name()}
          class="min-w-0 flex-1 bg-transparent px-2 py-3 font-normal outline-none"
          value={props.value}
          inputmode={props.inputMode}
          readonly={props.readOnly}
          onInput={(event) => props.onInput(event.currentTarget.value)}
        />
        <Show when={props.suffix}>
          <span class="text-[#607067]">{props.suffix}</span>
        </Show>
      </span>
    </label>
  )
}
const optionalText = (value: string) => value.trim() || null
const parseOptionalNumber = (value: string, label: string) => {
  if (!value.trim()) return null
  const parsed = Number(value.replace(',', '.'))
  if (!Number.isFinite(parsed)) throw new Error(`${label} must be a number.`)
  return parsed
}
