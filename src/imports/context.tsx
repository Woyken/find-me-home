import { createContext, createSignal, onCleanup, useContext } from 'solid-js'
import type { ParentProps } from 'solid-js'
import type { ImportTransport } from './aruodas'
import { decodeImportTransportFragment, restoreImportTransport } from './aruodas'

const STORAGE_KEY = 'find-me-home-import-draft'

type ImportContextValue = {
  draft: () => ImportTransport | undefined
  error: () => string
  clear: () => void
}

const ImportContext = createContext<ImportContextValue>()

export function ImportProvider(props: ParentProps) {
  const importFragment = () => {
    let draft: ImportTransport | undefined
    let error = ''
    const fragment = window.location.hash.match(/^#import=(.+)$/)?.[1]
    if (fragment) {
      history.replaceState(history.state, '', `${location.pathname}${location.search}`)
      try {
        const imported = decodeImportTransportFragment(fragment)
        sessionStorage.setItem(STORAGE_KEY, JSON.stringify(imported))
        draft = imported
      } catch {
        sessionStorage.removeItem(STORAGE_KEY)
        error = 'This import could not be read. Run the Aruodas bookmarklet again.'
      }
    } else {
      const stored = sessionStorage.getItem(STORAGE_KEY)
      if (stored) {
        try {
          draft = restoreImportTransport(JSON.parse(stored))
        } catch {
          sessionStorage.removeItem(STORAGE_KEY)
          error = 'This saved import could not be read. Run the Aruodas bookmarklet again.'
        }
      }
    }
    return { draft, error }
  }
  const initial = importFragment()
  const [draft, setDraft] = createSignal(initial.draft, { ownedWrite: true })
  const [error, setError] = createSignal(initial.error, { ownedWrite: true })
  const onHashChange = () => {
    const imported = importFragment()
    setDraft(imported.draft)
    setError(imported.error)
  }
  window.addEventListener('hashchange', onHashChange)
  onCleanup(() => window.removeEventListener('hashchange', onHashChange))
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
