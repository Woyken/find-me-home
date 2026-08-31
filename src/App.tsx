import { Loading } from 'solid-js'
import { Router } from './router'
import './styles.css'

export default function App() {
  return (
    <Router>
      {(props) => (
        <Loading fallback={<main class="min-h-screen bg-[#f6f4ec]" />}>
          {props.children}
        </Loading>
      )}
    </Router>
  )
}
