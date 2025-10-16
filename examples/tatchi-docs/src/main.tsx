import './app.css'
import { mountApp } from './mount'

const rootEl = document.getElementById('app-root')

if (!rootEl) {
  throw new Error('[tatchi-docs] Missing #app-root mount element')
}

mountApp(rootEl)
