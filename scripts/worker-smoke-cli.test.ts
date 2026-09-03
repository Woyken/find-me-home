import { spawnSync } from 'node:child_process'
import { describe, expect, it } from 'vitest'

describe('Worker smoke CLI', () => {
  it('loads through the production package command', () => {
    const result = spawnSync(
      'pnpm',
      ['smoke:worker', 'not-a-production-endpoint'],
      { encoding: 'utf8' },
    )

    expect(result.status).not.toBe(0)
    expect(result.stderr).toContain('production Worker HTTPS origin')
    expect(result.stderr).not.toContain('ERR_MODULE_NOT_FOUND')
  })
})
