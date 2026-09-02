import { Loading, Match, Switch } from 'solid-js'
import type { ParentProps } from 'solid-js'
import { Router } from './router'
import { HouseholdStart } from './components/HouseholdStart'
import { createBrowserHouseholdRuntime } from './households/browser-runtime'
import { HouseholdProvider, useHousehold } from './households/context'
import type { HouseholdRuntime } from './households/runtime'
import { ImportProvider, useImport } from './imports/context'
import ImportReview from './routes/import-review'
import './styles.css'

export default function App(
  props: ParentProps<{ runtime?: HouseholdRuntime }>,
) {
  const runtime = props.runtime ?? createBrowserHouseholdRuntime()
  return (
    <ImportProvider>
      <HouseholdProvider runtime={runtime}>
        <HouseholdBoundary>{props.children}</HouseholdBoundary>
      </HouseholdProvider>
    </ImportProvider>
  )
}

function HouseholdBoundary(props: ParentProps) {
  const household = useHousehold()
  const imported = useImport()
  return (
    <Switch>
      <Match when={household.state().status === 'starting'}>
        <main class="min-h-screen bg-[#f6f4ec]" />
      </Match>
      <Match when={household.state().status === 'no-household'}>
        <HouseholdStart />
      </Match>
      <Match when={household.state().status === 'error'}>
        <main class="flex min-h-screen items-center justify-center bg-[#f6f4ec] p-6">
          <p role="alert">Household data could not be opened.</p>
        </main>
      </Match>
      <Match when={household.state().status === 'waiting'}>
        <main class="flex min-h-screen items-center justify-center bg-[#f6f4ec] p-6">
          <p>Waiting for another Household member</p>
        </main>
      </Match>
      <Match when={household.state().status === 'active'}>
        {imported.draft() || imported.error() ? (
          <ImportReview />
        ) : (
          (props.children ?? (
            <Router>
              {(routerProps) => (
                <Loading fallback={<main class="min-h-screen bg-[#f6f4ec]" />}>
                  {routerProps.children}
                </Loading>
              )}
            </Router>
          ))
        )}
      </Match>
    </Switch>
  )
}
