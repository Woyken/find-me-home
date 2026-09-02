import { For, Show, createMemo, createSignal } from 'solid-js'
import { VisitPlanMap } from '../components/VisitPlanMap'
import { useHousehold } from '../households/context'
import { paths } from '../paths'

export const preloadVisitPlan = () => undefined

export default function VisitPlanPage() {
  const household = useHousehold()
  const [busy, setBusy] = createSignal(false)
  const [view, setView] = createSignal<'list' | 'map'>('list')
  const plan = createMemo(() => household.getVisitPlan())
  const listings = createMemo(() =>
    plan().sourceListingIds.flatMap((id) => {
      const listing = household.getSourceListing(id)
      return listing ? [listing] : []
    }),
  )
  const replacePlan = async (ids: string[]) => {
    setBusy(true)
    try {
      await household.setVisitPlan(ids)
    } finally {
      setBusy(false)
    }
  }
  const move = (index: number, offset: -1 | 1) => {
    const destination = index + offset
    if (destination < 0 || destination >= plan().sourceListingIds.length) return
    const ids = [...plan().sourceListingIds]
    ;[ids[index], ids[destination]] = [ids[destination], ids[index]]
    void replacePlan(ids)
  }

  return (
    <main class="min-h-screen bg-[#edf0ea] px-4 py-6 text-[#18241e] sm:px-8 sm:py-10">
      <div class="mx-auto max-w-5xl">
        <a class="text-sm font-bold text-[#315f73] underline" href={paths.home}>
          Saved Source Listings
        </a>
        <header class="mt-7 flex flex-wrap items-end justify-between gap-5 border-y border-[#18241e] bg-[#faf9f4] px-5 py-7 sm:px-8">
          <div>
            <p class="font-mono text-[10px] font-bold uppercase tracking-[0.2em] text-[#647169]">
              One ordered list
            </p>
            <h1 class="mt-2 font-serif text-4xl sm:text-5xl">Visit Plan</h1>
            <p class="mt-2 text-sm text-[#647169]">
              {listings().length} {listings().length === 1 ? 'stop' : 'stops'}
            </p>
          </div>
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
        </header>
        <Show
          when={listings().length > 0}
          fallback={
            <section class="bg-[#faf9f4] px-5 py-14 text-center">
              <h2 class="font-serif text-2xl">No visits planned yet</h2>
              <p class="mt-2 text-sm text-[#647169]">
                Add Source Listings from your saved collection.
              </p>
            </section>
          }
        >
          <Show
            when={view() === 'list'}
            fallback={
              <>
                <VisitPlanMap sourceListings={listings()} />
                <ol class="grid gap-px bg-[#18241e]/20 sm:grid-cols-2">
                  <For each={listings()}>
                    {(listing, index) => (
                      <li class="flex items-center gap-3 bg-[#faf9f4] px-4 py-3">
                        <span class="font-serif text-xl">{index() + 1}</span>
                        <a
                          class="min-w-0 flex-1 truncate font-bold hover:underline"
                          href={paths.sourceListing(listing.id)}
                        >
                          {listing.title ??
                            `Aruodas advert ${listing.sourceId}`}
                        </a>
                        <button
                          aria-label={`Move ${listing.title ?? 'Source Listing'} up`}
                          disabled={busy() || index() === 0}
                          onClick={() => move(index(), -1)}
                        >
                          Up
                        </button>
                        <button
                          aria-label={`Move ${listing.title ?? 'Source Listing'} down`}
                          disabled={busy() || index() === listings().length - 1}
                          onClick={() => move(index(), 1)}
                        >
                          Down
                        </button>
                        <button
                          class="text-[#a13d22]"
                          disabled={busy()}
                          onClick={() =>
                            void replacePlan(
                              plan().sourceListingIds.filter(
                                (id) => id !== listing.id,
                              ),
                            )
                          }
                        >
                          Remove
                        </button>
                      </li>
                    )}
                  </For>
                </ol>
              </>
            }
          >
            <ol class="bg-[#faf9f4]">
              <For each={listings()}>
                {(listing, index) => (
                  <li class="grid gap-4 border-b border-[#18241e]/25 px-5 py-6 sm:grid-cols-[3rem_1fr_auto] sm:items-center sm:px-8">
                    <span class="font-serif text-3xl">{index() + 1}</span>
                    <div>
                      <a
                        class="font-serif text-2xl hover:underline"
                        href={paths.sourceListing(listing.id)}
                      >
                        {listing.title ?? `Aruodas advert ${listing.sourceId}`}
                      </a>
                      <p class="mt-1 text-sm text-[#647169]">
                        {listing.address ?? 'Location unknown'}
                      </p>
                    </div>
                    <div class="grid grid-cols-3 gap-2">
                      <button
                        aria-label="Move up"
                        disabled={busy() || index() === 0}
                        onClick={() => move(index(), -1)}
                      >
                        Up
                      </button>
                      <button
                        aria-label="Move down"
                        disabled={busy() || index() === listings().length - 1}
                        onClick={() => move(index(), 1)}
                      >
                        Down
                      </button>
                      <button
                        class="text-[#a13d22]"
                        disabled={busy()}
                        onClick={() =>
                          void replacePlan(
                            plan().sourceListingIds.filter(
                              (id) => id !== listing.id,
                            ),
                          )
                        }
                      >
                        Remove
                      </button>
                    </div>
                  </li>
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
