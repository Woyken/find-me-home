export function chooseImportedLocationClue(input: {
  uniqueRegistryNumber?: string | null
  latitude?: number | null
  longitude?: number | null
  address?: string | null
  precision: 'exact' | 'approx' | 'unknown'
}) {
  if (
    input.uniqueRegistryNumber &&
    /^\d{4}-\d{4}-\d{4}$/.test(input.uniqueRegistryNumber)
  ) {
    return {
      kind: 'registry' as const,
      parcelNumberClue: input.uniqueRegistryNumber,
      latitudeClue: null,
      longitudeClue: null,
      addressClue: null,
    }
  }
  const coordinates = {
    kind: 'coordinates' as const,
    parcelNumberClue: null,
    latitudeClue: input.latitude ?? null,
    longitudeClue: input.longitude ?? null,
    addressClue: null,
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
      parcelNumberClue: null,
      latitudeClue: null,
      longitudeClue: null,
      addressClue: input.address,
    }
  }
  if (input.latitude != null && input.longitude != null) return coordinates
  return {
    kind: 'address' as const,
    parcelNumberClue: null,
    latitudeClue: null,
    longitudeClue: null,
    addressClue: input.address ?? null,
  }
}
