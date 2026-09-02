import { describe, expect, it } from 'vitest'
import { createHouseholdCredentialSource } from './credentials'

describe('Household credentials', () => {
  it('generates 256 bits and derives stable domain-separated credentials', async () => {
    let requestedBytes = 0
    const cryptoApi = {
      subtle: crypto.subtle,
      getRandomValues: <T extends ArrayBufferView | null>(array: T) => {
        requestedBytes = array?.byteLength ?? 0
        if (array instanceof Uint8Array) {
          array.set(Array.from({ length: array.length }, (_, index) => index))
        }
        return array
      },
    } as Crypto
    const source = createHouseholdCredentialSource({ crypto: cryptoApi })

    const created = await source.create()
    const derived = await source.derive(created.invitationSecret)

    expect(requestedBytes).toBe(32)
    expect(derived).toEqual(created)
    expect(created.householdId).not.toBe(created.invitationSecret)
    expect(created.roomPassword).not.toBe(created.invitationSecret)
    expect(created.roomPassword).not.toBe(created.householdId)
  })

  it('rejects invitation secrets that are not exactly 256 bits', async () => {
    const source = createHouseholdCredentialSource({ crypto })

    await expect(source.derive('not-a-secret')).rejects.toThrow(
      'Invitation secret must contain exactly 256 bits',
    )
  })
})
