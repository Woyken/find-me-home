import { Show, createSignal } from 'solid-js'
import { useHousehold } from '../households/context'
import { FlagIcon } from './icons'

/**
 * Puts a plot on (or takes it off) the "going to see" list. Orange while on.
 */
export function GoSeeButton(props: { sourceListingId: string }) {
  const household = useHousehold()
  const [busy, setBusy] = createSignal(false)
  const [error, setError] = createSignal('')
  const going = () =>
    household.getVisitPlan().sourceListingIds.includes(props.sourceListingId)
  const toggle = async () => {
    const ids = household.getVisitPlan().sourceListingIds
    setBusy(true)
    setError('')
    try {
      await household.setVisitPlan(
        going()
          ? ids.filter((id) => id !== props.sourceListingId)
          : [...ids, props.sourceListingId],
      )
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught))
    } finally {
      setBusy(false)
    }
  }
  return (
    <>
      <button
        class="go"
        type="button"
        aria-pressed={going() ? 'true' : 'false'}
        disabled={busy()}
        onClick={() => void toggle()}
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
