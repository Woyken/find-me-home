import { revalidate } from '@solidjs/router'
import { For, Show, createMemo, createSignal } from 'solid-js'
import { VisitPlanMap } from '../components/VisitPlanMap'
import {
  reorderVisitPlan,
  updateVisitPlan,
} from '../server-functions/source-listings'
import type { SourceListingSummary } from '../server/source-listings'
import { paths } from '../paths'
import { visitPlanQuery } from '../queries'
import { formatArea, formatDate, formatPrice } from './index'

export const preloadVisitPlan = () => void visitPlanQuery()

export default function VisitPlanPage() {
  const plan = createMemo(() => visitPlanQuery())
  const [busyId, setBusyId] = createSignal<number | null>(null)
  const [view, setView] = createSignal<'list' | 'map'>('list')

  const move = async (index: number, offset: -1 | 1) => {
    const destination = index + offset
    if (destination < 0 || destination >= plan().length) return
    const ids = plan().map((item) => item.id)
    ;[ids[index], ids[destination]] = [ids[destination], ids[index]]
    setBusyId(ids[destination] ?? null)
    try {
      await reorderVisitPlan({ data: { ids } })
      await revalidate()
    } finally {
      setBusyId(null)
    }
  }

  const remove = async (id: number) => {
    setBusyId(id)
    try {
      await updateVisitPlan({ data: { id, included: false } })
      await revalidate()
    } finally {
      setBusyId(null)
    }
  }

  return (
    <main class="min-h-screen bg-[#edf0ea] px-4 py-6 text-[#18241e] sm:px-8 sm:py-10">
      <div class="mx-auto max-w-5xl">
        <a class="text-sm font-bold text-[#315f73] underline" href={paths.home}>
          ← Saved Source Listings
        </a>

        <header class="mt-7 border-y border-[#18241e] bg-[#faf9f4] px-5 py-7 sm:flex sm:items-end sm:justify-between sm:px-8">
          <div>
            <p class="font-mono text-[10px] font-bold uppercase tracking-[0.2em] text-[#647169]">
              One ordered list
            </p>
            <h1 class="mt-2 font-serif text-4xl sm:text-5xl">Visit Plan</h1>
          </div>
          <div class="mt-4 flex items-center gap-4 sm:mt-0">
            <p class="font-mono text-xs">
              {plan().length} {plan().length === 1 ? 'stop' : 'stops'}
            </p>
            <div
              class="flex border border-[#18241e]"
              aria-label="Visit Plan view"
            >
              <ViewButton
                selected={view() === 'list'}
                onClick={() => setView('list')}
              >
                List
              </ViewButton>
              <ViewButton
                selected={view() === 'map'}
                onClick={() => setView('map')}
              >
                Map
              </ViewButton>
            </div>
          </div>
        </header>

        <Show
          when={plan().length > 0}
          fallback={
            <section class="border-b border-[#18241e] bg-[#faf9f4] px-5 py-14 text-center sm:px-8">
              <h2 class="font-serif text-2xl">No visits planned yet</h2>
              <p class="mx-auto mt-2 max-w-md text-sm text-[#647169]">
                Add Source Listings from your saved collection. The first one
                you add becomes the first stop.
              </p>
              <a
                class="mt-6 inline-block bg-[#204d3a] px-5 py-3 text-sm font-bold text-white"
                href={paths.home}
              >
                Choose Source Listings
              </a>
            </section>
          }
        >
          <Show
            when={view() === 'list'}
            fallback={<VisitPlanMap listings={plan()} />}
          >
            <ol class="border-b border-[#18241e] bg-[#faf9f4]">
              <For each={plan()}>
                {(listing, index) => (
                  <VisitPlanEntry
                    listing={listing}
                    index={index()}
                    count={plan().length}
                    busy={busyId() !== null}
                    onMove={(offset) => move(index(), offset)}
                    onRemove={() => remove(listing.id)}
                  />
                )}
              </For>
            </ol>
          </Show>
        </Show>
      </div>
    </main>
  )
}

function ViewButton(props: {
  selected: boolean
  onClick: () => void
  children: string
}) {
  return (
    <button
      class={`min-h-11 px-4 text-sm font-bold ${props.selected ? 'bg-[#18241e] text-white' : 'bg-[#faf9f4]'}`}
      aria-pressed={props.selected ? 'true' : 'false'}
      onClick={props.onClick}
    >
      {props.children}
    </button>
  )
}

function VisitPlanEntry(props: {
  listing: SourceListingSummary
  index: number
  count: number
  busy: boolean
  onMove: (offset: -1 | 1) => void
  onRemove: () => void
}) {
  const name = () =>
    props.listing.title ?? `Aruodas advert ${props.listing.sourceId}`

  return (
    <li class="grid gap-5 border-b border-[#18241e]/25 px-5 py-6 last:border-0 sm:grid-cols-[3rem_minmax(0,1fr)_auto] sm:items-center sm:px-8">
      <div class="flex items-baseline gap-2 sm:block">
        <span class="font-serif text-3xl">{props.index + 1}</span>
        <span class="font-mono text-[9px] uppercase tracking-wider text-[#647169] sm:block">
          Stop
        </span>
      </div>

      <div class="min-w-0">
        <p class="font-mono text-[9px] uppercase tracking-wider text-[#647169]">
          Aruodas {props.listing.sourceId} · {props.listing.candidatePlotCount}{' '}
          {props.listing.candidatePlotCount === 1 ? 'plot' : 'plots'}
        </p>
        <a
          class="mt-1 block font-serif text-2xl leading-tight hover:underline"
          href={paths.sourceListing(props.listing.id)}
        >
          {name()}
        </a>
        <p class="mt-2 text-sm text-[#526058]">
          {props.listing.locationLabel ?? 'Location unknown'}
        </p>
        <div class="mt-3 flex flex-wrap gap-x-5 gap-y-1 text-sm">
          <b>{formatPrice(props.listing.priceEur)}</b>
          <b>{formatArea(props.listing.areaAres)}</b>
          <Show when={props.listing.visitedAt}>
            <span class="text-[#647169]">
              Last visited {formatDate(props.listing.visitedAt)}
            </span>
          </Show>
        </div>
      </div>

      <div class="grid grid-cols-3 gap-2 sm:grid-cols-2">
        <button
          aria-label={`Move ${name()} up`}
          class="min-h-11 border border-[#849087] px-4 py-2 text-sm font-bold disabled:cursor-not-allowed disabled:opacity-30"
          disabled={props.busy || props.index === 0}
          onClick={() => props.onMove(-1)}
        >
          ↑ <span class="sr-only">Move up</span>
        </button>
        <button
          aria-label={`Move ${name()} down`}
          class="min-h-11 border border-[#849087] px-4 py-2 text-sm font-bold disabled:cursor-not-allowed disabled:opacity-30"
          disabled={props.busy || props.index === props.count - 1}
          onClick={() => props.onMove(1)}
        >
          ↓ <span class="sr-only">Move down</span>
        </button>
        <button
          class="min-h-11 border border-[#a84f36] px-3 py-2 text-xs font-bold text-[#8b3f2c] disabled:opacity-50 sm:col-span-2"
          disabled={props.busy}
          onClick={props.onRemove}
        >
          Remove
        </button>
      </div>
    </li>
  )
}
