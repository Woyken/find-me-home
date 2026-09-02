import { Show, createSignal } from 'solid-js'
import { useHousehold } from '../households/context'

export function HouseholdStart() {
  const household = useHousehold()
  const [busy, setBusy] = createSignal(false)
  const [error, setError] = createSignal('')
  const create = async () => {
    setBusy(true)
    setError('')
    try {
      await household.createHousehold()
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause))
    } finally {
      setBusy(false)
    }
  }
  return (
    <main class="flex min-h-screen items-center bg-[#edf0ea] px-5 py-12 text-[#18241e]">
      <section class="mx-auto w-full max-w-3xl border border-[#18241e] bg-[#faf9f4] p-7 sm:p-12">
        <p class="font-mono text-xs uppercase tracking-[0.2em] text-[#647169]">
          Find Me Home
        </p>
        <h1 class="mt-4 max-w-xl font-serif text-4xl leading-tight sm:text-6xl">
          Begin a shared land search.
        </h1>
        <p class="mt-5 max-w-xl text-[#526057]">
          A Household keeps the Source Listings, Candidate Plots, and Visit Plan
          that everyone in your search can edit.
        </p>
        <div class="mt-9 grid gap-4 sm:grid-cols-2">
          <button
            class="bg-[#204d3a] px-5 py-4 text-left font-bold text-white disabled:opacity-50"
            disabled={busy()}
            onClick={create}
          >
            {busy() ? 'Creating…' : 'Create Household'}
          </button>
          <div class="border border-[#849087] px-5 py-4">
            <b>Join Household</b>
            <p class="mt-1 text-xs text-[#647169]">
              Open an invitation link from another person in the Household.
            </p>
          </div>
        </div>
        <Show when={error()}>
          <p class="mt-4 text-sm text-red-800" role="alert">
            {error()}
          </p>
        </Show>
      </section>
    </main>
  )
}
