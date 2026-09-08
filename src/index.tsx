import { render } from '@solidjs/web'
import App from './App'
import { e2eInitializerPath, e2eReturnPath, e2eStorageKey, shouldBootE2e } from './e2e/selector'

if (location.pathname === e2eInitializerPath()) {
  sessionStorage.setItem(e2eStorageKey, 'true')
  location.replace(e2eReturnPath(new URLSearchParams(location.search).get('return')))
} else if (shouldBootE2e(import.meta.env.MODE)) {
  void import('./e2e/bootstrap')
} else {
  const root = document.getElementById('root')
  if (!root) throw new Error('Application root is missing')

  render(() => <App />, root)
}
