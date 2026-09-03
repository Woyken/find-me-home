import { describe, expect, it } from 'vitest'
import {
  validateWorkerEndpoint,
  verifyArtifactText,
} from './verify-worker-build'

describe('Pages Worker configuration', () => {
  it('accepts only a production HTTPS Worker endpoint', () => {
    expect(
      validateWorkerEndpoint(
        'https://find-me-home-operations.karolis-uzkuraitis.workers.dev',
      ),
    ).toBe('https://find-me-home-operations.karolis-uzkuraitis.workers.dev')
    expect(() => validateWorkerEndpoint(undefined)).toThrow('VITE_WORKER_URL')
    expect(() => validateWorkerEndpoint('http://localhost:8787')).toThrow(
      'production Worker HTTPS',
    )
  })

  it('requires the endpoint and forbids local Worker fallbacks in the artifact', () => {
    const endpoint =
      'https://find-me-home-operations.karolis-uzkuraitis.workers.dev'
    expect(() =>
      verifyArtifactText(`const worker="${endpoint}"`, endpoint),
    ).not.toThrow()
    expect(() =>
      verifyArtifactText('const worker="http://localhost:8787"', endpoint),
    ).toThrow('does not contain')
    expect(() =>
      verifyArtifactText(`${endpoint} http://127.0.0.1:8787`, endpoint),
    ).toThrow('local Worker')
  })
})
