import { render } from '@solidjs/web'
import App from './App'
import { shouldBootE2e } from './e2e/selector'

if (shouldBootE2e(import.meta.env.MODE, location.search)) {
  void import('./e2e/bootstrap')
} else {
  const root = document.getElementById('root')
  if (!root) throw new Error('Application root is missing')

  render(() => <App />, root)
}
