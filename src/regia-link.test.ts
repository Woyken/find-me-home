import { describe, expect, it } from 'vitest'
import { parseRegiaMapLink } from './regia-link'
import { toWgs84 } from './location-resolution'

describe('Regia Map Link', () => {
  it('parses an LKS94 map position and rounds it to six decimals', () => {
    const expected = toWgs84(586948, 6053276)
    expect(
      parseRegiaMapLink(
        'https://regia.lt/map/regia2?x=586948&y=6053276&scale=2004.818282666542&identify=true&sluo_ids=22',
      ),
    ).toEqual({
      ok: true,
      latitude: Number(expected.latitude.toFixed(6)),
      longitude: Number(expected.longitude.toFixed(6)),
    })
  })
  it.each([
    ['https://example.com/?x=1&y=2', 'not-regia'],
    ['https://regia.lt/map/regia2?x=1', 'no-position'],
    ['https://regia.lt/map/regia2?x=no&y=2', 'no-position'],
    ['https://regia.lt/map/regia2?x=500000&y=0', 'outside-lithuania'],
  ] as const)('returns %s for invalid links', (link, reason) => {
    expect(parseRegiaMapLink(link)).toEqual({ ok: false, reason })
  })
})
