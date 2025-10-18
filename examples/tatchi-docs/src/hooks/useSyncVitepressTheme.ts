import * as React from 'react'
import { useTheme, usePasskeyContext } from '@tatchi/sdk/react'

/**
 * useSyncVitepressTheme
 * - When logged OUT: VitePress appearance (html.dark/localStorage) drives SDK theme.
 * - When logged IN: SDK theme drives VitePress appearance/storage.
 *
 * Keeps the two in sync without feedback loops by:
 * - Reading current html.dark and localStorage('vitepress-theme-appearance')
 * - Observing html class mutations (navbar toggle) and storage events (cross-tab)
 * - Applying precedence based on login state
 */
export function useSyncVitepressTheme() {
  const { theme, setTheme } = useTheme()
  const { loginState } = usePasskeyContext()

  React.useEffect(() => {
    if (typeof document === 'undefined') return

    const getVpMode = (): 'light' | 'dark' => {
      try {
        const isDark = document.documentElement.classList.contains('dark')
        return isDark ? 'dark' : 'light'
      } catch {
        try {
          const stored = localStorage.getItem('vitepress-theme-appearance')
          return stored === 'dark' ? 'dark' : 'light'
        } catch {}
        return 'light'
      }
    }

    const setVpMode = (mode: 'light' | 'dark') => {
      try {
        const root = document.documentElement
        root.classList.toggle('dark', mode === 'dark')
        try { localStorage.setItem('vitepress-theme-appearance', mode) } catch {}
      } catch {}
    }

    // Align once on mount (depends on login state precedence)
    try {
      const vpMode = getVpMode()
      if (loginState?.isLoggedIn) {
        if (vpMode !== theme) setVpMode(theme)
      } else {
        if (vpMode !== theme) setTheme(vpMode)
      }
    } catch {}

    // React to html class changes (VitePress navbar toggle)
    const mo = new MutationObserver(() => {
      try {
        const vpMode = getVpMode()
        if (loginState?.isLoggedIn) {
          if (vpMode !== theme) setVpMode(theme)
        } else {
          if (vpMode !== theme) setTheme(vpMode)
        }
      } catch {}
    })

    try { mo.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] }) } catch {}

    // Cross-tab/localStorage changes
    const onStorage = (e: StorageEvent) => {
      if (e.key !== 'vitepress-theme-appearance') return
      const next = e.newValue === 'dark' ? 'dark' : 'light'
      if (loginState?.isLoggedIn) {
        if (next !== theme) setVpMode(theme)
      } else {
        if (next !== theme) setTheme(next)
      }
    }
    try { window.addEventListener('storage', onStorage) } catch {}

    return () => {
      try { mo.disconnect() } catch {}
      try { window.removeEventListener('storage', onStorage) } catch {}
    }
  }, [theme, setTheme, loginState?.isLoggedIn])
}

