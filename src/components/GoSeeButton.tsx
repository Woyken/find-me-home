import { Show, action, affects, createOptimistic, createSignal, isPending } from 'solid-js'
import { useHousehold } from '../households/context'
import { FlagIcon } from './icons'

/**
 * Puts a plot on (or takes it off) the "going to see" list. Orange while on.
 */
export function GoSeeButton(props: { sourceListingId: string }) {
  const household = useHousehold()
  const [error, setError] = createSignal('')
  const [plan, setPlan] = createOptimistic(() => household.getVisitPlan().sourceListingIds, {
    loadingValue: [],
  })
  const going = () => plan().includes(props.sourceListingId)
  const toggle = action(function* () {
    affects(plan)
    const ids = plan()
    setError('')
    const next = going()
      ? ids.filter((id) => id !== props.sourceListingId)
      : [...ids, props.sourceListingId]
    setPlan(next)
    try {
      yield household.setVisitPlan(next)
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught))
      throw caught
    }
  })
  const busy = () => isPending(plan)
  return (
    <>
      <button
        class="go"
        type="button"
        aria-pressed={going() ? 'true' : 'false'}
        disabled={busy()}
        onClick={() => void toggle().catch(() => undefined)}
      >
        <FlagIcon />
        {going() ? 'Going to see' : 'Go see it'}
      </button>
      <Show when={error()}>
        <p class="alert" role="alert">
          {error()}
        </p>
      </Show>
    </>
  )
}
