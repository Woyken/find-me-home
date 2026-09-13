// @vitest-environment jsdom

import { render } from '@solidjs/web'
import { afterEach, expect, it, vi } from 'vitest'
import { DrivingTimeCard } from './DrivingTimeCard'

let dispose: (() => void) | undefined

afterEach(() => {
  dispose?.()
  dispose = undefined
  document.body.replaceChildren()
})

it('loads and renders a fresh Monday 08:00 driving estimate without persisting it', async () => {
  const load = vi.fn(async () => ({
    durationSeconds: 1_800,
    distanceMeters: 20_700,
    arriveBy: '2026-09-07T05:00:00.000Z',
    leaveAt: '2026-09-07T04:30:00.000Z',
    calculatedAt: '2026-09-04T10:00:00.000Z',
  }))
  const container = document.createElement('div')
  document.body.append(container)
  dispose = render(
    () => <DrivingTimeCard origin={() => ({ latitude: 54.7, longitude: 25.3 })} load={load} />,
    container,
  )

  container.querySelector<HTMLButtonElement>('button')?.click()
  await vi.waitFor(() => expect(container.textContent).toContain('30 min'))

  expect(load).toHaveBeenCalledWith(54.7, 25.3)
  expect(container.textContent).toContain('Leave by 07:30')
  expect(container.textContent).toContain('20.7 km')
  expect(container.textContent).toContain('arrive Monday at 08:00')
  expect(container.textContent).toContain('Updated 13:00')
  const attribution = [...container.querySelectorAll('span')].find(
    (element) => element.textContent === 'Google Maps',
  )
  expect(attribution?.getAttribute('translate')).toBe('no')
  expect(container.querySelector<HTMLAnchorElement>('a')?.href).toBe(
    'https://waze.com/ul?ll=54.6856478,25.2869905&navigate=yes',
  )
})
