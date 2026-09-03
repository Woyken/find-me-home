import fs from 'node:fs'
import path from 'node:path'

export const validateWorkerEndpoint = (value: string | undefined) => {
  if (!value)
    throw new Error('VITE_WORKER_URL is required for a production build')
  let url: URL
  try {
    url = new URL(value)
  } catch {
    throw new Error(
      'VITE_WORKER_URL must be the production Worker HTTPS origin',
    )
  }
  if (
    url.protocol !== 'https:' ||
    url.hostname !== 'find-me-home-operations.karolis-uzkuraitis.workers.dev' ||
    url.pathname !== '/' ||
    url.search ||
    url.hash
  )
    throw new Error(
      'VITE_WORKER_URL must be the production Worker HTTPS origin',
    )
  return value.replace(/\/$/, '')
}

export const verifyArtifactText = (text: string, endpoint: string) => {
  if (!text.includes(endpoint))
    throw new Error(
      `Pages artifact does not contain Worker endpoint ${endpoint}`,
    )
  if (
    /https?:\\?\/\\?\/(?:localhost|127\.0\.0\.1|\[?::1\]?):(?:8787|3000)/i.test(
      text,
    )
  )
    throw new Error('Pages artifact contains a local Worker endpoint')
}

export const verifyArtifact = (directory: string, endpoint: string) => {
  const files = fs.readdirSync(directory, {
    recursive: true,
    withFileTypes: true,
  })
  const text = files
    .filter((entry) => entry.isFile())
    .map((entry) =>
      fs.readFileSync(path.join(entry.parentPath, entry.name), 'utf8'),
    )
    .join('\n')
  verifyArtifactText(text, endpoint)
}

const isMain = process.argv[1]?.endsWith('/verify-worker-build.ts')
if (isMain) {
  const endpoint = validateWorkerEndpoint(process.env.VITE_WORKER_URL)
  verifyArtifact(path.resolve(process.argv[2] ?? 'dist'), endpoint)
  console.log(`Verified Pages artifact Worker endpoint: ${endpoint}`)
}
