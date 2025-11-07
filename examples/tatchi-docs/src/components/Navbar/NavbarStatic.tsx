import React from 'react'
import { useTheme, SunIcon, MoonIcon, usePasskeyContext } from '@tatchi-xyz/sdk/react'
import NavbarProfilePlaceholder from './NavbarProfilePlaceholder'
import { useVitepressRouter } from '../../hooks/useVitepressRouter'
import NearLogo from '../icons/NearLogo'
import './Navbar.css'

function applyVitepressAppearance(mode: 'light' | 'dark') {
  if (typeof document === 'undefined') return
  const html = document.documentElement
  html.classList.toggle('dark', mode === 'dark')
  try { localStorage.setItem('vitepress-theme-appearance', mode) } catch {}
  try { window.dispatchEvent(new CustomEvent<'light' | 'dark'>('w3a:appearance', { detail: mode })) } catch {}
}

export const NavbarStatic: React.FC = () => {
  const { isDark, toggleTheme, theme } = useTheme()
  const { passkeyManager } = usePasskeyContext();
  const { linkProps } = useVitepressRouter()

  const onToggle = React.useCallback(() => {
    const next = isDark ? 'light' : 'dark'
    // Toggle React SDK theme
    toggleTheme()
    // Toggle user preferences theme
    passkeyManager.setUserTheme(next);
    // Also sync VitePress <html> and storage so logged-out state updates correctly
    applyVitepressAppearance(next)
  }, [isDark, toggleTheme])

  // Simple top-right navbar with links + dark mode toggle + profile button
  return (
    <nav
      className="navbar-static"
      style={{
        position: 'fixed',
        top: '0rem',
        right: '0rem',
        zIndex: 100,
        display: 'flex',
        gap: '0.5rem',
        alignItems: 'center',
        padding: '0.75rem',
        borderRadius: '0.5rem',
        // background: 'color-mix(in oklab, var(--vp-c-bg, rgba(255,255,255,0.85)) 85%, transparent)',
        // backdropFilter: 'blur(6px)',
        fontSize: '0.875rem'
      }}
    >
      <a
        {...linkProps('/')}
        style={{
          textDecoration: 'none',
          padding: '0.25rem 0.5rem',
          borderRadius: '0.5rem'
        }}
      >Home</a>
      <a
        {...linkProps('/docs/getting-started/install-and-configure')}
        style={{
          textDecoration: 'none',
          padding: '0.5rem 0.75rem',
          borderRadius: '0.5rem'
        }}
      >Docs</a>
      <button
        type="button"
        onClick={onToggle}
        style={{
          display: 'grid',
          placeContent: 'center',
          border: 'none',
          borderRadius: '0.5rem',
          padding: '0.5rem 0.6rem',
          background: 'transparent',
          cursor: 'pointer',
          fontSize: '1rem'
        }}
        aria-label="Toggle dark mode"
        title="Toggle dark mode"
      >
        {theme === 'dark' ? (
          <SunIcon size={18} strokeWidth={2} aria-hidden />
        ) : (
          <MoonIcon size={18} strokeWidth={2} aria-hidden />
        )}
      </button>
      <a
        href="https://near.org"
        target="_blank"
        rel="noopener noreferrer"
        className="navbar-static__near"
        aria-label="Built on NEAR"
      >
        Built on <NearLogo size={60} />
      </a>
      <NavbarProfilePlaceholder />
    </nav>
  )
}

export default NavbarStatic
