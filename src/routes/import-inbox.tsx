import {
  For,
  Show,
  createEffect,
  createMemo,
  createSignal,
  onSettled,
} from 'solid-js'
import { CheckIcon } from '../components/icons'
import { useHousehold } from '../households/context'
import type { ImportInboxRecord } from '../imports/inbox-model'
import { useImport } from '../imports/context'
import { paths } from '../paths'
import { formatAres, formatEur, formatPerAre, orDash } from '../format'

export const preloadImportInbox = () => undefined

const DECK_TOTAL_KEY = 'fmh-deck-total'

type Captured = {
  added: number
  refreshed: number
  alreadyImported: number
  skippedNonLand: number
  skippedInactive: number
  unreadable: number
}

/**
 * Keeps the household's inbox in a local sorting order: new clippings join at
 * the back, "skip" rotates the top one to the back, "bring" pulls one forward.
 */
export const reconcileDeckOrder = (
  order: Array<string>,
  ids: Array<string>,
) => {
  const present = new Set(ids)
  const kept = order.filter((id) => present.has(id))
  const known = new Set(kept)
  return [...kept, ...ids.filter((id) => !known.has(id))]
}

export default function ImportInboxPage() {
  const household = useHousehold()
  const imports = useImport()
  const items = createMemo(() => household.listImportInbox())
  const [order, setOrder] = createSignal<Array<string>>([])
  const [captured, setCaptured] = createSignal<Captured>()
  const [error, setError] = createSignal('')
  const [busy, setBusy] = createSignal(false)

  onSettled(() => {
    document.body.classList.add('blotter')
    return () => document.body.classList.remove('blotter')
  })

  createEffect(
    () => items().map((item) => item.id),
    (ids) => {
      setOrder((current) => reconcileDeckOrder(current, ids))
    },
  )

  const deck = createMemo(() => {
    const byId = new Map(items().map((item) => [item.id, item]))
    return order().flatMap((id) => {
      const item = byId.get(id)
      return item ? [item] : []
    })
  })
  // How many were in the pile when sorting started, for the progress bar.
  const total = createMemo(() => {
    const count = deck().length
    if (count === 0) {
      sessionStorage.removeItem(DECK_TOTAL_KEY)
      return 0
    }
    const stored = Number(sessionStorage.getItem(DECK_TOTAL_KEY)) || 0
    const next = Math.max(stored, count)
    sessionStorage.setItem(DECK_TOTAL_KEY, String(next))
    return next
  })
  const done = () => total() - deck().length

  // The favourites pile handed over by the bookmark. It stays in the draft
  // until the household has captured it, so a failed capture can be retried
  // and a reload picks it up again.
  const pile = createMemo(() => {
    const transport = imports.draft()
    return transport?.kind === 'favorites' ? transport : undefined
  })
  const [capturing, setCapturing] = createSignal(false)
  const [attempt, setAttempt] = createSignal(0)
  let consumed = false
  createEffect(
    () => ({ transport: pile(), attempt: attempt() }),
    ({ transport }) => {
      if (consumed || !transport) return
      consumed = true
      setCapturing(true)
      setError('')
      void household
        .captureImportInbox(transport.items)
        .then((result) => {
          setCaptured({
            added: result.added,
            refreshed: result.refreshed,
            alreadyImported: result.alreadyImported,
            skippedNonLand: transport.skippedNonLand,
            skippedInactive: transport.skippedInactive,
            unreadable: transport.unreadable,
          })
          imports.clear()
        })
        .catch((caught: unknown) => {
          consumed = false
          setError(caught instanceof Error ? caught.message : String(caught))
        })
        .finally(() => setCapturing(false))
    },
  )
  const retry = () => setAttempt((current) => current + 1)

  const skip = () =>
    setOrder((current) =>
      current.length > 1 ? [...current.slice(1), current[0]] : current,
    )
  const bring = (id: string) =>
    setOrder((current) => [id, ...current.filter((other) => other !== id)])
  const drop = async (id: string) => {
    setBusy(true)
    setError('')
    try {
      await household.removeImportInbox(id)
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught))
    } finally {
      setBusy(false)
    }
  }

  return (
    <main class="wrap narrow">
      <a class="crumb" href={paths.home}>
        ‹ Plots
      </a>

      <Show when={captured()}>
        {(numbers) => (
          <div class="panel blue captured">
            <div>
              <div class="lead">
                Brought over from your Aruodas favourites just now
              </div>
              <div class="nums">
                <span>
                  <b>{numbers().added}</b>new
                </span>
                <span>
                  <b>{numbers().refreshed}</b>refreshed
                </span>
                <span>
                  <b>{numbers().alreadyImported}</b>already saved
                </span>
                <Show when={numbers().skippedNonLand > 0}>
                  <span>
                    <b>{numbers().skippedNonLand}</b>skipped, not land
                  </span>
                </Show>
                <Show when={numbers().skippedInactive > 0}>
                  <span>
                    <b>{numbers().skippedInactive}</b>skipped, sold
                  </span>
                </Show>
                <Show when={numbers().unreadable > 0}>
                  <span>
                    <b>{numbers().unreadable}</b>could not be read
                  </span>
                </Show>
              </div>
            </div>
            <button
              class="btn ghost sm"
              type="button"
              onClick={() => setCaptured(undefined)}
            >
              OK
            </button>
          </div>
        )}
      </Show>
      <Show when={error()}>
        <p class="alert" role="alert">
          {error()}
          <Show when={pile()}>
            {' '}
            <button
              class="btn ghost sm"
              type="button"
              disabled={capturing()}
              onClick={retry}
            >
              Try again
            </button>
          </Show>
        </p>
      </Show>

      <Show
        when={deck()[0]}
        fallback={
          <Show
            when={!pile()}
            fallback={
              <div
                class="panel done"
                aria-busy={capturing() ? 'true' : 'false'}
              >
                <Show
                  when={!error()}
                  fallback={
                    <>
                      <h2 style={{ 'margin-top': '14px' }}>
                        Your favourites did not come through
                      </h2>
                      <p
                        class="muted"
                        style={{ 'max-width': '44ch', margin: '8px auto 18px' }}
                      >
                        {pile()!.items.length} clippings from Aruodas are still
                        waiting to be brought over. Try again, or reload this
                        page.
                      </p>
                      <button
                        class="btn"
                        type="button"
                        disabled={capturing()}
                        onClick={retry}
                      >
                        Try again
                      </button>
                    </>
                  }
                >
                  <h2 style={{ 'margin-top': '14px' }}>
                    Bringing over your Aruodas favourites…
                  </h2>
                  <p
                    class="muted"
                    style={{ 'max-width': '44ch', margin: '8px auto 18px' }}
                  >
                    {pile()!.items.length} clippings are on their way. This only
                    takes a moment.
                  </p>
                </Show>
              </div>
            }
          >
            <div class="panel done">
              <span class="big" aria-hidden="true">
                <CheckIcon />
              </span>
              <h2 style={{ 'margin-top': '14px' }}>All sorted</h2>
              <p
                class="muted"
                style={{ 'max-width': '44ch', margin: '8px auto 18px' }}
              >
                Nothing waiting from Aruodas. Next time you're on your
                favourites page there, click the Find Me Home bookmark to bring
                over a new pile.
              </p>
              <a class="btn" href={paths.home}>
                Back to plots
              </a>
            </div>
          </Show>
        }
      >
        {(top) => (
          <>
            <div class="deck-h">
              <div>
                <h2>Clippings from Aruodas</h2>
                <p>
                  {deck().length === 1
                    ? 'Last one.'
                    : `${deck().length} to go — one at a time.`}
                </p>
              </div>
              <span class="tag blue">
                {done() + 1} of {total()}
              </span>
            </div>
            <div class="progress" aria-hidden="true">
              <For each={Array.from({ length: total() }, (_, i) => i)}>
                {(i) => (
                  <i class={i < done() ? 'done' : i === done() ? 'now' : ''} />
                )}
              </For>
            </div>
            <div class="stack">
              <Show when={deck().length > 2}>
                <div class="under two" aria-hidden="true" />
              </Show>
              <Show when={deck().length > 1}>
                <div class="under" aria-hidden="true" />
              </Show>
              <Clipping
                item={top()}
                onSkip={skip}
                skipDisabled={deck().length === 1 || busy()}
                onDrop={() => void drop(top().id)}
                dropDisabled={busy()}
              />
            </div>
            <Show when={deck().length > 1}>
              <div class="upnext">
                <h4>Up next</h4>
                <div class="thumbs">
                  <For each={deck().slice(1)}>
                    {(item) => (
                      <button
                        type="button"
                        title={item.title || item.sourceId}
                        onClick={() => bring(item.id)}
                      >
                        <Show
                          when={item.thumbnail}
                          fallback={<div class="ph" />}
                        >
                          {(thumbnail) => <img src={thumbnail()} alt="" />}
                        </Show>
                        <span>{item.title || item.sourceId}</span>
                      </button>
                    )}
                  </For>
                </div>
              </div>
            </Show>
          </>
        )}
      </Show>
    </main>
  )
}

function Clipping(props: {
  item: ImportInboxRecord
  onSkip: () => void
  skipDisabled: boolean
  onDrop: () => void
  dropDisabled: boolean
}) {
  const advertUrl = () =>
    `https://www.aruodas.lt/${encodeURIComponent(props.item.sourceId)}/#find-me-home-return=import-inbox`
  const missing = () =>
    [
      props.item.title ? null : 'no title',
      props.item.priceEur === undefined ? 'no price' : null,
      props.item.areaAres === undefined ? 'no area' : null,
      props.item.thumbnail ? null : 'no photo',
    ].filter((value): value is string => value !== null)

  return (
    <article class="card">
      <Show
        when={props.item.thumbnail}
        fallback={<div class="ph">The advert had no photo</div>}
      >
        {(thumbnail) => <img src={thumbnail()} alt="" />}
      </Show>
      <h3>{props.item.title || 'Land advert with no title'}</h3>
      <div class="m">
        <span>
          <b>{orDash(formatEur(props.item.priceEur))}</b>
          <small>price</small>
        </span>
        <span>
          <b>{orDash(formatAres(props.item.areaAres))}</b>
          <small>area</small>
        </span>
        <span>
          <b>
            {orDash(formatPerAre(props.item.priceEur, props.item.areaAres))}
          </b>
          <small>per are</small>
        </span>
        <span class="tag">Aruodas {props.item.sourceId}</span>
      </div>
      <Show when={props.item.description}>
        <p class="d">{props.item.description}</p>
      </Show>
      <div class="missing">
        <Show when={missing().length > 0}>
          <span class="tag warn">Only the basics: {missing().join(', ')}</span>
        </Show>
        <span class="tag">No map or checks until it's saved</span>
      </div>
      <div class="decide">
        <a class="btn blue" href={advertUrl()}>
          Open advert &amp; save it ↗
        </a>
        <button
          class="btn ghost"
          type="button"
          disabled={props.skipDisabled}
          onClick={props.onSkip}
        >
          Skip for now
        </button>
        <button
          class="btn danger"
          type="button"
          disabled={props.dropDisabled}
          onClick={props.onDrop}
        >
          Not interested
        </button>
      </div>
      <div class="how">
        <span class="k" aria-hidden="true">
          ?
        </span>
        <span>
          <b>What happens:</b> the advert opens on aruodas.lt. Click the Find Me
          Home bookmark there, check the price and area, save — and you land
          back here on the next clipping.
        </span>
      </div>
    </article>
  )
}
