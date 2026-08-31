import { createFileRoute } from '@tanstack/solid-router'
import { For, Show, createSignal, onCleanup } from 'solid-js'

export const Route = createFileRoute('/capture-prototype')({
  component: CapturePrototype,
})

type VariantKey = 'A' | 'B' | 'C'
type Step = 'review' | 'details' | 'location' | 'plot' | 'saved'

const variants: Array<{ key: VariantKey; name: string }> = [
  { key: 'A', name: 'One question at a time' },
  { key: 'B', name: 'Review sheet' },
  { key: 'C', name: 'Source and plot' },
]

const imported = {
  title: 'Namų valdos sklypas, Vilniaus r. sav., Kalikstiškės',
  price: '€42,000',
  area: '15 a',
  address: 'Kalikstiškių k., Vilniaus r.',
  coordinates: '54.81241, 25.40862',
  parcelNumber: '',
  purpose: 'Namų valda',
}

function CapturePrototype() {
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
    <main class="min-h-screen bg-[#f4f1e8] text-[#243128]">
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

function VariantA() {
  const steps: Array<{ key: Step; label: string }> = [
    { key: 'review', label: 'Imported' },
    { key: 'details', label: 'Details' },
    { key: 'location', label: 'Location' },
    { key: 'plot', label: 'Plot' },
    { key: 'saved', label: 'Saved' },
  ]
  const [step, setStep] = createSignal<Step>('review')
  const [notes, setNotes] = createSignal('')
  const [parcelNumber, setParcelNumber] = createSignal('')
  const [coordinates, setCoordinates] = createSignal(imported.coordinates)
  const index = () => steps.findIndex((item) => item.key === step())
  const next = () => setStep(steps[Math.min(index() + 1, steps.length - 1)].key)

  return (
    <div class="mx-auto flex min-h-screen max-w-3xl flex-col px-5 pb-28 pt-6 sm:px-10 sm:pt-10">
      <PrototypeHeader
        eyebrow="CAPTURE 01"
        title="Bring this land into focus"
      />
      <nav class="mt-8 flex items-center gap-2" aria-label="Capture progress">
        <For each={steps}>
          {(item, itemIndex) => (
            <>
              <button
                class={`grid size-8 place-items-center rounded-full text-xs font-bold ${itemIndex() <= index() ? 'bg-[#315d45] text-white' : 'bg-white text-[#829087]'}`}
                onClick={() => setStep(item.key)}
              >
                {itemIndex() + 1}
              </button>
              <Show when={itemIndex() < steps.length - 1}>
                <span class="h-px flex-1 bg-[#cbd1c8]" />
              </Show>
            </>
          )}
        </For>
      </nav>

      <section class="mt-8 flex-1 rounded-[2rem] bg-white p-6 shadow-[0_18px_60px_rgba(45,62,49,0.1)] sm:p-10">
        <Show when={step() === 'review'}>
          <StepHeading
            count="1 of 4"
            title="Does this look like the right advert?"
          />
          <div class="mt-7 overflow-hidden rounded-2xl border border-[#dfe4dc]">
            <div class="h-40 bg-[linear-gradient(135deg,#769278,#d3c69d)] p-5 text-sm font-semibold text-white">
              ARUODAS.LT
            </div>
            <div class="p-5">
              <h2 class="text-xl font-bold">{imported.title}</h2>
              <div class="mt-4 flex gap-5 text-lg font-semibold">
                <span>{imported.price}</span>
                <span>{imported.area}</span>
              </div>
              <a
                class="mt-5 inline-block text-sm font-semibold text-[#315d45] underline"
                href="https://www.aruodas.lt"
                target="_blank"
              >
                Open original advert
              </a>
            </div>
          </div>
          <PrimaryAction label="Yes, continue" onClick={next} />
        </Show>

        <Show when={step() === 'details'}>
          <StepHeading
            count="2 of 4"
            title="Anything you want to remember?"
            subtitle="Everything here is optional."
          />
          <label class="mt-8 block text-sm font-bold">Household note</label>
          <textarea
            class="mt-2 h-36 w-full rounded-2xl border border-[#cbd1c8] p-4 outline-none focus:border-[#315d45]"
            placeholder="Quiet road, owner mentioned electricity nearby..."
            value={notes()}
            onInput={(event) => setNotes(event.currentTarget.value)}
          />
          <div class="mt-4 grid grid-cols-2 gap-3">
            <ReadOnlyFact label="Purpose" value={imported.purpose} />
            <ReadOnlyFact label="Imported area" value={imported.area} />
          </div>
          <PrimaryAction
            label={notes() ? 'Keep note and continue' : 'Skip and continue'}
            onClick={next}
          />
        </Show>

        <Show when={step() === 'location'}>
          <StepHeading
            count="3 of 4"
            title="Where is the land?"
            subtitle="Correct only what you know. We will use the first clue that works."
          />
          <Field
            label="Unique parcel number (best clue)"
            value={parcelNumber()}
            placeholder="Leave empty if unknown"
            onInput={setParcelNumber}
          />
          <Field
            label="Coordinates"
            value={coordinates()}
            onInput={setCoordinates}
          />
          <ReadOnlyFact label="Imported address" value={imported.address} />
          <p class="mt-5 rounded-xl bg-[#eef4ed] p-4 text-sm text-[#315d45]">
            Effective Location will use{' '}
            {parcelNumber()
              ? 'the parcel number'
              : coordinates()
                ? 'the coordinates'
                : 'the address'}
            .
          </p>
          <PrimaryAction label="Use these clues" onClick={next} />
        </Show>

        <Show when={step() === 'plot'}>
          <StepHeading
            count="4 of 4"
            title="Save the Candidate Plot"
            subtitle="One Candidate Plot is ready. You can add another after saving."
          />
          <div class="mt-8 rounded-2xl border-2 border-[#315d45] p-5">
            <div class="text-xs font-bold tracking-[0.18em] text-[#567160]">
              CANDIDATE PLOT 1
            </div>
            <input
              class="mt-3 w-full border-0 p-0 text-2xl font-bold outline-none"
              value="15 a plot"
            />
            <div class="mt-5 grid grid-cols-2 gap-3">
              <ReadOnlyFact label="Price" value={imported.price} />
              <ReadOnlyFact label="Area" value={imported.area} />
            </div>
          </div>
          <PrimaryAction label="Save Candidate Plot" onClick={next} />
        </Show>

        <Show when={step() === 'saved'}>
          <div class="grid min-h-96 place-items-center text-center">
            <div>
              <div class="mx-auto grid size-20 place-items-center rounded-full bg-[#315d45] text-4xl text-white">
                ✓
              </div>
              <h2 class="mt-6 text-3xl font-bold">Candidate Plot saved</h2>
              <p class="mt-3 text-[#607067]">
                Automatic Checks can run now. Missing details can wait.
              </p>
              <button
                class="mt-8 w-full rounded-2xl border-2 border-[#315d45] px-5 py-4 font-bold text-[#315d45]"
                onClick={() => setStep('plot')}
              >
                Add another Candidate Plot
              </button>
              <button class="mt-3 w-full px-5 py-3 font-semibold text-[#607067]">
                Go to Source Listing
              </button>
            </div>
          </div>
        </Show>
      </section>
    </div>
  )
}

function VariantB() {
  const [saved, setSaved] = createSignal(false)
  const [advanced, setAdvanced] = createSignal(false)
  const [coordinates, setCoordinates] = createSignal(imported.coordinates)
  return (
    <div class="mx-auto min-h-screen max-w-6xl px-5 pb-32 pt-6 sm:px-10 sm:pt-10">
      <PrototypeHeader eyebrow="ARUODAS IMPORT" title="Review before saving" />
      <div class="mt-8 grid gap-6 lg:grid-cols-[0.8fr_1.2fr]">
        <aside class="rounded-3xl bg-[#25372b] p-6 text-white lg:sticky lg:top-8 lg:self-start">
          <div class="text-xs font-bold tracking-[0.2em] text-[#b8c9ba]">
            SOURCE LISTING
          </div>
          <div class="mt-5 h-44 rounded-2xl bg-[linear-gradient(145deg,#53745b,#c8b980)]" />
          <h2 class="mt-5 text-xl font-bold">{imported.title}</h2>
          <div class="mt-4 flex gap-5 text-lg">
            <b>{imported.price}</b>
            <b>{imported.area}</b>
          </div>
          <p class="mt-5 text-sm text-[#ced8cf]">
            Imported seconds ago from the advert currently open in Chrome.
          </p>
          <Show when={coordinates().trim()}>
            <div class="relative mt-6 h-52 overflow-hidden rounded-2xl bg-[#d9dfd2] text-[#25372b]">
              <div class="absolute inset-0 opacity-50 [background-image:linear-gradient(32deg,transparent_47%,#f8f5e9_48%,#f8f5e9_52%,transparent_53%),linear-gradient(105deg,transparent_47%,#b7c8b4_48%,#b7c8b4_51%,transparent_52%)] [background-size:74px_61px,91px_83px]" />
              <div class="absolute left-[55%] top-[44%] size-7 -translate-x-1/2 -translate-y-1/2 rounded-full border-[7px] border-[#315d45] bg-white shadow-lg" />
              <div class="absolute inset-x-3 bottom-3 flex items-center justify-between rounded-xl bg-white/95 px-3 py-2 text-xs shadow-sm">
                <span class="font-bold">Approximate location</span>
                <span class="font-mono text-[10px] text-[#607067]">
                  {coordinates()}
                </span>
              </div>
            </div>
          </Show>
        </aside>
        <section class="rounded-3xl bg-white p-6 shadow-[0_18px_60px_rgba(45,62,49,0.1)] sm:p-9">
          <Show
            when={!saved()}
            fallback={<SavedPanel onAdd={() => setSaved(false)} />}
          >
            <div class="flex items-start justify-between gap-4">
              <div>
                <div class="text-xs font-bold tracking-[0.18em] text-[#708077]">
                  CANDIDATE PLOT 1
                </div>
                <h2 class="mt-2 text-2xl font-bold">Check the useful bits</h2>
              </div>
              <span class="rounded-full bg-[#eef4ed] px-3 py-1 text-xs font-bold text-[#315d45]">
                Draft
              </span>
            </div>
            <div class="mt-7 grid gap-5 sm:grid-cols-2">
              <Field label="Price" value="42000" prefix="€" />
              <Field label="Area" value="15" suffix="a" />
              <Field label="Purpose" value={imported.purpose} />
              <Field label="Address" value={imported.address} />
            </div>
            <button
              class="mt-6 flex w-full items-center justify-between border-y border-[#dfe4dc] py-4 text-left font-bold"
              onClick={() => setAdvanced((value) => !value)}
            >
              <span>
                Location clues{' '}
                <small class="ml-2 font-normal text-[#708077]">optional</small>
              </span>
              <span>{advanced() ? '−' : '+'}</span>
            </button>
            <Show when={advanced()}>
              <div class="mt-5 grid gap-5 sm:grid-cols-2">
                <Field
                  label="Unique parcel number"
                  value=""
                  placeholder="Unknown"
                />
                <Field
                  label="Coordinates"
                  value={imported.coordinates}
                  onInput={setCoordinates}
                />
              </div>
              <p class="mt-3 text-sm text-[#708077]">
                Parcel number wins over coordinates; coordinates win over
                address.
              </p>
            </Show>
            <label class="mt-6 block text-sm font-bold">
              Note <span class="font-normal text-[#708077]">(optional)</span>
            </label>
            <textarea class="mt-2 h-24 w-full rounded-xl border border-[#cbd1c8] p-3" />
            <button
              class="mt-7 w-full rounded-xl bg-[#315d45] px-5 py-4 font-bold text-white"
              onClick={() => setSaved(true)}
            >
              Save Source Listing and Candidate Plot
            </button>
            <p class="mt-3 text-center text-xs text-[#708077]">
              Blank fields are saved as unknown. Nothing here blocks saving.
            </p>
          </Show>
        </section>
      </div>
    </div>
  )
}

function VariantC() {
  const [mode, setMode] = createSignal<'source' | 'plot' | 'saved'>('source')
  const [location, setLocation] = createSignal(imported.address)
  return (
    <div class="min-h-screen pb-28">
      <header class="border-b border-[#d3d8d0] bg-white px-5 py-5 sm:px-10">
        <div class="mx-auto flex max-w-5xl items-center justify-between">
          <b class="font-serif text-xl">Find Me Home</b>
          <span class="text-sm text-[#708077]">New from Aruodas</span>
        </div>
      </header>
      <div class="mx-auto max-w-5xl px-5 py-8 sm:px-10">
        <div class="grid gap-2 rounded-2xl bg-[#e7e4d9] p-1 sm:grid-cols-2">
          <button
            class={`rounded-xl px-4 py-3 text-sm font-bold ${mode() === 'source' ? 'bg-white shadow-sm' : ''}`}
            onClick={() => setMode('source')}
          >
            1. Source Listing
          </button>
          <button
            class={`rounded-xl px-4 py-3 text-sm font-bold ${mode() !== 'source' ? 'bg-white shadow-sm' : ''}`}
            onClick={() => setMode('plot')}
          >
            2. Candidate Plot
          </button>
        </div>
        <Show when={mode() === 'source'}>
          <section class="mt-6 rounded-3xl bg-white p-6 sm:p-9">
            <div class="flex flex-col gap-6 sm:flex-row">
              <div class="h-36 rounded-2xl bg-[linear-gradient(145deg,#6b886c,#d2c494)] sm:w-48" />
              <div class="flex-1">
                <div class="text-xs font-bold tracking-[0.18em] text-[#708077]">
                  IMPORTED SOURCE LISTING
                </div>
                <h1 class="mt-2 text-2xl font-bold">{imported.title}</h1>
                <div class="mt-3 flex gap-4 text-lg font-bold">
                  <span>{imported.price}</span>
                  <span>{imported.area}</span>
                </div>
              </div>
            </div>
            <div class="mt-8 border-t border-[#dfe4dc] pt-6">
              <h2 class="text-lg font-bold">Location clue</h2>
              <p class="mt-1 text-sm text-[#708077]">
                Keep the imported address or replace it with a clue you trust
                more.
              </p>
              <input
                class="mt-4 w-full rounded-xl border border-[#cbd1c8] px-4 py-3"
                value={location()}
                onInput={(event) => setLocation(event.currentTarget.value)}
              />
            </div>
            <PrimaryAction
              label="Continue to Candidate Plot"
              onClick={() => setMode('plot')}
            />
          </section>
        </Show>
        <Show when={mode() === 'plot'}>
          <section class="mt-6 rounded-3xl bg-white p-6 sm:p-9">
            <div class="text-xs font-bold tracking-[0.18em] text-[#708077]">
              DEFAULT CANDIDATE PLOT
            </div>
            <h1 class="mt-2 text-2xl font-bold">The purchasable option</h1>
            <p class="mt-2 text-sm text-[#708077]">
              We made one from the Source Listing. Change it only if the advert
              sells something different.
            </p>
            <div class="mt-7 grid gap-5 sm:grid-cols-2">
              <Field label="Name" value="15 a plot" />
              <Field label="Area" value="15" suffix="a" />
              <Field label="Price" value="42000" prefix="€" />
              <Field label="Purpose" value={imported.purpose} />
            </div>
            <details class="mt-6 rounded-xl border border-[#dfe4dc] p-4">
              <summary class="cursor-pointer font-bold">
                Optional note and parcel number
              </summary>
              <div class="mt-5 grid gap-5 sm:grid-cols-2">
                <Field label="Note" value="" />
                <Field label="Unique parcel number" value="" />
              </div>
            </details>
            <PrimaryAction
              label="Save both records"
              onClick={() => setMode('saved')}
            />
          </section>
        </Show>
        <Show when={mode() === 'saved'}>
          <section class="mt-6">
            <SavedPanel onAdd={() => setMode('plot')} />
          </section>
        </Show>
      </div>
    </div>
  )
}

function PrototypeHeader(props: { eyebrow: string; title: string }) {
  return (
    <header>
      <div class="text-xs font-bold tracking-[0.22em] text-[#6d7c72]">
        {props.eyebrow}
      </div>
      <h1 class="mt-2 max-w-2xl font-serif text-3xl font-bold leading-tight sm:text-5xl">
        {props.title}
      </h1>
    </header>
  )
}

function StepHeading(props: {
  count: string
  title: string
  subtitle?: string
}) {
  return (
    <header>
      <div class="text-xs font-bold tracking-[0.18em] text-[#708077]">
        {props.count}
      </div>
      <h2 class="mt-2 font-serif text-3xl font-bold">{props.title}</h2>
      <Show when={props.subtitle}>
        <p class="mt-3 text-[#607067]">{props.subtitle}</p>
      </Show>
    </header>
  )
}

function Field(props: {
  label: string
  value: string
  placeholder?: string
  prefix?: string
  suffix?: string
  onInput?: (value: string) => void
}) {
  const [value, setValue] = createSignal(props.value)
  return (
    <label class="block">
      <span class="text-sm font-bold">{props.label}</span>
      <div class="mt-2 flex items-center rounded-xl border border-[#cbd1c8] bg-white px-3 focus-within:border-[#315d45]">
        <Show when={props.prefix}>
          <span class="text-[#708077]">{props.prefix}</span>
        </Show>
        <input
          class="min-w-0 flex-1 border-0 bg-transparent px-2 py-3 outline-none"
          value={value()}
          placeholder={props.placeholder}
          onInput={(event) => {
            setValue(event.currentTarget.value)
            props.onInput?.(event.currentTarget.value)
          }}
        />
        <Show when={props.suffix}>
          <span class="text-[#708077]">{props.suffix}</span>
        </Show>
      </div>
    </label>
  )
}

function ReadOnlyFact(props: { label: string; value: string }) {
  return (
    <div class="rounded-xl bg-[#f2f3ee] p-4">
      <div class="text-xs font-bold uppercase tracking-wider text-[#708077]">
        {props.label}
      </div>
      <div class="mt-1 font-semibold">{props.value}</div>
    </div>
  )
}

function PrimaryAction(props: { label: string; onClick: () => void }) {
  return (
    <button
      class="mt-8 w-full rounded-2xl bg-[#315d45] px-5 py-4 font-bold text-white shadow-[0_8px_20px_rgba(49,93,69,0.2)] hover:bg-[#264b37]"
      onClick={props.onClick}
    >
      {props.label} <span class="ml-2">→</span>
    </button>
  )
}

function SavedPanel(props: { onAdd: () => void }) {
  return (
    <div class="grid min-h-96 place-items-center rounded-3xl bg-white p-8 text-center">
      <div>
        <div class="mx-auto grid size-20 place-items-center rounded-full bg-[#315d45] text-4xl text-white">
          ✓
        </div>
        <h2 class="mt-6 font-serif text-3xl font-bold">Saved without fuss</h2>
        <p class="mx-auto mt-3 max-w-md text-[#607067]">
          The Source Listing and its first Candidate Plot are ready. Automatic
          Checks can fill in later.
        </p>
        <button
          class="mt-8 rounded-xl border-2 border-[#315d45] px-6 py-3 font-bold text-[#315d45]"
          onClick={props.onAdd}
        >
          Add another Candidate Plot
        </button>
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
    <div class="fixed bottom-4 left-1/2 z-[1000] flex -translate-x-1/2 items-center gap-3 rounded-full bg-[#17221a] p-2 text-white shadow-2xl">
      <button
        class="grid size-10 place-items-center rounded-full hover:bg-white/10"
        aria-label="Previous variant"
        onClick={props.onPrevious}
      >
        ←
      </button>
      <div class="min-w-44 text-center text-xs font-bold">
        {current().key} · {current().name}
      </div>
      <button
        class="grid size-10 place-items-center rounded-full hover:bg-white/10"
        aria-label="Next variant"
        onClick={props.onNext}
      >
        →
      </button>
    </div>
  )
}
