import { render } from '@solidjs/web'
import App from './App'

if (import.meta.env.MODE === 'e2e') {
  void import('./e2e/bootstrap')
} else {
  const root = document.getElementById('root')
  if (!root) throw new Error('Application root is missing')

  render(() => <App />, root)
}
