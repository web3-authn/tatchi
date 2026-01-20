import React from 'react'
import { useTatchi, useTheme, SunIcon, MoonIcon } from '@tatchi-xyz/sdk/react'
import NavbarProfilePlaceholder from './NavbarProfilePlaceholder'
import { useVitepressRouter } from '../../hooks/useVitepressRouter'
import NearLogo from '../icons/NearLogoWithText'
import './Navbar.css'

export const NavbarStatic: React.FC = () => {
  const { tatchi } = useTatchi()
  const { theme } = useTheme()
  const { linkProps } = useVitepressRouter()

  const onToggleTheme = React.useCallback(() => {
    const next = theme === 'dark' ? 'light' : 'dark'
    tatchi.setTheme(next)
  }, [tatchi, theme])

  // Simple top-right navbar with links + dark mode toggle + profile button
  return (
    <nav
      className="navbar-static"
      style={{
        position: 'fixed',
        top: '0rem',
        right: '0rem',
        // Keep above VitePress navbar and typical content, but far below wallet/SDK overlays
        // which live near 2^31 in z-index space.
        zIndex: 1000,
        pointerEvents: 'auto',
        display: 'flex',
        gap: '0.5rem',
        alignItems: 'center',
        padding: '0.75rem',
        borderRadius: '0.5rem',
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
        {...linkProps('/docs/getting-started/installation')}
        style={{
          textDecoration: 'none',
          padding: '0.5rem 0.75rem',
          borderRadius: '0.5rem'
        }}
      >Docs</a>
      <button
        type="button"
        onClick={onToggleTheme}
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
        Built on <NearLogo size={64} />
      </a>
      <NavbarProfilePlaceholder />
    </nav>
  )
}

export default NavbarStatic
