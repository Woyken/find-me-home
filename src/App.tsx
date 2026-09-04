import { Loading, Match, Switch } from 'solid-js'
import type { ParentProps } from 'solid-js'
import { Router } from './router'
import { AddPlotDialog } from './components/AddPlotDialog'
import { HouseholdStart } from './components/HouseholdStart'
import { Toasts } from './components/Toast'
import { createBrowserHouseholdRuntime } from './households/browser-runtime'
import { HouseholdProvider, useHousehold } from './households/context'
import type { HouseholdRuntime } from './households/runtime'
import { ImportProvider, useImport } from './imports/context'
import ImportReview from './routes/import-review'
import './styles.css'

export default function App(
  props: ParentProps<{ runtime?: HouseholdRuntime }>,
) {
  if (import.meta.env.PROD && 'serviceWorker' in navigator) {
    void navigator.serviceWorker.register(
      `${import.meta.env.BASE_URL}service-worker.js`,
      { scope: import.meta.env.BASE_URL },
    )
  }
  const runtime = props.runtime ?? createBrowserHouseholdRuntime()
  return (
    <ImportProvider>
      <HouseholdProvider runtime={runtime}>
        <HouseholdBoundary>{props.children}</HouseholdBoundary>
        <Toasts />
      </HouseholdProvider>
    </ImportProvider>
  )
}

function HouseholdBoundary(props: ParentProps) {
  const household = useHousehold()
  const imported = useImport()
  const waiting = () => {
    const state = household.state()
    return state.status === 'waiting' && state.syncStatus === 'syncing'
      ? {
          title: 'Copying plots…',
          text: 'Almost there.',
        }
      : {
          title: 'Joining the search…',
          text: 'Waiting for another device in this search to come online so we can copy the plots. Keep this page open.',
        }
  }
  return (
    <Switch>
      <Match when={household.state().status === 'starting'}>
        <main class="start-screen" />
      </Match>
      <Match when={household.state().status === 'no-household'}>
        <HouseholdStart />
      </Match>
      <Match when={household.state().status === 'error'}>
        <main class="start-screen">
          <div class="panel start center danger">
            <h2>The saved plots couldn't be opened</h2>
            <p role="alert">
              This browser blocked the storage this app uses (often
              private/incognito mode). Open Find Me Home in a normal window, or
              on another device in the search.
            </p>
            <button
              class="btn"
              type="button"
              onClick={() => window.location.reload()}
            >
              Try again
            </button>
          </div>
        </main>
      </Match>
      <Match when={household.state().status === 'waiting'}>
        <main class="start-screen">
          <div class="panel start center">
            <span class="dot big syncing" aria-hidden="true" />
            <h2>{waiting().title}</h2>
            <p class="muted" role="status">
              {waiting().text}
            </p>
          </div>
        </main>
      </Match>
      <Match when={household.state().status === 'active'}>
        {imported.draft()?.kind === 'listing' || imported.error() ? (
          <ImportReview />
        ) : (
          (props.children ?? (
            <Router>
              {(routerProps) => (
                <Loading fallback={<main class="start-screen" />}>
                  {routerProps.children}
                </Loading>
              )}
            </Router>
          ))
        )}
        <AddPlotDialog />
      </Match>
    </Switch>
  )
}
