import React from 'react'
import { createRoot, type Root } from 'react-dom/client'
import '@tatchi/sdk/react/styles'
import { App } from '../App'
// eslint-disable-next-line
// @ts-ignore - treat compiled CSS bundle as inline string
import sdkCss from '@tatchi/sdk/react/styles?inline'
// eslint-disable-next-line
// @ts-ignore - import app stylesheet as inline text
import appShellCss from '../app.css?inline'
// eslint-disable-next-line
// @ts-ignore - vendor sonner CSS into the ShadowRoot to ensure fixed positioning
import sonnerCss from '../.vitepress/theme/vendor/sonner-full.css?inline'

class WalletAppElement extends HTMLElement {
  private root: Root | null = null
  private shadow: ShadowRoot | null = null

  connectedCallback() {
    if (this.shadow) return
    this.shadow = this.attachShadow({ mode: 'open' })

    // Inject SDK + app styles into the shadow root
    const styleSheets = [sdkCss, appShellCss, sonnerCss]
    const sheetTags = styleSheets.map((sheet) => {
      const styleTag = document.createElement('style')
      styleTag.textContent = (sheet as string) ?? ''
      this.shadow!.appendChild(styleTag)
      return styleTag
    })

    const container = document.createElement('app')
    container.className = "app-shell"
    this.shadow.appendChild(container)

    this.root = createRoot(container)
    this.root.render(<App />)

    // Optional: HMR for injected CSS in dev
    if ((import.meta as any).hot) {
      // @ts-ignore - vite hot types
      import.meta.hot.accept(['../app.css?inline'], (mods: any[]) => {
        const sheets = [sdkCss, ...(mods.map((m) => m?.default ?? ''))]
        sheetTags.forEach((styleEl, idx) => {
          try { styleEl.textContent = sheets[idx] ?? '' } catch {}
        })
      })
    }
  }

  disconnectedCallback() {
    try { this.root?.unmount() } finally { this.root = null }
  }
}

if (!customElements.get('wallet-app')) {
  customElements.define('wallet-app', WalletAppElement)
}
