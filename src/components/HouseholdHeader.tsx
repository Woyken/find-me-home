import { Show, createSignal } from 'solid-js'
import { useHousehold } from '../households/context'

export function HouseholdHeader() {
  const household = useHousehold()
  const [editing, setEditing] = createSignal(false)
  const [name, setName] = createSignal('')
  const [busy, setBusy] = createSignal(false)
  const [error, setError] = createSignal('')
  const activeName = () => {
    const state = household.state()
    return state.status === 'active' ? state.household.name : ''
  }
  const save = async (event: SubmitEvent) => {
    event.preventDefault()
    setBusy(true)
    setError('')
    try {
      await household.renameActiveHousehold(name())
      setEditing(false)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause))
    } finally {
      setBusy(false)
    }
  }
  return (
    <div>
      <Show
        when={editing()}
        fallback={
          <div class="flex flex-wrap items-center gap-3">
            <h1 class="font-serif text-2xl">{activeName()}</h1>
            <button
              class="border-b border-[#204d3a] font-mono text-[10px] font-bold uppercase text-[#204d3a]"
              onClick={() => {
                setName(activeName())
                setEditing(true)
              }}
            >
              Rename Household
            </button>
          </div>
        }
      >
        <form class="flex flex-wrap items-center gap-2" onSubmit={save}>
          <input
            aria-label="Household name"
            class="min-w-52 border border-[#849087] bg-white px-3 py-2"
            value={name()}
            onInput={(event) => setName(event.currentTarget.value)}
          />
          <button
            class="bg-[#204d3a] px-3 py-2 text-sm font-bold text-white disabled:opacity-50"
            disabled={busy()}
            type="submit"
          >
            Save name
          </button>
          <button
            class="px-2 py-2 text-sm"
            disabled={busy()}
            type="button"
            onClick={() => setEditing(false)}
          >
            Cancel
          </button>
        </form>
      </Show>
      <Show when={error()}>
        <p class="mt-2 text-xs text-red-800" role="alert">
          {error()}
        </p>
      </Show>
    </div>
  )
}
