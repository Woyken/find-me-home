import { createSignal } from 'solid-js'
import { useHousehold } from '../households/context'
import { formatAgo } from '../format'
import { paths } from '../paths'
import { openAddPlotDialog } from './AddPlotDialog'
import { SearchSettingsDialog } from './SearchSettingsDialog'

const syncText = {
  connected: 'Both devices connected',
  syncing: 'Syncing…',
  alone: 'Only this device',
} as const

/**
 * Page header: the search's name, its sync state, and the main navigation.
 */
export function HouseholdHeader(props: { active?: 'plots' | 'trip' }) {
  const household = useHousehold()
  const [settings, setSettings] = createSignal(false)
  const active = () => {
    const state = household.state()
    return state.status === 'active' ? state : undefined
  }
  const name = () => active()?.household.name ?? ''
  const sync = () => active()?.syncStatus ?? 'alone'
  const plotCount = () => household.listSourceListings().length
  const tripCount = () => household.getVisitPlan().sourceListingIds.length

  return (
    <header class="top">
      <div>
        <h1>{name()}</h1>
        <div class="sub">
          <span class={`dot ${sync()}`} aria-hidden="true" />
          <span>{syncText[sync()]}</span>
          <span aria-hidden="true">·</span>
          <span>Last change {formatAgo(household.getLastChangeAt())}</span>
          <button
            class="linkbtn"
            type="button"
            onClick={() => setSettings(true)}
          >
            Our search settings
          </button>
        </div>
      </div>
      <nav class="nav" aria-label="Main">
        <a
          class="pill"
          href={paths.home}
          aria-current={props.active === 'plots' ? 'page' : undefined}
        >
          Plots <span class="n">{plotCount()}</span>
        </a>
        <a
          class="pill stake"
          href={paths.visitPlan}
          aria-current={props.active === 'trip' ? 'page' : undefined}
        >
          Going to see <span class="n">{tripCount()}</span>
        </a>
        <button class="pill primary" type="button" onClick={openAddPlotDialog}>
          + Add a plot
        </button>
      </nav>
      <SearchSettingsDialog
        open={settings()}
        onClose={() => setSettings(false)}
      />
    </header>
  )
}
