import { createContext, createSignal, onCleanup, useContext } from 'solid-js'
import type { ParentProps } from 'solid-js'
import type { HouseholdRuntime } from './runtime'
import type { HouseholdRuntimeState } from './model'
import type { ReviewedImport } from '../source-listings/model'

type HouseholdContextValue = {
  state: () => HouseholdRuntimeState
  createHousehold: () => Promise<void>
  listHouseholds: HouseholdRuntime['listHouseholds']
  switchHousehold: HouseholdRuntime['switchHousehold']
  removeHousehold: HouseholdRuntime['removeHousehold']
  renameActiveHousehold: (name: string) => Promise<void>
  listSourceListings: HouseholdRuntime['listSourceListings']
  getSourceListing: HouseholdRuntime['getSourceListing']
  listImportInbox: HouseholdRuntime['listImportInbox']
  captureImportInbox: HouseholdRuntime['captureImportInbox']
  removeImportInbox: HouseholdRuntime['removeImportInbox']
  saveReviewedImport: (
    review: ReviewedImport,
  ) => ReturnType<HouseholdRuntime['saveReviewedImport']>
  addCandidatePlot: HouseholdRuntime['addCandidatePlot']
  updateCandidatePlot: HouseholdRuntime['updateCandidatePlot']
  resolveCandidatePlotLocation: HouseholdRuntime['resolveCandidatePlotLocation']
  isCandidatePlotLocationRunning: HouseholdRuntime['isCandidatePlotLocationRunning']
  getCandidatePlotLocationDiagnostic: HouseholdRuntime['getCandidatePlotLocationDiagnostic']
  runCandidatePlotAutomaticChecks: HouseholdRuntime['runCandidatePlotAutomaticChecks']
  isCandidatePlotAutomaticChecksRunning: HouseholdRuntime['isCandidatePlotAutomaticChecksRunning']
  getVisitPlan: HouseholdRuntime['getVisitPlan']
  setVisitPlan: HouseholdRuntime['setVisitPlan']
  markSourceListingVisited: HouseholdRuntime['markSourceListingVisited']
  removeSourceListing: HouseholdRuntime['removeSourceListing']
  getInvitationUrl: HouseholdRuntime['getInvitationUrl']
  getLastChangeAt: HouseholdRuntime['getLastChangeAt']
}

const HouseholdContext = createContext<HouseholdContextValue>()

export function HouseholdProvider(
  props: ParentProps<{ runtime: HouseholdRuntime }>,
) {
  const [state, setState] = createSignal(props.runtime.state(), {
    ownedWrite: true,
  })
  const unsubscribe = props.runtime.subscribe(() =>
    setState(() => ({ ...props.runtime.state() })),
  )
  const invitation = window.location.hash.match(/^#household=([^&]+)$/)?.[1]
  void (invitation
    ? props.runtime
        .joinHousehold(invitation)
        .then(() => {
          history.replaceState(
            history.state,
            '',
            `${location.pathname}${location.search}`,
          )
        })
        .catch(() => undefined)
    : props.runtime.start())
  onCleanup(() => {
    unsubscribe()
    props.runtime.dispose()
  })
  return (
    <HouseholdContext
      value={{
        state,
        createHousehold: () => props.runtime.createHousehold(),
        listHouseholds: () => {
          state()
          return props.runtime.listHouseholds()
        },
        switchHousehold: (householdId) =>
          props.runtime.switchHousehold(householdId),
        removeHousehold: (householdId) =>
          props.runtime.removeHousehold(householdId),
        renameActiveHousehold: (name: string) =>
          props.runtime.renameActiveHousehold(name),
        listSourceListings: () => {
          state()
          return props.runtime.listSourceListings()
        },
        getSourceListing: (id) => {
          state()
          return props.runtime.getSourceListing(id)
        },
        listImportInbox: () => {
          state()
          return props.runtime.listImportInbox()
        },
        captureImportInbox: (imports) =>
          props.runtime.captureImportInbox(imports),
        removeImportInbox: (id) => props.runtime.removeImportInbox(id),
        saveReviewedImport: (review) =>
          props.runtime.saveReviewedImport(review),
        addCandidatePlot: (sourceListingId) =>
          props.runtime.addCandidatePlot(sourceListingId),
        updateCandidatePlot: (sourceListingId, candidatePlotId, update) =>
          props.runtime.updateCandidatePlot(
            sourceListingId,
            candidatePlotId,
            update,
          ),
        resolveCandidatePlotLocation: (sourceListingId, candidatePlotId) =>
          props.runtime.resolveCandidatePlotLocation(
            sourceListingId,
            candidatePlotId,
          ),
        isCandidatePlotLocationRunning: (candidatePlotId) => {
          state()
          return props.runtime.isCandidatePlotLocationRunning(candidatePlotId)
        },
        getCandidatePlotLocationDiagnostic: (candidatePlotId) => {
          state()
          return props.runtime.getCandidatePlotLocationDiagnostic(
            candidatePlotId,
          )
        },
        runCandidatePlotAutomaticChecks: (sourceListingId, candidatePlotId) =>
          props.runtime.runCandidatePlotAutomaticChecks(
            sourceListingId,
            candidatePlotId,
          ),
        isCandidatePlotAutomaticChecksRunning: (candidatePlotId) => {
          state()
          return props.runtime.isCandidatePlotAutomaticChecksRunning(
            candidatePlotId,
          )
        },
        getVisitPlan: () => {
          state()
          return props.runtime.getVisitPlan()
        },
        setVisitPlan: (sourceListingIds) =>
          props.runtime.setVisitPlan(sourceListingIds),
        markSourceListingVisited: (sourceListingId) =>
          props.runtime.markSourceListingVisited(sourceListingId),
        removeSourceListing: (sourceListingId) =>
          props.runtime.removeSourceListing(sourceListingId),
        getInvitationUrl: () => props.runtime.getInvitationUrl(),
        getLastChangeAt: () => {
          state()
          return props.runtime.getLastChangeAt()
        },
      }}
    >
      {props.children}
    </HouseholdContext>
  )
}

export const useHousehold = () => useContext(HouseholdContext)
