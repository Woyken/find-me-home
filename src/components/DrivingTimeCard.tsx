import { Show, action, affects, createSignal, isPending } from 'solid-js'
import type { Accessor } from 'solid-js'
import type { Coordinate, DrivingTime } from '../external-service-client'
import { createExternalServiceClient } from '../external-service-client'
import { wazeDirectionsUrl } from '../directions'
import { CITY_CENTRE } from '../../shared/driving'

const workerUrlValue: unknown = import.meta.env.VITE_WORKER_URL
const WORKER_URL = typeof workerUrlValue === 'string' ? workerUrlValue : undefined
const policyUrl = (file: string) => `${import.meta.env.BASE_URL}${file}`

const vilniusTime = (value: string) =>
  new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Europe/Vilnius',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).format(new Date(value))

const errorText = (error: unknown) =>
  error instanceof Error ? error.message : 'Driving estimate unavailable; try again.'

export function DrivingTimeCard(props: {
  origin: Accessor<Coordinate | null>
  load?: (latitude: number, longitude: number) => Promise<DrivingTime>
}) {
  const client = createExternalServiceClient(WORKER_URL ?? '')
  const load = props.load ?? client.drivingTimeToCityCentre
  const [result, setResult] = createSignal<DrivingTime>()
  const [error, setError] = createSignal('')
  const loading = () => isPending(result)

  const check = action(function* () {
    const origin = props.origin()
    if (!origin || loading()) return
    affects(result)
    setError('')
    setResult(undefined)
    try {
      setResult(yield load(origin.latitude, origin.longitude))
    } catch (caught) {
      setError(errorText(caught))
    }
  })

  return (
    <section class="panel soft block driving-time">
      <div class="sub-h">
        <div>
          <h4>Drive to city centre</h4>
          <p class="small muted">Fresh traffic estimate to arrive Monday at 08:00.</p>
        </div>
        <button
          class="btn blue sm"
          type="button"
          disabled={!props.origin() || loading()}
          onClick={() => void check()}
        >
          {loading() ? 'Calculating…' : result() ? 'Update drive time' : 'Check drive time'}
        </button>
      </div>
      <Show when={!props.origin()}>
        <p class="small muted" role="status">
          Resolve the marked area's location to calculate the drive.
        </p>
      </Show>
      <Show when={result()}>
        {(drive) => (
          <div class="driving-time-result" role="status">
            <strong>{Math.round(drive().durationSeconds / 60)} min</strong>
            <span>{(drive().distanceMeters / 1000).toFixed(1)} km</span>
            <span>Leave by {vilniusTime(drive().leaveAt)}</span>
            <span>Updated {vilniusTime(drive().calculatedAt)}</span>
            <span class="google-maps-attribution" translate="no">
              Google Maps
            </span>
          </div>
        )}
      </Show>
      <Show when={error()}>
        {(message) => (
          <p class="small bad" role="alert">
            {message()}
          </p>
        )}
      </Show>
      <p class="small muted driving-time-note">
        Calculated on demand and not saved.{' '}
        <a href={wazeDirectionsUrl(CITY_CENTRE)} target="_blank" rel="noopener noreferrer">
          Open the city centre in Waze
        </a>{' '}
        to plan the drive there.
      </p>
      <p class="small muted driving-time-policy">
        <a href={policyUrl('privacy.html')}>Privacy</a> ·{' '}
        <a href={policyUrl('terms.html')}>Terms</a>
      </p>
    </section>
  )
}
