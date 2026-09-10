import { toWgs84 } from './location-resolution'

export type RegiaMapLinkFailure = 'not-regia' | 'no-position' | 'outside-lithuania'
export type RegiaMapLinkResult =
  | { ok: true; latitude: number; longitude: number }
  | { ok: false; reason: RegiaMapLinkFailure }

export const regiaMapLinkMessage: Record<RegiaMapLinkFailure, string> = {
  'not-regia': 'Paste a link copied from regia.lt',
  'no-position': 'That Regia link has no map position',
  'outside-lithuania': 'That position is outside Lithuania',
}

export const parseRegiaMapLink = (text: string): RegiaMapLinkResult => {
  let url: URL
  try {
    url = new URL(text.trim())
  } catch {
    return { ok: false, reason: 'not-regia' }
  }
  if (url.hostname !== 'regia.lt' && url.hostname !== 'www.regia.lt')
    return { ok: false, reason: 'not-regia' }
  const xText = url.searchParams.get('x')
  const yText = url.searchParams.get('y')
  const x = Number(xText)
  const y = Number(yText)
  if (!xText?.trim() || !yText?.trim() || !Number.isFinite(x) || !Number.isFinite(y))
    return { ok: false, reason: 'no-position' }
  const point = toWgs84(x, y)
  const latitude = Number(point.latitude.toFixed(6))
  const longitude = Number(point.longitude.toFixed(6))
  if (latitude < 53.5 || latitude > 56.6 || longitude < 20.5 || longitude > 27)
    return { ok: false, reason: 'outside-lithuania' }
  return { ok: true, latitude, longitude }
}
