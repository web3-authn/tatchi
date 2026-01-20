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
      // Also warm global CSS for portaled UI (Profile menu, Sonner) so first interaction is styled
      import('@tatchi-xyz/sdk/react/styles').catch(() => {})
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
  // Keep `data-w3a-theme` in sync for global CSS even when the React docs app
  // (wallet-app) is not mounted yet.
  try {
    const current = html.getAttribute('data-w3a-theme')
    if (current !== mode) html.setAttribute('data-w3a-theme', mode)
  } catch {}
  safeLocalStorageSet('vitepress-theme-appearance', mode)
  window.dispatchEvent(new CustomEvent<'light' | 'dark'>('w3a:appearance', { detail: mode }))
}

function toggleAppearance(): void {
  const isDark = document.documentElement.classList.contains('dark')
  const next = isDark ? 'light' : 'dark'
  applyAppearance(next)
  // Logged out: VitePress is the external source of truth; ask the SDK to match.
  try { window.dispatchEvent(new CustomEvent<'light' | 'dark'>('w3a:set-theme', { detail: next })) } catch {}
}

function isSdkLoggedIn(): boolean {
  return document.body.getAttribute('data-w3a-logged-in') === 'true'
}

function dispatchSdkToggle(): void {
  const currentSdkMode = document.documentElement.getAttribute('data-w3a-theme') === 'dark' ? 'dark' : 'light'
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

    // Initialize mermaid on client side
    if (typeof window !== 'undefined') {
      import('mermaid').then(({ default: mermaid }) => {
        // Detect if we're in dark mode
        const isDark = document.documentElement.classList.contains('dark')

        mermaid.initialize({
          startOnLoad: false,
          theme: 'base',
          themeVariables: {
            primaryColor: '#f0f9ff',
            primaryBorderColor: '#60a5fa',
            lineColor: '#94a3b8',
            fontSize: '16px',
            // Text colors: light in dark mode, dark in light mode
            primaryTextColor: isDark ? '#e2e8f0' : '#1e293b',
            secondaryTextColor: isDark ? '#cbd5e1' : '#334155',
            tertiaryTextColor: isDark ? '#94a3b8' : '#64748b',
            textColor: isDark ? '#e2e8f0' : '#1e293b',
            actorTextColor: isDark ? '#e2e8f0' : '#1e293b',
            labelTextColor: isDark ? '#e2e8f0' : '#1e293b',
            noteTextColor: isDark ? '#e2e8f0' : '#1e293b',
            // Participant boxes: blue in dark mode
            actorBkg: isDark ? '#2c6cbc' : '#f0f9ff',
            actorBorder: isDark ? '#2c6cbc' : '#60a5fa',
            // Note boxes: darker, less saturated orange in dark mode
            noteBkgColor: isDark ? '#c88755' : '#fef3c7',
            noteBorderColor: isDark ? '#c88755' : '#f59e0b',
          }
        })

        // Function to render mermaid diagrams
        const renderMermaid = async () => {
          const mermaidDivs = document.querySelectorAll('.language-mermaid')
          if (mermaidDivs.length === 0) return

          for (const div of Array.from(mermaidDivs)) {
            const pre = div.querySelector('pre')
            const code = pre?.querySelector('code')
            if (!code) continue

            const text = code.textContent || ''
            const id = `mermaid-${Math.random().toString(36).substr(2, 9)}`

            try {
              const { svg } = await mermaid.render(id, text)
              const container = document.createElement('div')
              container.className = 'mermaid'
              container.setAttribute('data-mermaid-source', text) // Store original source
              container.innerHTML = svg
              div.replaceWith(container)
            } catch (err) {
              console.error('Mermaid rendering error:', err)
            }
          }
        }

        // Initial render
        renderMermaid()

        // Re-render on route change
        ctx.router.onAfterRouteChanged = () => {
          setTimeout(renderMermaid, 0)
        }

        // Re-initialize and re-render when theme changes
        const handleThemeChange = () => {
          const isDark = document.documentElement.classList.contains('dark')
          mermaid.initialize({
            startOnLoad: false,
            theme: 'base',
            themeVariables: {
              primaryColor: '#f0f9ff',
              primaryBorderColor: '#60a5fa',
              lineColor: '#94a3b8',
              fontSize: '16px',
              // Text colors: light in dark mode, dark in light mode
              primaryTextColor: isDark ? '#e2e8f0' : '#1e293b',
              secondaryTextColor: isDark ? '#cbd5e1' : '#334155',
              tertiaryTextColor: isDark ? '#94a3b8' : '#64748b',
              textColor: isDark ? '#e2e8f0' : '#1e293b',
              actorTextColor: isDark ? '#e2e8f0' : '#1e293b',
              labelTextColor: isDark ? '#e2e8f0' : '#1e293b',
              noteTextColor: isDark ? '#e2e8f0' : '#1e293b',
              // Participant boxes: blue in dark mode
              actorBkg: isDark ? '#2c6cbc' : '#f0f9ff',
              actorBorder: isDark ? '#5896d9' : '#60a5fa',
              // Note boxes: darker, less saturated orange in dark mode
              noteBkgColor: isDark ? '#b46e3c' : '#fef3c7',
              noteBorderColor: isDark ? '#c88755' : '#f59e0b',
            }
          })
          // Force re-render by finding existing mermaid diagrams and replacing them with code blocks
          document.querySelectorAll('.mermaid[data-mermaid-source]').forEach((el) => {
            const source = el.getAttribute('data-mermaid-source')
            if (source) {
              // Re-create the code block structure
              const div = document.createElement('div')
              div.className = 'language-mermaid'
              const pre = document.createElement('pre')
              const code = document.createElement('code')
              code.textContent = source
              pre.appendChild(code)
              div.appendChild(pre)
              el.replaceWith(div)
            }
          })
          // Re-render with new colors
          setTimeout(renderMermaid, 50)
        }

        // Listen for both VitePress theme changes and our custom theme events
        const moTheme = new MutationObserver((mutations) => {
          for (const mutation of mutations) {
            if (mutation.type === 'attributes' && mutation.attributeName === 'class') {
              handleThemeChange()
              break
            }
          }
        })
        moTheme.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] })
      }).catch(() => {})
    }

    // Defer registering the wallet app custom element until needed
    registerWalletAppElementLazy()
    // Also warm the wallet-app chunk shortly after FCP on capable networks
    prefetchWalletAppOnIdle()

    const { go } = createRouterBridge(ctx)
    attachNavigateBridge(go)

    setupThemeToggleBridge()

    // Keep VitePress appearance (html.dark + localStorage) aligned with the SDK theme attribute.
    // Source of truth for integration is `document.documentElement[data-w3a-theme]`.
    const setupSdkThemeObserver = (): (() => void) => {
      const root = document.documentElement
      const read = (): 'light' | 'dark' | null => {
        try {
          const v = root.getAttribute('data-w3a-theme')
          return v === 'light' || v === 'dark' ? v : null
        } catch {
          return null
        }
      }
      let last: 'light' | 'dark' | null = null
      const sync = () => {
        const mode = read()
        if (!mode) return
        if (mode === last) return
        last = mode
        applyAppearance(mode)
      }
      // Seed on attach so first paint matches controller if wallet-app already ran
      sync()
      const mo = new MutationObserver(() => sync())
      mo.observe(root, { attributes: true, attributeFilter: ['data-w3a-theme'] })
      return () => { mo.disconnect() }
    }

    const detachSdkThemeObserver = setupSdkThemeObserver()

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
        try { detachSdkThemeObserver?.() } catch {}
        mo.disconnect()
        mo2.disconnect()
      })
    }
  },
}

export default theme
