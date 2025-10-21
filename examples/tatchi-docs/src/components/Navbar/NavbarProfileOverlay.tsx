import React from 'react'
import TatchiProfileSettingsButton from '../TatchiProfileSettingsButton'

/**
 * Fixed overlay that renders the real ProfileSettingsButton at top-right
 * and broadcasts its width so the main Navbar can reserve space with a placeholder.
 */
export const NavbarProfileOverlay: React.FC = () => {
  const btnRef = React.useRef<HTMLDivElement | null>(null)

  React.useEffect(() => {
    if (typeof window === 'undefined') return
    let ro: ResizeObserver | null = null
    let mo: MutationObserver | null = null
    let lastClosedWidth = 0

    const el = btnRef.current?.querySelector('.navbar-profile-button') as HTMLElement | null
    const dispatch = (w: number) => {
      try { window.dispatchEvent(new CustomEvent<number>('w3a:profile-width', { detail: w })) } catch {}
    }
    const measureAndDispatch = () => {
      const target = (btnRef.current?.querySelector('.navbar-profile-button') as HTMLElement | null) || el
      if (!target) { dispatch(0); return }
      const rect = target.getBoundingClientRect()
      const width = Math.ceil(rect.width)
      const state = (target.getAttribute('data-state') || '').toLowerCase()
      if (state === 'open') {
        // While open, keep using the last known closed width to avoid shifting nav links
        dispatch(lastClosedWidth || width)
      } else {
        // Update baseline when closed
        lastClosedWidth = width
        dispatch(width)
      }
    }

    // Initial measure after mount and on next frame (to capture fonts)
    // Seed baseline closed width first to minimize layout shifts
    const seed = () => {
      const target = btnRef.current?.querySelector('.navbar-profile-button') as HTMLElement | null
      if (target) {
        const r = target.getBoundingClientRect()
        lastClosedWidth = Math.ceil(r.width)
      }
      measureAndDispatch()
    }
    seed()
    requestAnimationFrame(seed)

    try {
      const target = btnRef.current?.querySelector('.navbar-profile-button') as HTMLElement | null
      if (target && 'ResizeObserver' in window) {
        ro = new ResizeObserver(() => measureAndDispatch())
        ro.observe(target)
      }
      // Also observe subtree changes to catch mount/unmount
      mo = new MutationObserver(() => measureAndDispatch())
      if (btnRef.current) mo.observe(btnRef.current, { childList: true, subtree: true })
    } catch {}

    const onResize = () => measureAndDispatch()
    window.addEventListener('resize', onResize)
    return () => {
      try { ro?.disconnect() } catch {}
      try { mo?.disconnect() } catch {}
      window.removeEventListener('resize', onResize)
    }
  }, [])

  return (
    <div
      ref={btnRef}
      style={{ position: 'fixed', top: '0.5rem', right: '0.5rem', zIndex: 102 }}
      aria-hidden={false}
    >
      <TatchiProfileSettingsButton
        // Attach identifying class to the morphable wrapper via passthrough prop
        // so we can observe size.
        // TatchiProfileSettingsButton forwards `className` to ProfileSettingsButton wrapper.
        className="navbar-profile-button"
      />
    </div>
  )
}

export default NavbarProfileOverlay
