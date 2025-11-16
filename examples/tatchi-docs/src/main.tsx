import { createRoot } from 'react-dom/client'
import { App } from './App'
import './app.css'
// Standalone dev page needs SDK styles globally
import '@tatchi-xyz/sdk/react/styles'

const rootEl = document.getElementById('app-root')

if (!rootEl) {
  throw new Error('[tatchi-docs] Missing #app-root mount element')
}

const root = createRoot(rootEl)
root.render(<App />)
