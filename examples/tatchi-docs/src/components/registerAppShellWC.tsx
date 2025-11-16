/*
  wallet-app custom element

  What this does and why:
  - Creates a ShadowRoot and mounts the React docs app (<App />) inside it.
  - Injects SDK + app + sonner CSS into the ShadowRoot so styles are scoped.
  - Also injects critical SDK/Sonner CSS into document.head for portaled UI
    (e.g., ProfileSettings menu, toasts) that render into document.body.
  - Defers mounting until the element is near the viewport (IntersectionObserver)
    to keep first paint light, with a requestIdleCallback fallback.
*/
import type { Root } from 'react-dom/client'

class WalletAppElement extends HTMLElement {
  private root: Root | null = null
  private shadow: ShadowRoot | null = null
  private isMounting: boolean = false
  private mountScheduled: boolean = false

  async connectedCallback() {
    if (this.shadow) return
    this.shadow = this.attachShadow({ mode: 'open' })

    const mount = async () => {
      // Prevent double-mount if both IO and idle fire
      if (this.root || this.isMounting) return
      this.isMounting = true
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

      // Ensure styles for any portaled UI (e.g., ProfileSettingsMenu, Sonner) exist in the main document as well.
      // This covers components that render into document.body via React portals and therefore
      // cannot see ShadowRoot-scoped CSS.
      try {
        const ensureGlobalStyle = (id: string, css: string | undefined) => {
          if (!css) return
          if (document.getElementById(id)) return
          const tag = document.createElement('style')
          tag.id = id
          tag.textContent = css
          document.head.appendChild(tag)
        }
        ensureGlobalStyle('w3a-sdk-react-styles-global', sdkCssMod.default as string)
        ensureGlobalStyle('w3a-sonner-styles-global', sonnerCssMod.default as string)
      } catch {}

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
      // Clear mounting flag after render tick
      try { /* no-op */ } finally { this.isMounting = false }
    }

    // Mount strategy
    // 1) If supported, use IntersectionObserver to mount when the element is
    //    close to or within the viewport. This avoids loading the React bundle
    //    if the user never scrolls to the demo on the homepage.
    // 2) As a safety net, also schedule an idle mount so background tabs or
    //    non-observable environments still initialize eventually.

    const scheduleIdle = () => {
      if (this.mountScheduled) return
      this.mountScheduled = true
      const cb = () => mount()
      if ((window as any).requestIdleCallback) {
        (window as any).requestIdleCallback(cb, { timeout: 1500 })
      } else {
        setTimeout(cb, 800)
      }
    }

    if ('IntersectionObserver' in window) {
      const io = new IntersectionObserver((entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          io.disconnect()
          scheduleIdle()
        }
      }, { rootMargin: '200px' })
      io.observe(this)
      // Fallback: if IO never fires (e.g., background tab), still mount on idle
      scheduleIdle()
    } else {
      scheduleIdle()
    }
  }

  disconnectedCallback() {
    try { this.root?.unmount() } finally { this.root = null }
  }
}

if (!customElements.get('wallet-app')) {
  customElements.define('wallet-app', WalletAppElement)
}
