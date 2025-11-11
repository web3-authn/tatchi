import React from 'react'
import { useTheme, useTatchi } from '@tatchi-xyz/sdk/react'

/**
 * useThemeBridge
 *
 * Purpose
 * - Surface the current SDK theme to the document body for global CSS via
 *   `data-w3a-theme` and remove inline color overrides so site CSS controls paint.
 * - Listen for an app‑level `w3a:set-theme` CustomEvent and route the change to
 *   SDK (and wallet host if logged in) or local theme state when logged out.
 *
 * Why separate from useSyncVitepressTheme?
 * - This hook is framework‑agnostic and safe to use in any React app. It
 *   doesn’t touch VitePress‑specific mechanisms (html.dark or VP storage).
 * - `useSyncVitepressTheme` manages VitePress root class + storage syncing and
 *   login‑state precedence. Keeping those in a distinct hook avoids coupling and
 *   makes it easier to reuse this bridge outside VitePress.
 */
export function useThemeBridge() {
  const { theme, tokens, setTheme } = useTheme()
  const { loginState, tatchi } = useTatchi()

  // Reflect current theme on <html> (and <body> for backward-compat) for global CSS
  React.useEffect(() => {
    try {
      const root = document.documentElement
      root.setAttribute('data-w3a-theme', theme)
      // Backward-compat: keep body in sync for existing selectors
      document.body.setAttribute('data-w3a-theme', theme)
      // Let document-level CSS control colors; avoid double-paint
      document.body.style.removeProperty('background')
      document.body.style.removeProperty('color')
    } catch {}
    // tokens is included to re-run when token palette changes
  }, [theme, tokens])

  // Listen for external theme requests and route through SDK if logged in
  React.useEffect(() => {
    const onSetTheme = (e: Event) => {
      try {
        const ce = e as CustomEvent<'light' | 'dark'>
        const next = ce?.detail
        if (next === 'light' || next === 'dark') {
          if (loginState?.isLoggedIn && tatchi?.setUserTheme) {
            tatchi.setUserTheme(next)
          } else {
            setTheme(next)
          }
        }
      } catch {}
    }
    try { window.addEventListener('w3a:set-theme', onSetTheme as any) } catch {}
    return () => { try { window.removeEventListener('w3a:set-theme', onSetTheme as any) } catch {} }
  }, [setTheme, loginState?.isLoggedIn, tatchi])
}
