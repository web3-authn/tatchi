import React from 'react'

/**
 * Invisible spacer that reserves width for the profile button overlay
 * so the Home/Docs links don't jump when the profile expands.
 */
export const NavbarProfilePlaceholder: React.FC = () => {
  const [width, setWidth] = React.useState<number>(0)
  const [loggedIn, setLoggedIn] = React.useState<boolean>(() => {
    if (typeof document === 'undefined') return false
    try { return document.body.getAttribute('data-w3a-logged-in') === 'true' } catch { return false }
  })

  React.useEffect(() => {
    const onWidth = (e: Event) => {
      const ce = e as CustomEvent<number>
      const w = typeof ce?.detail === 'number' ? ce.detail : 0
      // Add a small gap so links don't touch the button
      if (!loggedIn) return
      setWidth(Math.max(0, Math.ceil(w + 4)))
    }
    const onLoginState = (e: Event) => {
      const ce = e as CustomEvent<{ loggedIn?: boolean }>
      const next = !!ce?.detail?.loggedIn
      setLoggedIn(next)
      if (!next) setWidth(0)
    }
    window.addEventListener('w3a:profile-width', onWidth as any)
    window.addEventListener('w3a:login-state', onLoginState as any)

    return () => {
      window.removeEventListener('w3a:profile-width', onWidth as any)
      window.removeEventListener('w3a:login-state', onLoginState as any)
    }
  }, [loggedIn])

  // Reserve width but remain visually invisible and non-interactive
  return (
    <div
      aria-hidden
      style={{
        width: loggedIn && width ? `${width}px` : 0,
        height: '1px',
        pointerEvents: 'none',
        opacity: 0,
      }}
    />
  )
}

export default NavbarProfilePlaceholder
