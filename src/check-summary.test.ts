import { describe, expect, it } from 'vitest'
import { checkCells, checkTroubleScore, summarizeChecks } from './check-summary'

describe('check cells and summary', () => {
  it('always yields 13 cells in canonical order, filling gaps with unknown', () => {
    const cells = checkCells([
      { key: 'noise', status: 'pass', value: 'Quiet', detail: null },
    ])
    expect(cells).toHaveLength(13)
    expect(cells[0].key).toBe('price')
    expect(cells[0].status).toBe('unknown')
    expect(cells[0].value).toBe('Not checked')
    expect(cells.find((cell) => cell.key === 'noise')).toMatchObject({
      status: 'pass',
      value: 'Quiet',
      label: 'Noise',
    })
  })

  it('says "not checked yet" when nothing has run', () => {
    expect(summarizeChecks(checkCells(null))).toEqual({
      kind: 'unchecked',
      lead: null,
      text: 'not checked yet',
    })
  })

  it('names the failing checks first', () => {
    const summary = summarizeChecks(
      checkCells([
        { key: 'purpose', status: 'fail', value: 'Agricultural', detail: null },
        { key: 'water_sewage', status: 'fail', value: 'None', detail: null },
        { key: 'noise', status: 'warning', value: 'Road', detail: null },
      ]),
    )
    expect(summary).toMatchObject({
      kind: 'problems',
      lead: '2 problems',
      text: 'land purpose, water & sewage',
    })
  })

  it('counts warnings when there are no failures', () => {
    expect(
      summarizeChecks(
        checkCells([
          { key: 'noise', status: 'warning', value: 'Road', detail: null },
          { key: 'price', status: 'pass', value: '1 €', detail: null },
        ]),
      ),
    ).toMatchObject({ kind: 'look', text: '1 to look at' })
  })

  it('celebrates when everything passes', () => {
    const cells = checkCells(
      checkCells(null).map((cell) => ({
        key: cell.key,
        status: 'pass' as const,
        value: 'ok',
        detail: null,
      })),
    )
    expect(summarizeChecks(cells)).toMatchObject({
      kind: 'fine',
      text: 'all 13 fine',
    })
  })

  it('ranks failures far above warnings, and unchecked plots last-ish', () => {
    const fail = checkCells([
      { key: 'price', status: 'fail', value: '', detail: null },
      { key: 'area', status: 'pass', value: '', detail: null },
    ])
    const warn = checkCells([
      { key: 'price', status: 'warning', value: '', detail: null },
      { key: 'area', status: 'pass', value: '', detail: null },
    ])
    const clean = checkCells([
      { key: 'price', status: 'pass', value: '', detail: null },
    ])
    expect(checkTroubleScore(clean)).toBeLessThan(checkTroubleScore(warn))
    expect(checkTroubleScore(warn)).toBeLessThan(checkTroubleScore(fail))
    expect(checkTroubleScore(checkCells(null))).toBeGreaterThan(
      checkTroubleScore(warn),
    )
  })
})
