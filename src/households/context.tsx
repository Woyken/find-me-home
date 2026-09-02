import { createContext, createSignal, onCleanup, useContext } from 'solid-js'
import type { ParentProps } from 'solid-js'
import type { HouseholdRuntime } from './runtime'
import type { HouseholdRuntimeState } from './model'
import type { ReviewedImport } from '../source-listings/model'

type HouseholdContextValue = {
  state: () => HouseholdRuntimeState
  createHousehold: () => Promise<void>
  renameActiveHousehold: (name: string) => Promise<void>
  listSourceListings: HouseholdRuntime['listSourceListings']
  getSourceListing: HouseholdRuntime['getSourceListing']
  saveReviewedImport: (
    review: ReviewedImport,
  ) => ReturnType<HouseholdRuntime['saveReviewedImport']>
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
  void props.runtime.start()
  onCleanup(() => {
    unsubscribe()
    props.runtime.dispose()
  })
  return (
    <HouseholdContext
      value={{
        state,
        createHousehold: () => props.runtime.createHousehold(),
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
        saveReviewedImport: (review) =>
          props.runtime.saveReviewedImport(review),
      }}
    >
      {props.children}
    </HouseholdContext>
  )
}

export const useHousehold = () => useContext(HouseholdContext)
