export function chooseImportedLocationClue(input: {
  uniqueRegistryNumber?: string | null
  latitude?: number | null
  longitude?: number | null
  address?: string | null
  precision: 'exact' | 'approx' | 'unknown'
}) {
  const coordinateCluePrecision: 'exact' | 'approx' | null =
    input.latitude != null && input.longitude != null
      ? input.precision === 'exact'
        ? 'exact'
        : 'approx'
      : null
  const clues = {
    parcelNumberClue: input.uniqueRegistryNumber ?? null,
    latitudeClue: input.latitude ?? null,
    longitudeClue: input.longitude ?? null,
    coordinateCluePrecision,
    addressClue: input.address ?? null,
  }
  if (
    input.uniqueRegistryNumber &&
    /^\d{4}-\d{4}-\d{4}$/.test(input.uniqueRegistryNumber)
  ) {
    return {
      kind: 'registry' as const,
      ...clues,
    }
  }
  const coordinates = {
    kind: 'coordinates' as const,
    ...clues,
  }
  if (
    input.precision === 'exact' &&
    input.latitude != null &&
    input.longitude != null
  ) {
    return coordinates
  }
  if (input.address && /\d/.test(input.address)) {
    return {
      kind: 'address' as const,
      ...clues,
    }
  }
  if (input.latitude != null && input.longitude != null) return coordinates
  return {
    kind: 'address' as const,
    ...clues,
  }
}
