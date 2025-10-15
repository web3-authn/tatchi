import React from 'react'
import { createRoot } from 'react-dom/client'
import { App } from './App'

export function mountApp(container: Element) {
  const root = createRoot(container)
  root.render(<App />)
  return () => root.unmount()
}
