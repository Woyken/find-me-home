import { createContext, createSignal, useContext } from 'solid-js'
import type { ParentProps } from 'solid-js'
import type { AruodasImport, ImportTransport } from './aruodas'
import { decodeImportTransportFragment } from './aruodas'

const STORAGE_KEY = 'find-me-home-import-draft'

type ImportContextValue = {
  draft: () => ImportTransport | undefined
  error: () => string
  clear: () => void
}

const ImportContext = createContext<ImportContextValue>()

export function ImportProvider(props: ParentProps) {
  let initialDraft: ImportTransport | undefined
  let initialError = ''
  {
    const fragment = window.location.hash.match(/^#import=(.+)$/)?.[1]
    if (fragment) {
      history.replaceState(
        history.state,
        '',
        `${location.pathname}${location.search}`,
      )
      try {
        const imported = decodeImportTransportFragment(fragment)
        sessionStorage.setItem(STORAGE_KEY, JSON.stringify(imported))
        initialDraft = imported
      } catch {
        sessionStorage.removeItem(STORAGE_KEY)
        initialError =
          'This import could not be read. Run the Aruodas bookmarklet again.'
      }
    } else {
      const stored = sessionStorage.getItem(STORAGE_KEY)
      if (stored) {
        try {
          const parsed = JSON.parse(stored) as
            ImportTransport | Record<string, unknown>
          initialDraft =
            'kind' in parsed
              ? (parsed as ImportTransport)
              : {
                  kind: 'listing',
                  imported: parsed as AruodasImport,
                }
        } catch {
          sessionStorage.removeItem(STORAGE_KEY)
        }
      }
    }
  }
  const [draft, setDraft] = createSignal(initialDraft, { ownedWrite: true })
  const [error, setError] = createSignal(initialError, { ownedWrite: true })
  return (
    <ImportContext
      value={{
        draft,
        error,
        clear: () => {
          sessionStorage.removeItem(STORAGE_KEY)
          setDraft(undefined)
          setError('')
        },
      }}
    >
      {props.children}
    </ImportContext>
  )
}

export const useImport = () => useContext(ImportContext)
