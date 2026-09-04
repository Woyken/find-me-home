import { Show, createSignal } from 'solid-js'
import { useHousehold } from '../households/context'
import { HouseIcon } from './icons'

/** Pulls the invitation secret out of a pasted link (or a bare secret). */
export const invitationSecretFrom = (text: string) => {
  const trimmed = text.trim()
  const fromLink = trimmed.match(/#household=([^&\s]+)/)?.[1]
  if (fromLink) return decodeURIComponent(fromLink)
  return /^[A-Za-z0-9_-]{8,}$/.test(trimmed) ? trimmed : null
}

export function HouseholdStart() {
  const household = useHousehold()
  const [busy, setBusy] = createSignal(false)
  const [error, setError] = createSignal('')
  const [link, setLink] = createSignal('')
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
  const join = async (event: SubmitEvent) => {
    event.preventDefault()
    const secret = invitationSecretFrom(link())
    if (!secret) {
      setError(
        "That doesn't look like an invitation link. It should contain #household=…",
      )
      return
    }
    setBusy(true)
    setError('')
    try {
      await household.joinHousehold(secret)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause))
    } finally {
      setBusy(false)
    }
  }
  return (
    <main class="start-screen">
      <section class="panel start">
        <div class="brand">
          <HouseIcon /> Find Me Home
        </div>
        <h1>Find land together.</h1>
        <p class="lead">
          Save plots from Aruodas, see them on a map, let the app check the
          boring things — bus stops, electricity, legal limits — and plan which
          ones to drive out and see. Everything stays on your own devices and
          syncs between them.
        </p>
        <div class="choices">
          <div class="panel choice">
            <h2>Start a new search</h2>
            <p>
              For you, or you and a partner. You can invite others afterwards.
            </p>
            <button
              class="btn"
              type="button"
              disabled={busy()}
              onClick={() => void create()}
            >
              {busy() ? 'Creating…' : 'Start a search'}
            </button>
          </div>
          <div class="panel choice soft">
            <h2>Join someone's search</h2>
            <p>
              Ask them for the invitation link (in <i>Our search settings</i>)
              and open it on this device — or paste it here.
            </p>
            <form class="rowline tight" onSubmit={(event) => void join(event)}>
              <input
                class="plain grow"
                aria-label="Invitation link"
                placeholder="https://…/find-me-home/#household=…"
                value={link()}
                onInput={(event) => setLink(event.currentTarget.value)}
              />
              <button class="btn ghost" type="submit" disabled={busy()}>
                Join
              </button>
            </form>
          </div>
        </div>
        <Show when={error()}>
          <p class="alert" role="alert" style={{ 'margin-top': '14px' }}>
            {error()}
          </p>
        </Show>
      </section>
    </main>
  )
}
