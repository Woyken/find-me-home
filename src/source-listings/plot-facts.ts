import type { CandidatePlotRecord } from './model'

export type PlotFactSource = 'registry' | 'household'

export const effectivePlotFacts = (
  plot: Pick<
    CandidatePlotRecord,
    | 'areaAres'
    | 'purposeText'
    | 'registeredParcelMatch'
    | 'registeredParcelAreaAres'
    | 'registeredParcelPurposeText'
  >,
) => {
  const registeredAreaAres = plot.registeredParcelAreaAres ?? null
  const registeredPurposeText = plot.registeredParcelPurposeText ?? null
  const areaFromRegistry = plot.registeredParcelMatch === 'confirmed' && registeredAreaAres !== null
  const purposeFromRegistry =
    plot.registeredParcelMatch === 'confirmed' && registeredPurposeText !== null
  return {
    areaAres: areaFromRegistry ? registeredAreaAres : (plot.areaAres ?? null),
    areaSource: areaFromRegistry ? 'registry' : 'household',
    purposeText: purposeFromRegistry ? registeredPurposeText : (plot.purposeText ?? null),
    purposeSource: purposeFromRegistry ? 'registry' : 'household',
  } satisfies {
    areaAres: number | null
    areaSource: PlotFactSource
    purposeText: string | null
    purposeSource: PlotFactSource
  }
}
