import { query } from '@solidjs/router'
import {
  fetchImportDraft,
  fetchSourceListing,
  fetchSourceListings,
  fetchVisitPlan,
} from './server-functions/source-listings'
import type {
  ImportDraft,
  SourceListingDetail,
  SourceListingSummary,
} from './server/source-listings'

export const sourceListingsQuery = query(
  fetchSourceListings,
  'source-listings',
) as () => Promise<Array<SourceListingSummary>>
export const visitPlanQuery = query(
  fetchVisitPlan,
  'visit-plan',
) as () => Promise<Array<SourceListingSummary>>
export const sourceListingQuery = query(
  (id: number) => fetchSourceListing({ data: { id } }),
  'source-listing',
) as (id: number) => Promise<SourceListingDetail | null>
export const importDraftQuery = query(
  (token: string) => fetchImportDraft({ data: { token } }),
  'import-draft',
) as (token: string) => Promise<ImportDraft | null>
