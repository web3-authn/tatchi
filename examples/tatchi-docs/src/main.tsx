import React from 'react'
import { createRoot } from 'react-dom/client'
import { App } from './App'
import './app.css'

const rootEl = document.getElementById('app-root')

if (!rootEl) {
  throw new Error('[tatchi-docs] Missing #app-root mount element')
}

const root = createRoot(rootEl)
root.render(<App />)
