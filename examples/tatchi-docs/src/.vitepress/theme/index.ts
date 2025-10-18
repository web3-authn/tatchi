import DefaultTheme from 'vitepress/theme'
import type { Theme } from 'vitepress'
import './custom.css'

const theme: Theme = {
  ...DefaultTheme,
  enhanceApp: async (ctx) => {
    // Run default enhanceApp first (if any)
    await (DefaultTheme as any).enhanceApp?.(ctx)

    // @ts-ignore
    if (import.meta.env.SSR) return
    // Load styles used by embedded components (SDK only). Avoid importing app global CSS
    // to prevent layout conflicts with VitePress.
    // @ts-ignore
    await import('@tatchi/sdk/react/styles')

    // Register the full app shell custom element
    if (!customElements.get('wallet-app')) {
      // @ts-ignore
      await import('@app/components/registerAppShellWC')
    }

    // Router bridge for embedded components (Shadow DOM safe)
    const base = (import.meta as any)?.env?.BASE_URL || '/'
    const join = (to: string) => {
      if (/^https?:\/\//.test(to)) return to
      const b = base.endsWith('/') ? base.slice(0, -1) : base
      const t = to.startsWith('/') ? to : `/${to}`
      return `${b}${t}`
    }
    const go = (to: string) => {
      const url = join(to)
      // @ts-ignore - VitePress router object in ctx when available
      // eslint-disable-next-line
      const vpGo = (ctx as any)?.router?.go
      if (typeof vpGo === 'function') vpGo(url)
      else window.location.href = url
    }
    ;(window as any).__vp_go = go
    window.addEventListener('vp:navigate', (e: Event) => {
      try {
        const ce = e as CustomEvent<string>
        if (ce?.detail) go(ce.detail)
      } catch {}
    })

    // Attach dark mode toggle to custom nav link
    const applyAppearance = (mode: 'light' | 'dark') => {
      const html = document.documentElement
      html.classList.toggle('dark', mode === 'dark')
      try { localStorage.setItem('vitepress-theme-appearance', mode) } catch {}
    }
    const toggleAppearance = () => {
      const isDark = document.documentElement.classList.contains('dark')
      applyAppearance(isDark ? 'light' : 'dark')
    }
    const wireToggleLinks = () => {
      document.querySelectorAll('a[href="#toggle-theme"]').forEach((a) => {
        const el = a as HTMLAnchorElement
        el.addEventListener('click', (ev) => {
          ev.preventDefault();
          // If SDK is active and user logged in, SDK theme takes precedence
          const isLoggedIn = document.body.getAttribute('data-w3a-logged-in') === 'true'
          if (isLoggedIn) {
            const sdkMode = (document.body.getAttribute('data-w3a-theme') === 'dark') ? 'dark' : 'light'
            applyAppearance(sdkMode as 'light' | 'dark')
          } else {
            toggleAppearance();
          }
        }, { capture: true })
      })
    }
    wireToggleLinks()
    const mo = new MutationObserver(() => wireToggleLinks())
    mo.observe(document.body, { subtree: true, childList: true })
  },
}

export default theme
