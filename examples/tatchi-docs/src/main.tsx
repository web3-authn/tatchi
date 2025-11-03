// Ensure Node-like globals for browserified deps (e.g., readable-stream)
import processShim from 'process'
import { Buffer as BufferShim } from 'buffer'
;(globalThis as any).process = { ...(globalThis as any).process, ...processShim, browser: true, version: (globalThis as any).process?.version || 'v0.0.0' }
;(globalThis as any).Buffer = (globalThis as any).Buffer || BufferShim

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
