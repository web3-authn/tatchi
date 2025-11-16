import type { Root } from 'react-dom/client'

class WalletAppElement extends HTMLElement {
  private root: Root | null = null
  private shadow: ShadowRoot | null = null

  async connectedCallback() {
    if (this.shadow) return
    this.shadow = this.attachShadow({ mode: 'open' })

    const mount = async () => {
      const shadow = this.shadow
      if (!shadow) return
      // Lazily import React + app + styles when we’re ready to mount
      const [React, { createRoot }, appMod, sdkCssMod, appShellCssMod, sonnerCssMod] = await Promise.all([
        import('react'),
        import('react-dom/client'),
        import('../App'),
        import('@tatchi-xyz/sdk/react/styles?inline'),
        import('../app.css?inline'),
        import('../.vitepress/theme/vendor/sonner-full.css?inline'),
      ])

      // Inject SDK + app styles into the shadow root
      const styleSheets = [sdkCssMod.default, appShellCssMod.default, sonnerCssMod.default]
      const sheetTags = styleSheets.map((sheet) => {
        const styleTag = document.createElement('style')
        styleTag.textContent = (sheet as string) ?? ''
        shadow.appendChild(styleTag)
        return styleTag
      })

      const container = document.createElement('app')
      container.className = "app-shell"
      shadow.appendChild(container)

      this.root = createRoot(container)
      this.root.render(React.createElement(appMod.App))

      // Optional: HMR for injected CSS in dev
      if ((import.meta as any).hot) {
        // Accept HMR for both SDK styles and app shell styles injected into the ShadowRoot
        // @ts-ignore - vite hot types
        import.meta.hot.accept([
          '@tatchi-xyz/sdk/react/styles?inline',
          '../app.css?inline',
          '../.vitepress/theme/vendor/sonner-full.css?inline',
        ], (mods: any[]) => {
          const [sdkNext, appNext, sonnerNext] = mods
          const sheets = [
            sdkNext?.default,
            appNext?.default,
            sonnerNext?.default,
          ]
          sheetTags.forEach((styleEl, idx) => {
            try { styleEl.textContent = sheets[idx] ?? '' } catch {}
          })
        })
      }
    }

    // Defer mounting until the element is near/within viewport for faster FCP
    const scheduleMount = () => ((window as any).requestIdleCallback ? (window as any).requestIdleCallback(mount) : setTimeout(mount, 0))
    if ('IntersectionObserver' in window) {
      const io = new IntersectionObserver((entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          io.disconnect()
          scheduleMount()
        }
      }, { rootMargin: '200px' })
      io.observe(this)
    } else {
      scheduleMount()
    }
  }

  disconnectedCallback() {
    try { this.root?.unmount() } finally { this.root = null }
  }
}

if (!customElements.get('wallet-app')) {
  customElements.define('wallet-app', WalletAppElement)
}
