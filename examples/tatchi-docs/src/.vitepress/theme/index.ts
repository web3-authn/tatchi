import DefaultTheme from 'vitepress/theme'
import type { Theme } from 'vitepress'
import { h, defineComponent, onMounted, onUnmounted } from 'vue'
import { useData } from 'vitepress'
import './custom.css'

// Bridge: keep VitePress internal isDark ref in sync when host forces appearance
const W3aAppearanceBridge = defineComponent({
  name: 'W3aAppearanceBridge',
  setup() {
    const { isDark } = useData()
    const handler = (e: Event) => {
      const ce = e as CustomEvent<'light' | 'dark'>
      const mode = ce?.detail
      if (mode === 'light' || mode === 'dark') {
        isDark.value = mode === 'dark'
      }
    }
    onMounted(() => { window.addEventListener('w3a:appearance', handler) })
    onUnmounted(() => { window.removeEventListener('w3a:appearance', handler) })
    return () => null
  }
})

function isServerRender(): boolean {
  return !!(import.meta as any)?.env?.SSR
}

function registerWalletAppElementLazy(): void {
  // Already registered
  if (customElements.get('wallet-app')) return

  // If the element is already present in DOM, load immediately after a tick
  const load = () => {
    if (customElements.get('wallet-app')) return
    // @ts-ignore - app-relative alias
    import('@app/components/registerAppShellWC')
  }

  const hasEl = !!document.querySelector('wallet-app')
  if (hasEl) {
    // Defer to yield to first paint
    (window as any).requestIdleCallback ? (window as any).requestIdleCallback(load) : setTimeout(load, 0)
    return
  }

  // Observe for the element being added, then register
  const mo = new MutationObserver(() => {
    if (document.querySelector('wallet-app')) {
      mo.disconnect()
      load()
    }
  })
  mo.observe(document.body, { subtree: true, childList: true })
}

function prefetchWalletAppOnIdle(): void {
  try {
    // Skip on SSR or if already defined
    if ((import.meta as any)?.env?.SSR) return
    if (customElements.get('wallet-app')) return

    // Respect Data Saver and very slow connections
    const nav: any = (navigator as any)
    const saveData = !!nav?.connection?.saveData
    const effectiveType = String(nav?.connection?.effectiveType || '')
    const isSlow = /(^|\b)(slow-2g|2g)\b/i.test(effectiveType)
    if (saveData || isSlow) return

    const doPrefetch = () => {
      // If element already defined due to other path, skip
      if (customElements.get('wallet-app')) return
      // Warm the chunk; this only defines the element. Heavy bits mount later.
      // @ts-ignore - app-relative alias
      import('@app/components/registerAppShellWC').catch(() => {})
    }

    const idle = (cb: () => void, timeout = 2000) =>
      (window as any).requestIdleCallback
        ? (window as any).requestIdleCallback(cb, { timeout })
        : setTimeout(cb, 1500)

    // Give the page a beat to paint, then idle-prefetch
    setTimeout(() => idle(doPrefetch), 700)
  } catch {}
}

function createRouterBridge(ctx: unknown) {
  const base = (import.meta as any)?.env?.BASE_URL || '/'
  const join = (to: string) => {
    if (/^https?:\/\//.test(to)) return to
    const normalizedBase = base.endsWith('/') ? base.slice(0, -1) : base
    const normalizedTarget = to.startsWith('/') ? to : `/${to}`
    return `${normalizedBase}${normalizedTarget}`
  }
  const go = (to: string) => {
    const url = join(to)
    const vpGo = (ctx as any)?.router?.go
    if (typeof vpGo === 'function') vpGo(url)
    else window.location.href = url
  }
  return { go }
}

function attachNavigateBridge(go: (to: string) => void): void {
  (window as any).__vp_go = go
  window.addEventListener('vp:navigate', (e: Event) => {
    const ce = e as CustomEvent<string>
    if (ce?.detail) go(ce.detail)
  })
}

function safeLocalStorageSet(key: string, value: string): void {
  try { localStorage.setItem(key, value) } catch (err) {
    console.debug('[vitepress-theme] localStorage.setItem failed:', err)
  }
}

function applyAppearance(mode: 'light' | 'dark'): void {
  const html = document.documentElement
  html.classList.toggle('dark', mode === 'dark')
  html.setAttribute('data-w3a-theme', mode)
  safeLocalStorageSet('vitepress-theme-appearance', mode)
  window.dispatchEvent(new CustomEvent<'light' | 'dark'>('w3a:appearance', { detail: mode }))
}

function toggleAppearance(): void {
  const isDark = document.documentElement.classList.contains('dark')
  applyAppearance(isDark ? 'light' : 'dark')
}

function isSdkLoggedIn(): boolean {
  return document.body.getAttribute('data-w3a-logged-in') === 'true'
}

function dispatchSdkToggle(): void {
  const currentSdkMode = document.body.getAttribute('data-w3a-theme') === 'dark' ? 'dark' : 'light'
  const next = currentSdkMode === 'dark' ? 'light' : 'dark'
  window.dispatchEvent(new CustomEvent<'light' | 'dark'>('w3a:set-theme', { detail: next }))
}

function handleThemeToggleClick(ev: Event): void {
  ev.preventDefault()
  if (isSdkLoggedIn()) dispatchSdkToggle()
  else toggleAppearance()
}

function wireThemeToggleLinks(): void {
  document.querySelectorAll('a[href="#toggle-theme"]').forEach((anchor) => {
    const el = anchor as HTMLAnchorElement
    el.removeEventListener('click', handleThemeToggleClick)
    el.addEventListener('click', handleThemeToggleClick, { capture: true })
  })
}

function setupThemeToggleBridge(): () => void {
  wireThemeToggleLinks()
  const mo = new MutationObserver(() => wireThemeToggleLinks())
  mo.observe(document.body, { subtree: true, childList: true })
  return () => { mo.disconnect() }
}

const theme: Theme = {
  ...DefaultTheme,
  Layout: () => h(DefaultTheme.Layout, null, {
    'layout-bottom': () => h(W3aAppearanceBridge),
  }),
  enhanceApp: async (ctx) => {
    // Run default enhanceApp first (if any)
    await (DefaultTheme as any).enhanceApp?.(ctx)

    if (isServerRender()) return

    // Defer registering the wallet app custom element until needed
    registerWalletAppElementLazy()
    // Also warm the wallet-app chunk shortly after FCP on capable networks
    prefetchWalletAppOnIdle()

    const { go } = createRouterBridge(ctx)
    attachNavigateBridge(go)

    setupThemeToggleBridge()

    // Keep data-w3a-theme on <html> in sync with VitePress root class
    const syncDataTheme = () => {
      const mode: 'light' | 'dark' = document.documentElement.classList.contains('dark') ? 'dark' : 'light'
      document.documentElement.setAttribute('data-w3a-theme', mode)
    }
    // Initial sync
    syncDataTheme()
    // React to class changes from VitePress UI
    const moTheme = new MutationObserver(syncDataTheme)
    moTheme.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] })

    // Hide VitePress navbar controls on the homepage only
    function isHomePath(): boolean {
      try {
        const base: string = ((import.meta as any)?.env?.BASE_URL || '/') as string
        const path = window.location.pathname
        const norm = (s: string) => (s.endsWith('/') ? s : s + '/')
        const baseNorm = norm(base)
        const pathNorm = norm(path.replace(/\/index\.html$/, '/'))
        return pathNorm === baseNorm
      } catch {
        return window.location.pathname === '/'
      }
    }

    function findNavEls(): HTMLElement[] {
      const sels = [
        '.VPNavBar .content .nav',
        '.VPNavBar .content .menu',
        '.VPNavBarExtra',
      ]
      const set = new Set<HTMLElement>()
      for (const sel of sels) {
        document.querySelectorAll(sel).forEach((el) => {
          if (el instanceof HTMLElement) set.add(el)
        })
      }
      return Array.from(set)
    }

    function applyHomepageNavbarVisibility(): void {
      const hide = isHomePath()
      findNavEls().forEach((el) => {
        el.style.setProperty('display', hide ? 'none' : '')
      })
    }

    applyHomepageNavbarVisibility()
    window.addEventListener('popstate', applyHomepageNavbarVisibility)
    window.addEventListener('hashchange', applyHomepageNavbarVisibility)
    window.addEventListener('vp:navigate', () => setTimeout(applyHomepageNavbarVisibility, 0))
    const mo2 = new MutationObserver(() => applyHomepageNavbarVisibility())
    mo2.observe(document.body, { subtree: true, childList: true })

    // Hide/show the default VitePress appearance toggle based on login + viewport
    function findAppearanceEls(): HTMLElement[] {
      const sels = [
        'a[href="#toggle-theme"]',
      ]
      const set = new Set<HTMLElement>()
      for (const sel of sels) {
        document.querySelectorAll(sel).forEach((el) => {
          if (el instanceof HTMLElement) set.add(el)
        })
      }
      return Array.from(set)
    }

    function applyAppearanceToggleVisibility(): void {
      try {
        // Only hide Appearance toggle on the homepage; always show on other pages
        const shouldHide = isHomePath()
        findAppearanceEls().forEach((el) => {
          el.style.setProperty('display', shouldHide ? 'none' : '')
        })
      } catch {}
    }

    // Initial and reactive updates (keep minimal)
    applyAppearanceToggleVisibility()
    window.addEventListener('resize', applyAppearanceToggleVisibility)
    window.addEventListener('w3a:login-state', applyAppearanceToggleVisibility as any)
    const mo = new MutationObserver(applyAppearanceToggleVisibility)
    mo.observe(document.body, { attributes: true, attributeFilter: ['data-w3a-logged-in'] })
    // Detach on HMR dispose if available
    if ((import.meta as any).hot) {
      // @ts-ignore
      import.meta.hot.dispose(() => {
        window.removeEventListener('resize', applyAppearanceToggleVisibility)
        window.removeEventListener('w3a:login-state', applyAppearanceToggleVisibility as any)
        window.removeEventListener('popstate', applyHomepageNavbarVisibility)
        window.removeEventListener('hashchange', applyHomepageNavbarVisibility)
        mo.disconnect()
        mo2.disconnect()
      })
    }
  },
}

export default theme
