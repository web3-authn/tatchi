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
  const { loginState, passkeyManager } = usePasskeyContext()
  const prevLoggedInRef = React.useRef<boolean | null>(null)
  // Guard to prevent feedback when we intentionally push SDK → VitePress
  const syncingVpFromSdkRef = React.useRef<boolean>(false)

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
        syncingVpFromSdkRef.current = true
        const root = document.documentElement
        root.classList.toggle('dark', mode === 'dark')
        try { localStorage.setItem('vitepress-theme-appearance', mode) } catch {}
        // Sync VitePress internal isDark ref (via bridge in custom theme Layout)
        try { window.dispatchEvent(new CustomEvent<'light' | 'dark'>('w3a:appearance', { detail: mode })) } catch {}
        // Defer clearing to batch MO notifications from this single update
        try { setTimeout(() => { syncingVpFromSdkRef.current = false }, 0) } catch { syncingVpFromSdkRef.current = false }
      } catch {}
    }

    const isLoggedIn = !!loginState?.isLoggedIn
    const prevLoggedIn = prevLoggedInRef.current

    // On first mount or when logged out
    try {
      const vpMode = getVpMode()
      if (!isLoggedIn) {
        // If we JUST logged out, do a one-time SDK -> VitePress sync
        if (prevLoggedIn === true) {
          if (vpMode !== theme) setVpMode(theme)
        } else {
          // Otherwise, follow VitePress -> SDK as the default logged-out behavior
          if (vpMode !== theme) setTheme(vpMode)
        }
      } else {
        // Transitioned to logged-in: ONE-TIME sync SDK to current VitePress (persist to user prefs)
        if (prevLoggedIn === false || prevLoggedIn === null) {
          if (vpMode !== theme) {
            try { passkeyManager?.setUserTheme?.(vpMode) } catch { try { setTheme(vpMode) } catch {} }
          }
        } else {
          // Already logged in: keep VitePress aligned with SDK
          if (vpMode !== theme) setVpMode(theme)
        }
      }
    } catch {}

    // React to html class changes (VitePress navbar toggle)
    const mo = new MutationObserver(() => {
      try {
        const vpMode = getVpMode()
        const isLoggedInNow = !!loginState?.isLoggedIn
        // Ignore mutations we just caused while syncing SDK → VitePress
        if (syncingVpFromSdkRef.current) return
        // Only propagate VitePress → SDK while logged OUT
        if (!isLoggedInNow && vpMode !== theme) setTheme(vpMode)
      } catch {}
    })

    try { mo.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] }) } catch {}

    // Cross-tab/localStorage changes
    const onStorage = (e: StorageEvent) => {
      if (e.key !== 'vitepress-theme-appearance') return
      const next = e.newValue === 'dark' ? 'dark' : 'light'
      // Only propagate VitePress → SDK while logged OUT
      const isLoggedInNow = !!loginState?.isLoggedIn
      if (!isLoggedInNow && next !== theme) setTheme(next)
    }
    try { window.addEventListener('storage', onStorage) } catch {}

    return () => {
      try { mo.disconnect() } catch {}
      try { window.removeEventListener('storage', onStorage) } catch {}
    }
  }, [theme, setTheme, loginState?.isLoggedIn])

  // Track logged-in state across runs for transition detection
  React.useEffect(() => {
    prevLoggedInRef.current = !!loginState?.isLoggedIn
  }, [loginState?.isLoggedIn])
}
