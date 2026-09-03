import { For, Show, createEffect, createMemo, createSignal } from 'solid-js'
import { HouseholdHeader } from '../components/HouseholdHeader'
import { useHousehold } from '../households/context'
import type { ImportInboxRecord } from '../imports/inbox-model'
import { useImport } from '../imports/context'
import { paths } from '../paths'

export const preloadImportInbox = () => undefined

export default function ImportInboxPage() {
  const household = useHousehold()
  const imports = useImport()
  const items = createMemo(() => household.listImportInbox())
  const [summary, setSummary] = createSignal('')
  const [error, setError] = createSignal('')

  let consumed = false
  createEffect(
    () => imports.draft(),
    (transport) => {
      if (consumed || transport?.kind !== 'favorites') return
      consumed = true
      void household
        .captureImportInbox(transport.items)
        .then((result) => {
          const parts = [
            `Added ${result.added}`,
            `refreshed ${result.refreshed}`,
            `already imported ${result.alreadyImported}`,
            `skipped ${transport.skippedNonLand} non-land`,
            `skipped ${transport.skippedInactive} inactive`,
            `could not read ${transport.unreadable}`,
          ]
          setSummary(parts.join(' · '))
          imports.clear()
        })
        .catch((caught: unknown) => {
          consumed = false
          setError(caught instanceof Error ? caught.message : String(caught))
        })
    },
  )

  return (
    <main class="min-h-screen bg-[#edf0ea] px-4 pb-16 pt-4 text-[#18241e] sm:px-8 sm:pt-8">
      <div class="mx-auto max-w-4xl overflow-hidden border border-[#18241e] bg-[#faf9f4]">
        <header class="flex flex-wrap items-center justify-between gap-3 border-b border-[#18241e] px-4 py-4 sm:px-7">
          <HouseholdHeader />
          <a class="font-mono text-xs font-bold underline" href={paths.home}>
            Saved Source Listings
          </a>
        </header>

        <section class="border-b border-[#18241e] px-5 py-7 sm:px-8">
          <p class="font-mono text-[10px] uppercase tracking-[0.2em] text-[#647169]">
            Shared Household work
          </p>
          <h1 class="mt-2 font-serif text-4xl">Import Inbox</h1>
          <p class="mt-2 max-w-2xl text-sm text-[#647169]">
            Open an advert, run the same Aruodas bookmarklet, and save its
            detailed Source Listing. It will then disappear from this inbox.
          </p>
        </section>

        <Show when={summary()}>
          <div class="flex items-start justify-between gap-4 border-b border-[#18241e] bg-[#e7d9b8] px-5 py-4 text-sm sm:px-8">
            <p>{summary()}</p>
            <button class="font-bold underline" onClick={() => setSummary('')}>
              Dismiss
            </button>
          </div>
        </Show>
        <Show when={error()}>
          <p
            class="border-b border-[#18241e] bg-[#f1d4ca] px-5 py-4 text-sm"
            role="alert"
          >
            {error()}
          </p>
        </Show>

        <Show
          when={items().length > 0}
          fallback={
            <section class="px-5 py-16 text-center sm:px-8">
              <h2 class="font-serif text-2xl">Import Inbox is empty</h2>
              <p class="mt-2 text-sm text-[#647169]">
                Run the Aruodas bookmarklet on your favorites page to add land
                adverts.
              </p>
              <a
                class="mt-5 inline-block font-bold underline"
                href={paths.home}
              >
                Return to saved Source Listings
              </a>
            </section>
          }
        >
          <For each={items()}>{(item) => <InboxRow item={item} />}</For>
        </Show>
      </div>
    </main>
  )
}

function InboxRow(props: { item: ImportInboxRecord }) {
  const household = useHousehold()
  const [busy, setBusy] = createSignal(false)
  const [error, setError] = createSignal('')
  const advertUrl = () =>
    `https://www.aruodas.lt/${encodeURIComponent(props.item.sourceId)}/#find-me-home-return=import-inbox`

  return (
    <article class="grid gap-4 border-b border-[#18241e]/30 px-5 py-5 last:border-b-0 sm:grid-cols-[8rem_1fr_auto] sm:px-8">
      <Show
        when={props.item.thumbnail}
        fallback={<div class="aspect-[4/3] bg-[#dfe4dc]" aria-hidden="true" />}
      >
        {(thumbnail) => (
          <img
            class="aspect-[4/3] w-full object-cover"
            src={thumbnail()}
            alt=""
          />
        )}
      </Show>
      <div>
        <h2 class="font-serif text-xl">
          {props.item.title || 'Aruodas land advert'}
        </h2>
        <Show when={props.item.description}>
          <p class="mt-1 text-sm text-[#647169]">{props.item.description}</p>
        </Show>
        <div class="mt-3 flex flex-wrap gap-3 font-mono text-xs">
          <Show when={props.item.priceEur !== undefined}>
            <span>{formatPrice(props.item.priceEur!)}</span>
          </Show>
          <Show when={props.item.areaAres !== undefined}>
            <span>{props.item.areaAres} a</span>
          </Show>
          <span class="text-[#647169]">{props.item.sourceId}</span>
        </div>
      </div>
      <div class="flex items-start gap-3 sm:flex-col sm:items-stretch">
        <a
          class="bg-[#204d3a] px-4 py-2 text-center text-sm font-bold text-white"
          href={advertUrl()}
        >
          Open advert
        </a>
        <button
          class="px-4 py-2 text-sm font-bold underline disabled:opacity-50"
          disabled={busy()}
          onClick={async () => {
            setBusy(true)
            setError('')
            try {
              await household.removeImportInbox(props.item.id)
            } catch (caught) {
              setError(
                caught instanceof Error ? caught.message : String(caught),
              )
              setBusy(false)
            }
          }}
        >
          Remove
        </button>
        <Show when={error()}>
          <p class="text-xs text-[#a13d22]" role="alert">
            {error()}
          </p>
        </Show>
      </div>
    </article>
  )
}

const formatPrice = (value: number) =>
  new Intl.NumberFormat('lt-LT', {
    style: 'currency',
    currency: 'EUR',
    maximumFractionDigits: 0,
  }).format(value)
