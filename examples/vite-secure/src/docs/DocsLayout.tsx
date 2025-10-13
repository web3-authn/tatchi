import React from 'react'
import { Link, useLocation, Navigate } from 'react-router-dom'
import { useTheme } from '@tatchi/sdk/react'

import { resolveDoc, sidebarSections } from './manifest'
import { renderMarkdown } from './markdown'
import { useIsMobile } from '../hooks/useIsMobile'

import './docs-layout.css'

const SIDEBAR_FOOTER_LINKS = [
  { label: 'GitHub', href: 'https://github.com/web3-authn/sdk' },
  { label: 'Relay Server', href: 'https://github.com/web3-authn/sdk/tree/main/examples/relay-server' },
  { label: 'Support', href: 'mailto:support@tatchi.xyz' },
]

export const DocsLayout: React.FC = () => {
  const location = useLocation()
  const doc = resolveDoc(location.pathname)
  const { theme } = useTheme()
  const isMobile = useIsMobile()
  const [isMobileNavOpen, setMobileNavOpen] = React.useState(false)
  const [searchTerm, setSearchTerm] = React.useState('')
  const [collapsedSections, setCollapsedSections] = React.useState<Record<string, boolean>>({})

  const [html, setHtml] = React.useState<string>('')
  const [loading, setLoading] = React.useState<boolean>(true)
  const [error, setError] = React.useState<string | null>(null)

  React.useEffect(() => {
    if (!doc) return

    let cancelled = false
    setLoading(true)
    setError(null)

    setHtml('')

    doc
      .load()
      .then(async (raw) => {
        if (cancelled) return
        const rendered = await renderMarkdown(raw)
        if (cancelled) return
        setHtml(rendered)
        setLoading(false)
        window.scrollTo({ top: 0, behavior: 'auto' })
      })
      .catch((err) => {
        if (cancelled) return
        setError(err instanceof Error ? err.message : 'Failed to load documentation.')
        setLoading(false)
      })

    return () => {
      cancelled = true
    }
  }, [doc])

  if (!doc) {
    return <Navigate to="/docs" replace />
  }

  React.useEffect(() => {
    setMobileNavOpen(false)
  }, [doc.route])

  React.useEffect(() => {
    const groups = Array.from(
      document.querySelectorAll<HTMLElement>('.doc-code-group')
    )

    const disposers: Array<() => void> = []

    groups.forEach((group) => {
      const tabs = Array.from(
        group.querySelectorAll<HTMLButtonElement>('.doc-code-group__tab')
      )
      const panels = Array.from(
        group.querySelectorAll<HTMLElement>('.doc-code-group__panel')
      )

      const activate = (index: number) => {
        tabs.forEach((tab, tabIndex) => {
          const isActive = tabIndex === index
          tab.classList.toggle('is-active', isActive)
          tab.setAttribute('aria-selected', String(isActive))
          tab.setAttribute('tabindex', isActive ? '0' : '-1')
        })
        panels.forEach((panel, panelIndex) => {
          panel.classList.toggle('is-active', panelIndex === index)
        })
      }

      tabs.forEach((tab, index) => {
        const handleClick = () => activate(index)
        const handleKeydown = (event: KeyboardEvent) => {
          if (event.key === 'ArrowRight') {
            event.preventDefault()
            const next = (index + 1) % tabs.length
            tabs[next].focus()
            activate(next)
          } else if (event.key === 'ArrowLeft') {
            event.preventDefault()
            const prev = (index - 1 + tabs.length) % tabs.length
            tabs[prev].focus()
            activate(prev)
          }
        }

        tab.addEventListener('click', handleClick)
        tab.addEventListener('keydown', handleKeydown)

        disposers.push(() => {
          tab.removeEventListener('click', handleClick)
          tab.removeEventListener('keydown', handleKeydown)
        })
      })

      activate(0)
    })

    return () => {
      disposers.forEach((dispose) => dispose())
    }
  }, [html, loading, error, doc.route])

  const normalizedSearch = searchTerm.trim().toLowerCase()

  const filteredSections = React.useMemo(() => {
    if (!normalizedSearch) return sidebarSections

    return sidebarSections
      .map((section) => {
        const items = section.items.filter((item) =>
          item.text.toLowerCase().includes(normalizedSearch) ||
          item.link.toLowerCase().includes(normalizedSearch)
        )
        return { ...section, items }
      })
      .filter((section) => section.items.length > 0)
  }, [normalizedSearch])

  const renderNav = (sections: typeof sidebarSections, onNavigate?: () => void) => (
    <>
      {sections.map((section) => {
        const collapsed = normalizedSearch
          ? false
          : collapsedSections[section.text] ?? false

        return (
          <section key={section.text} className="docs-sidebar-section">
            <button
              type="button"
              className={`docs-sidebar-section__toggle${collapsed ? ' is-collapsed' : ''}`}
              onClick={() =>
                setCollapsedSections((prev) => ({
                  ...prev,
                  [section.text]: !collapsed,
                }))
              }
              aria-expanded={!collapsed}
            >
              <span>{section.text}</span>
              <span className="docs-sidebar-section__chevron" aria-hidden="true">
                {collapsed ? '▾' : '▴'}
              </span>
            </button>
            <ul className={collapsed ? 'is-hidden' : undefined}>
              {section.items.map((item) => {
                const isActive = item.link === doc.route
                return (
                  <li key={item.link} className={isActive ? 'active' : undefined}>
                    <Link
                      to={item.link}
                      onClick={onNavigate}
                      aria-current={isActive ? 'page' : undefined}
                    >
                      {highlightMatch(item.text, normalizedSearch)}
                    </Link>
                  </li>
                )
              })}
            </ul>
          </section>
        )
      })}
    </>
  )

  const currentTitle = sidebarSections
    .flatMap((section) => section.items)
    .find((item) => item.link === doc.route)?.text

  return (
    <div className="docs-shell" data-docs-theme={theme}>
      {isMobile ? (
        <header className="docs-topbar">
          <Link to="/" className="docs-brand">
            Tatchi.xyz
          </Link>
          <div className="docs-topbar__current" title={currentTitle || 'Docs'}>
            {currentTitle || 'Docs'}
          </div>
          <button
            type="button"
            className="docs-topbar__toggle"
            onClick={() => setMobileNavOpen((open) => !open)}
            aria-expanded={isMobileNavOpen}
            aria-controls="docs-mobile-nav"
          >
            <span className="docs-topbar__label">Docs</span>
            <span className="docs-topbar__chevron" aria-hidden="true">
              {isMobileNavOpen ? '▴' : '▾'}
            </span>
          </button>
        </header>
      ) : (
        <aside className="docs-sidebar" aria-label="Documentation navigation">
          <div className="docs-sidebar__inner">
            <div className="docs-sidebar__header">
              <Link to="/" className="docs-brand">
                Tatchi.xyz
              </Link>
            </div>
            <div className="docs-sidebar__nav">
              {renderNav(filteredSections, undefined)}
              {filteredSections.length === 0 && (
                <p className="docs-sidebar__empty">No matches found.</p>
              )}
            </div>
            <footer className="docs-sidebar__footer">
              {SIDEBAR_FOOTER_LINKS.map((link) => (
                <a key={link.href} href={link.href} target="_blank" rel="noreferrer">
                  {link.label}
                </a>
              ))}
            </footer>
          </div>
        </aside>
      )}

      {isMobile && (
        <div
          id="docs-mobile-nav"
          className={`docs-mobile-nav${isMobileNavOpen ? ' docs-mobile-nav--open' : ''}`}
        >
          <div className="docs-mobile-nav__scroll">
            {renderNav(filteredSections, () => setMobileNavOpen(false))}
            {filteredSections.length === 0 && (
              <p className="docs-sidebar__empty">No matches found.</p>
            )}
          </div>
          <footer className="docs-sidebar__footer docs-sidebar__footer--mobile">
            {SIDEBAR_FOOTER_LINKS.map((link) => (
              <a key={link.href} href={link.href} target="_blank" rel="noreferrer">
                {link.label}
              </a>
            ))}
          </footer>
        </div>
      )}

      <main className="docs-content">
        <div className="docs-searchbar">
          <div className="docs-searchbar__wrapper">
            <span className="docs-searchbar__icon" aria-hidden="true">
              🔍
            </span>
            <input
              type="search"
              value={searchTerm}
              onChange={(event) => setSearchTerm(event.target.value)}
              placeholder="Search documentation…"
              aria-label="Search documentation"
            />
          </div>
        </div>

        {loading && <div className="docs-loading">Loading documentation…</div>}
        {error && <div className="docs-error">{error}</div>}
        {!loading && !error && (
          <article className="docs-article" dangerouslySetInnerHTML={{ __html: html }} />
        )}
      </main>
    </div>
  )
}

function highlightMatch(text: string, query: string): React.ReactNode {
  if (!query) return text
  const lower = text.toLowerCase()
  const index = lower.indexOf(query)
  if (index === -1) return text
  const before = text.slice(0, index)
  const match = text.slice(index, index + query.length)
  const after = text.slice(index + query.length)
  return (
    <>
      {before}
      <mark>{match}</mark>
      {after}
    </>
  )
}
