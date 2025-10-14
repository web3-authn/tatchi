import DefaultTheme from 'vitepress/theme'
import type { Theme } from 'vitepress'

const theme: Theme = {
  ...DefaultTheme,
  enhanceApp: async (ctx) => {
    // Run default enhanceApp first (if any)
    // @ts-ignore - handle undefined when upstream changes
    await (DefaultTheme as any).enhanceApp?.(ctx)

    if (import.meta.env.SSR) return
    // Load styles used by embedded components (SDK only). Avoid importing app global CSS
    // to prevent layout conflicts with VitePress.
    await import('@tatchi/sdk/react/styles')

    // Lazily define the custom element only on client
    if (!customElements.get('wallet-navbar')) {
      await import('@app/components/registerNavbarWC')
    }

    // Patch brand links in sidebar/top bar to return to app root
    const forceExternal = (a: HTMLAnchorElement, url: string) => {
      a.href = url
      a.setAttribute('rel', 'external noopener')
      a.addEventListener('click', (ev) => {
        try { ev.preventDefault() } catch {}
        window.location.href = url
      }, { once: true })
    }

    const resolveAppRoot = (): string => {
      try {
        // Optional explicit override via env
        const envOrigin = (import.meta as any)?.env?.VITE_APP_PUBLIC_ORIGIN as string | undefined
        if (envOrigin && typeof envOrigin === 'string') {
          return envOrigin.endsWith('/') ? envOrigin : envOrigin + '/'
        }
        // Default: same-origin root
        const origin = window.location.origin
        return origin.endsWith('/') ? origin : origin + '/'
      } catch {
        // Fallback: relative root
        return '/'
      }
    }

    const appRoot = resolveAppRoot()

    // Respect configured docs base (avoid hardcoding '/docs/')
    const docsBase = (import.meta as any)?.env?.BASE_URL || '/'

    const patchBrandLinks = () => {
      try {
        const anchors = document.querySelectorAll<HTMLAnchorElement>(
          '.VPSidebar .VPSidebarBrand a, .VPNavBarTitle a'
        )
        anchors.forEach((a) => {
          forceExternal(a, appRoot)
        })
      } catch {}
    }
    patchBrandLinks()
    const mo = new MutationObserver(() => patchBrandLinks())
    mo.observe(document.documentElement, { subtree: true, childList: true })
    window.addEventListener('vitepress:afterPageLoad', patchBrandLinks)
    window.addEventListener('hashchange', patchBrandLinks)

    // Patch top nav items: Home -> '/', SDK -> '/docs/'
    const patchTopNav = () => {
      try {
        document
          .querySelectorAll<HTMLAnchorElement>('.VPNavBar .VPNavBarMenuLink')
          .forEach((a) => {
            const label = a.textContent?.trim()
            if (label === 'Home' || (label && label.includes('Back to Home'))) {
              forceExternal(a, appRoot)
            } else if (label === 'SDK') {
              a.href = docsBase
              a.removeAttribute('rel')
            }
          })
      } catch {}
    }
    patchTopNav()
    const mo2 = new MutationObserver(() => patchTopNav())
    mo2.observe(document.documentElement, { subtree: true, childList: true })
    window.addEventListener('vitepress:afterPageLoad', patchTopNav)
  },
}

export default theme
