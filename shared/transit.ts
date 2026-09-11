export type TransitService = 'city' | 'regional'

export interface TrafiRouteSegment {
  mode: string
  name?: string
  durationSeconds?: number
  startName?: string
  endName?: string
  transportGroup?: string
  transportType?: string
  transportName?: string
  color?: string
}

export interface TrafiRoute {
  durationSeconds: number
  startTime: string
  endTime: string
  segments: TrafiRouteSegment[]
}

export interface CommuteOption {
  service: TransitService
  durationSeconds: number
  walkDurationSeconds: number | null
  stopName: string | null
  summary: string | null
}

export interface CommuteResult {
  options: CommuteOption[]
  routesFound: number
  arriveBy: string
}
