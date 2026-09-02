import type { HouseholdCredentials } from './model'

export type HouseholdCredentialSource = {
  create: () => Promise<HouseholdCredentials>
  derive: (invitationSecret: string) => Promise<HouseholdCredentials>
}

const encoder = new TextEncoder()

const encodeBase64Url = (bytes: Uint8Array) => {
  let value = ''
  for (const byte of bytes) value += String.fromCharCode(byte)
  return btoa(value)
    .replaceAll('+', '-')
    .replaceAll('/', '_')
    .replace(/=+$/, '')
}

const decodeBase64Url = (value: string) => {
  if (!/^[A-Za-z0-9_-]{43}$/.test(value)) {
    throw new Error('Invitation secret must contain exactly 256 bits')
  }
  const padded = value.replaceAll('-', '+').replaceAll('_', '/') + '='
  const decoded = atob(padded)
  const bytes = Uint8Array.from(decoded, (character) => character.charCodeAt(0))
  if (bytes.byteLength !== 32) {
    throw new Error('Invitation secret must contain exactly 256 bits')
  }
  return bytes
}

const deriveValue = async (
  cryptoApi: Crypto,
  secret: Uint8Array,
  context: string,
) => {
  const input = new Uint8Array(
    secret.byteLength + encoder.encode(context).byteLength,
  )
  input.set(secret)
  input.set(encoder.encode(context), secret.byteLength)
  return encodeBase64Url(
    new Uint8Array(await cryptoApi.subtle.digest('SHA-256', input)),
  )
}

export const createHouseholdCredentialSource = (dependencies: {
  crypto: Crypto
}): HouseholdCredentialSource => ({
  async create() {
    const secret = dependencies.crypto.getRandomValues(new Uint8Array(32))
    return this.derive(encodeBase64Url(secret))
  },
  async derive(invitationSecret) {
    const secret = decodeBase64Url(invitationSecret)
    const [householdId, roomPassword] = await Promise.all([
      deriveValue(dependencies.crypto, secret, 'find-me-home/household-id/v1'),
      deriveValue(
        dependencies.crypto,
        secret,
        'find-me-home/trystero-room-password/v1',
      ),
    ])
    return { invitationSecret, householdId, roomPassword }
  },
})
