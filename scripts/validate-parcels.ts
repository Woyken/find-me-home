import { readdir, stat } from 'node:fs/promises'
import path from 'node:path'
import { validateParcelAssets } from '../src/parcels/artifacts.ts'

const directory = path.resolve(process.argv[2] ?? 'dist/parcels')
const manifest = await validateParcelAssets(directory)
const siteDirectory = path.dirname(directory)

async function directorySize(directoryPath: string): Promise<number> {
  let bytes = 0
  for (const entry of await readdir(directoryPath, { withFileTypes: true })) {
    const entryPath = path.join(directoryPath, entry.name)
    bytes += entry.isDirectory()
      ? await directorySize(entryPath)
      : (await stat(entryPath)).size
  }
  return bytes
}

const deployedBytes = await directorySize(siteDirectory)
if (deployedBytes > 1_000_000_000) {
  throw new Error(`Pages artifact exceeds size limit: ${deployedBytes} bytes`)
}
console.log(
  `Validated Registered Parcel dataset ${manifest.datasetVersion} and ${deployedBytes}-byte Pages artifact.`,
)
