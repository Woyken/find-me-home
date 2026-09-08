import { describe, expect, it } from 'vitest'
import { invitationSecretFrom } from '../households/credentials'

describe('invitationSecretFrom', () => {
  it('rejects malformed percent encoding instead of throwing during form submission', () => {
    expect(invitationSecretFrom('https://example.test/#household=%')).toBeNull()
  })
})
