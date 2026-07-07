import { createFileRoute } from '@tanstack/solid-router'
import { For, Show, createMemo, createSignal, onCleanup } from 'solid-js'
import {
  addAruodasPaste,
  fetchListings,
  startEvaluation,
  startScan,
} from '../server-functions/listings'
import type { ListingRow } from '../server/scan'
import type { EvaluationRow } from '../server/evaluators'

export const Route = createFileRoute('/')({
  loader: () => fetchListings(),
  component: Dashboard,
})

const SOURCE_COLORS: Record<string, string> = {
  kampas: 'bg-emerald-100 text-emerald-800',
  domoplius: 'bg-sky-100 text-sky-800',
  skelbiu: 'bg-amber-100 text-amber-800',
  alio: 'bg-violet-100 text-violet-800',
  'aruodas-manual': 'bg-rose-100 text-rose-800',
}

const STATUS_STYLES: Record<string, string> = {
  pass: 'bg-emerald-500 text-white',
  fail: 'bg-red-500 text-white',
  warn: 'bg-amber-400 text-black',
  unknown: 'bg-gray-200 text-gray-500',
}

function Dashboard() {
  const initial = Route.useLoaderData()
  const [data, setData] = createSignal(initial())
  const [scanBusy, setScanBusy] = createSignal(false)
  const [evalBusy, setEvalBusy] = createSignal(false)
  const [showPaste, setShowPaste] = createSignal(false)

  let pollTimer: ReturnType<typeof setInterval> | undefined

  const refresh = async () => {
    const fresh = await fetchListings()
    setData(fresh)
    if (!fresh.scanRunning && !fresh.evaluating && pollTimer) {
      clearInterval(pollTimer)
      pollTimer = undefined
      setScanBusy(false)
      setEvalBusy(false)
    }
  }

  const startPolling = () => {
    if (pollTimer) return
    pollTimer = setInterval(refresh, 4000)
  }

  onCleanup(() => pollTimer && clearInterval(pollTimer))

  const onScan = async () => {
    setScanBusy(true)
    await startScan()
    startPolling()
  }

  const onEvaluate = async () => {
    setEvalBusy(true)
    await startEvaluation()
    startPolling()
  }

  const evalsByListing = createMemo(() => {
    const m = new Map<number, Map<string, EvaluationRow>>()
    for (const e of data().evaluations) {
      let inner = m.get(e.listing_id)
      if (!inner) {
        inner = new Map()
        m.set(e.listing_id, inner)
      }
      inner.set(e.requirement, e)
    }
    return m
  })

  const scanStats = () => {
    const raw = data().lastScan?.stats_json
    if (!raw) return null
    try {
      return JSON.parse(raw) as {
        perSource?: Record<
          string,
          { found: number; examined: number; errors: Array<string> }
        >
      }
    } catch {
      return null
    }
  }

  return (
    <main class="mx-auto max-w-7xl p-6">
      <header class="mb-6 flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 class="text-3xl font-bold tracking-tight">Find Me Home</h1>
          <p class="text-sm text-gray-500">
            Land plots near Vilnius · 8–25 a · ≤ €60k · namų valda
          </p>
        </div>
        <div class="flex items-center gap-3">
          <button
            class="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium hover:bg-gray-50"
            onClick={() => setShowPaste((v) => !v)}
          >
            Paste aruodas listing
          </button>
          <button
            class="rounded-lg bg-emerald-600 px-5 py-2 text-sm font-semibold text-white hover:bg-emerald-500 disabled:opacity-50"
            disabled={evalBusy() || data().evaluating}
            onClick={onEvaluate}
          >
            {evalBusy() || data().evaluating ? 'Evaluating…' : 'Evaluate'}
          </button>
          <button
            class="rounded-lg bg-blue-600 px-5 py-2 text-sm font-semibold text-white hover:bg-blue-500 disabled:opacity-50"
            disabled={scanBusy() || data().scanRunning}
            onClick={onScan}
          >
            {scanBusy() || data().scanRunning ? 'Scanning…' : 'Scan now'}
          </button>
        </div>
      </header>

      <Show when={showPaste()}>
        <PasteForm
          onDone={() => {
            setShowPaste(false)
            void refresh()
          }}
        />
      </Show>

      <Show when={data().lastScan}>
        {(scan) => (
          <section class="mb-6 rounded-lg border border-gray-200 bg-gray-50 p-4 text-sm">
            <div class="flex flex-wrap items-center gap-x-6 gap-y-1">
              <span>
                Last scan: <b>{scan().started_at}</b> — {scan().status}
              </span>
              <Show when={scanStats()?.perSource}>
                {(per) => (
                  <For each={Object.entries(per())}>
                    {([source, s]) => (
                      <span
                        class={`rounded px-2 py-0.5 ${SOURCE_COLORS[source] ?? 'bg-gray-100'}`}
                        title={s.errors.join('\n')}
                      >
                        {source}: {s.found} found
                        {s.errors.length > 0 ? ` · ${s.errors.length} err` : ''}
                      </span>
                    )}
                  </For>
                )}
              </Show>
            </div>
          </section>
        )}
      </Show>

      <section>
        <h2 class="mb-3 text-lg font-semibold">
          Listings ({data().listings.length})
        </h2>
        <Show
          when={data().listings.length > 0}
          fallback={
            <p class="rounded-lg border border-dashed border-gray-300 p-8 text-center text-gray-500">
              No listings yet — press “Scan now”.
            </p>
          }
        >
          <div class="overflow-x-auto rounded-lg border border-gray-200">
            <table class="w-full text-sm">
              <thead class="bg-gray-50 text-left text-xs uppercase text-gray-500">
                <tr>
                  <th class="px-3 py-2">Title / Address</th>
                  <th class="px-3 py-2">Price</th>
                  <th class="px-3 py-2">Area</th>
                  <th class="px-3 py-2">€/a</th>
                  <th class="px-3 py-2">Purpose</th>
                  <th class="px-3 py-2">Cadastral</th>
                  <th class="px-3 py-2">Coords</th>
                  <th class="px-3 py-2">Requirements</th>
                  <th class="px-3 py-2">Source</th>
                </tr>
              </thead>
              <tbody class="divide-y divide-gray-100">
                <For each={data().listings}>
                  {(l) => (
                    <ListingTableRow
                      listing={l}
                      requirements={data().requirements}
                      evals={evalsByListing().get(l.id)}
                    />
                  )}
                </For>
              </tbody>
            </table>
          </div>
        </Show>
      </section>
    </main>
  )
}

function ListingTableRow(props: {
  listing: ListingRow
  requirements: Array<{ requirement: string; label: string; hard: boolean }>
  evals: Map<string, EvaluationRow> | undefined
}) {
  const l = props.listing
  const pricePerAre = () =>
    l.price_eur != null && l.area_ares ? l.price_eur / l.area_ares : null
  return (
    <tr class="hover:bg-blue-50/40">
      <td class="max-w-xs px-3 py-2">
        <a
          href={l.url}
          target="_blank"
          rel="noreferrer"
          class="font-medium text-blue-700 hover:underline"
        >
          {l.title ?? l.address ?? l.url}
        </a>
        <Show when={l.address && l.address !== l.title}>
          <div class="truncate text-xs text-gray-500">{l.address}</div>
        </Show>
      </td>
      <td class="whitespace-nowrap px-3 py-2 font-semibold">
        {l.price_eur != null ? `€${l.price_eur.toLocaleString('lt-LT')}` : '—'}
      </td>
      <td class="whitespace-nowrap px-3 py-2">
        {l.area_ares != null ? `${l.area_ares.toFixed(1)} a` : '—'}
      </td>
      <td class="whitespace-nowrap px-3 py-2 text-gray-600">
        {pricePerAre() != null ? `€${pricePerAre()!.toFixed(0)}` : '—'}
      </td>
      <td class="max-w-40 truncate px-3 py-2" title={l.purpose_text ?? ''}>
        {l.purpose_text ?? <span class="text-gray-400">unknown</span>}
      </td>
      <td class="whitespace-nowrap px-3 py-2 font-mono text-xs">
        {l.cadastral_number ?? <span class="text-gray-400">—</span>}
      </td>
      <td class="whitespace-nowrap px-3 py-2 text-xs">
        <Show
          when={l.lat != null}
          fallback={<span class="text-gray-400">unknown</span>}
        >
          <a
            class="text-blue-600 hover:underline"
            href={`https://www.google.com/maps?q=${l.lat},${l.lng}`}
            target="_blank"
            rel="noreferrer"
          >
            {l.lat!.toFixed(4)}, {l.lng!.toFixed(4)}
          </a>
          <span class="ml-1 text-gray-400">({l.location_confidence})</span>
        </Show>
      </td>
      <td class="px-3 py-2">
        <div class="flex flex-wrap gap-1">
          <For each={props.requirements}>
            {(req) => (
              <RequirementBadge meta={req} row={props.evals?.get(req.requirement)} />
            )}
          </For>
        </div>
      </td>
      <td class="px-3 py-2">
        <span
          class={`rounded px-2 py-0.5 text-xs ${SOURCE_COLORS[l.source] ?? 'bg-gray-100'}`}
        >
          {l.source}
        </span>
      </td>
    </tr>
  )
}

const BADGE_ABBREV: Record<string, string> = {
  size: 'Sz',
  price: '€',
  radius: 'Km',
  purpose: 'Pu',
  walk_to_stop: 'Wk',
  commute: 'Cm',
  eso_cost: 'El',
  budget: 'Bd',
  crime: 'Cr',
  trees: 'Tr',
  water_sewage: 'Wa',
  legal_flags: 'Lg',
  noise: 'Ns',
  livability: 'Lv',
}

function RequirementBadge(props: {
  meta: { requirement: string; label: string; hard: boolean }
  row: EvaluationRow | undefined
}) {
  const status = () => props.row?.status ?? 'unknown'
  const tooltip = () => {
    const kind = props.meta.hard ? 'hard' : 'soft'
    if (!props.row) return `${props.meta.label} (${kind}): not evaluated yet`
    let evidence = ''
    try {
      const items = JSON.parse(props.row.evidence_json ?? '[]') as Array<{
        source: string
        detail: string
      }>
      evidence = items.map((i) => `[${i.source}] ${i.detail}`).join('\n')
    } catch {
      /* ignore */
    }
    return `${props.meta.label} (${kind}): ${props.row.status.toUpperCase()}${props.row.value ? ` — ${props.row.value}` : ''}\nconfidence: ${props.row.confidence ?? '?'}\n${evidence}`
  }
  return (
    <span
      class={`cursor-help rounded px-1.5 py-0.5 font-mono text-[10px] ${props.meta.hard ? 'font-bold' : 'font-normal'} ${STATUS_STYLES[status()] ?? STATUS_STYLES.unknown}`}
      title={tooltip()}
    >
      <span class="font-semibold">
        {BADGE_ABBREV[props.meta.requirement] ??
          props.meta.requirement.slice(0, 2)}
      </span>
      <Show when={props.row?.value && status() !== 'unknown'}>
        <span class="ml-1 font-normal">{props.row!.value}</span>
      </Show>
    </span>
  )
}

function PasteForm(props: { onDone: () => void }) {
  const [url, setUrl] = createSignal('')
  const [pageText, setPageText] = createSignal('')
  const [busy, setBusy] = createSignal(false)
  const [error, setError] = createSignal<string | null>(null)

  const submit = async (e: Event) => {
    e.preventDefault()
    setBusy(true)
    setError(null)
    try {
      await addAruodasPaste({ data: { url: url(), pageText: pageText() } })
      props.onDone()
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setBusy(false)
    }
  }

  return (
    <form
      class="mb-6 space-y-3 rounded-lg border border-gray-200 p-4"
      onSubmit={submit}
    >
      <h3 class="font-semibold">Add aruodas.lt listing manually</h3>
      <p class="text-xs text-gray-500">
        Open the listing in your browser, copy the URL and the page text
        (Ctrl+A, Ctrl+C), and paste both below.
      </p>
      <input
        class="w-full rounded border border-gray-300 px-3 py-2 text-sm"
        placeholder="https://www.aruodas.lt/sklypai/..."
        value={url()}
        onInput={(e) => setUrl(e.currentTarget.value)}
      />
      <textarea
        class="h-40 w-full rounded border border-gray-300 px-3 py-2 text-sm"
        placeholder="Paste the full page text here…"
        value={pageText()}
        onInput={(e) => setPageText(e.currentTarget.value)}
      />
      <Show when={error()}>
        <p class="text-sm text-red-600">{error()}</p>
      </Show>
      <button
        type="submit"
        class="rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-500 disabled:opacity-50"
        disabled={busy()}
      >
        {busy() ? 'Saving…' : 'Save listing'}
      </button>
    </form>
  )
}
