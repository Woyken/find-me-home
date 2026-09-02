import { mkdtemp, readFile, writeFile } from 'node:fs/promises'
import { createHash } from 'node:crypto'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { gunzipSync, gzipSync } from 'node:zlib'
import { describe, expect, it } from 'vitest'
import {
  PARCEL_MUNICIPALITIES,
  buildParcelAssets,
  validateParcelAssets,
} from './artifacts'
import type { ParcelSource } from './artifacts'

const square = (
  minX: number,
  minY: number,
  size = 100,
): ParcelSource['parcels'][number]['rings'] => [
  [
    [minX, minY],
    [minX + size, minY],
    [minX + size, minY + size],
    [minX, minY + size],
    [minX, minY],
  ],
]

function sources(): Array<ParcelSource> {
  return PARCEL_MUNICIPALITIES.map((municipalityCode, index) => ({
    municipalityCode,
    sourceVersion: `fixture-${municipalityCode}`,
    parcels: [
      {
        cadastralNumber: `0101/000${index}:${index + 1}`,
        uniqueNumber: `${municipalityCode}0012345678`,
        purposeText: 'Agricultural',
        areaM2: 10_000,
        rings:
          municipalityCode === 13
            ? square(499_950, 6_000_000, 100)
            : square(500_000 + index * 10_000, 6_000_000),
      },
    ],
  }))
}

describe('Registered Parcel artifacts', () => {
  it('makes every parcel reachable by all intersecting cells and complete numbers', async () => {
    const outputDirectory = await mkdtemp(path.join(tmpdir(), 'parcels-'))
    const manifest = await buildParcelAssets(sources(), outputDirectory, {
      builtAt: '2026-09-02T00:00:00.000Z',
    })

    expect(Object.keys(manifest.municipalities).map(Number).sort()).toEqual([
      ...PARCEL_MUNICIPALITIES,
    ])
    expect(manifest.cells['99_1200'].parcelCount).toBe(1)
    expect(manifest.cells['100_1200'].parcelCount).toBe(1)
    expect(manifest.prefixes['1300']).toBeDefined()

    const prefix = JSON.parse(
      gunzipSync(
        await readFile(
          path.join(outputDirectory, manifest.prefixes['1300'].path),
        ),
      ).toString(),
    ) as { references: Array<[string, Array<[number, string, string]>]> }
    expect(prefix.references).toContainEqual([
      '130012345678',
      [
        [13, '99_1200', '13:0'],
        [13, '100_1200', '13:0'],
      ],
    ])
    await expect(validateParcelAssets(outputDirectory)).resolves.toEqual(
      manifest,
    )

    const prefixPath = path.join(
      outputDirectory,
      manifest.prefixes['1300'].path,
    )
    const incomplete = JSON.parse(
      gunzipSync(await readFile(prefixPath)).toString(),
    ) as { references: Array<[string, Array<[number, string, string]>]> }
    incomplete.references[0][1].pop()
    const incompleteBytes = gzipSync(JSON.stringify(incomplete))
    await writeFile(prefixPath, incompleteBytes)
    manifest.prefixes['1300'].sha256 = createHash('sha256')
      .update(incompleteBytes)
      .digest('hex')
    await writeFile(
      path.join(outputDirectory, 'manifest.json'),
      JSON.stringify(manifest),
    )
    await expect(validateParcelAssets(outputDirectory)).rejects.toThrow(
      /reachability/i,
    )
  })

  it('rejects corrupted and oversized publication assets', async () => {
    const outputDirectory = await mkdtemp(path.join(tmpdir(), 'parcels-'))
    const manifest = await buildParcelAssets(sources(), outputDirectory)
    const asset = Object.values(manifest.cells)[0]
    await writeFile(path.join(outputDirectory, asset.path), 'not gzip')

    await expect(validateParcelAssets(outputDirectory)).rejects.toThrow(
      /checksum|corrupt|gzip/i,
    )
    await buildParcelAssets(sources(), outputDirectory)
    await expect(
      validateParcelAssets(outputDirectory, { maxTotalBytes: 1 }),
    ).rejects.toThrow(/size limit/i)

    const manifestPath = path.join(outputDirectory, 'manifest.json')
    const tampered = JSON.parse(await readFile(manifestPath, 'utf8')) as {
      sourceVersions: Record<string, string>
    }
    tampered.sourceVersions['13'] = 'different-package'
    await writeFile(manifestPath, JSON.stringify(tampered))
    await expect(validateParcelAssets(outputDirectory)).rejects.toThrow(
      /dataset version mismatch/i,
    )
  })
})
