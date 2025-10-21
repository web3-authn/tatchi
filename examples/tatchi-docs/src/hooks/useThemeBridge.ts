import React from 'react'
import { useTheme, usePasskeyContext } from '@tatchi/sdk/react'

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
  const { loginState, passkeyManager } = usePasskeyContext()

  // Reflect current theme on <body> for global CSS and docs navbar
  React.useEffect(() => {
    try {
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
          if (loginState?.isLoggedIn && passkeyManager?.setUserTheme) {
            passkeyManager.setUserTheme(next)
          } else {
            setTheme(next)
          }
        }
      } catch {}
    }
    try { window.addEventListener('w3a:set-theme', onSetTheme as any) } catch {}
    return () => { try { window.removeEventListener('w3a:set-theme', onSetTheme as any) } catch {} }
  }, [setTheme, loginState?.isLoggedIn, passkeyManager])
}
