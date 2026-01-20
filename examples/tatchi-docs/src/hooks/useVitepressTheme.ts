import * as React from 'react'

export type VitepressTheme = 'light' | 'dark'

export function getVitepressTheme(): VitepressTheme {
  if (typeof window !== 'undefined') {
    const stored = window.localStorage?.getItem?.('vitepress-theme-appearance')
    if (stored === 'light' || stored === 'dark') return stored
  }

  if (typeof document !== 'undefined') {
    const isDark = document.documentElement.classList.contains('dark')
    return isDark ? 'dark' : 'light'
  }

  if (typeof document !== 'undefined') {
    const attr = document.documentElement.getAttribute('data-w3a-theme')
    if (attr === 'light' || attr === 'dark') return attr
  }

  return 'dark'
}

function applyVitepressTheme(next: VitepressTheme): void {
  if (typeof window !== 'undefined') {
    window.localStorage?.setItem?.('vitepress-theme-appearance', next)
  }

  if (typeof document !== 'undefined') {
    document.documentElement.classList.toggle('dark', next === 'dark')
    document.documentElement.setAttribute('data-w3a-theme', next)
  }

  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('w3a:appearance', { detail: next }))
  }
}

/**
 * VitePress theme bridge for controlled SDK theming.
 * Returns a controlled theme + setter for TatchiPasskeyProvider.
 */
export function useVitepressTheme() {
  const [theme, setThemeState] = React.useState<VitepressTheme>(() => getVitepressTheme())

  const setTheme = React.useCallback((next: VitepressTheme) => {
    if (next !== 'light' && next !== 'dark') return
    setThemeState(next)
  }, [])

  React.useEffect(() => {
    applyVitepressTheme(theme)
  }, [theme])

  React.useEffect(() => {
    if (typeof document === 'undefined') return

    const read = () => setThemeState(getVitepressTheme())
    read()

    const mo = new MutationObserver(() => read())
    mo.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] })

    const onStorage = (e: StorageEvent) => {
      if (e.key !== 'vitepress-theme-appearance') return
      const next = e.newValue === 'dark' ? 'dark' : 'light'
      setThemeState(next)
    }
    window.addEventListener('storage', onStorage)

    const onAppearance = (e: Event) => {
      const next = (e as CustomEvent<'light' | 'dark'>)?.detail
      if (next === 'light' || next === 'dark') setThemeState(next)
    }
    window.addEventListener('w3a:appearance', onAppearance as any)

    const onSetTheme = (e: Event) => {
      const next = (e as CustomEvent<'light' | 'dark'>)?.detail
      if (next === 'light' || next === 'dark') setThemeState(next)
    }
    window.addEventListener('w3a:set-theme', onSetTheme as any)

    return () => {
      mo.disconnect()
      window.removeEventListener('storage', onStorage)
      window.removeEventListener('w3a:appearance', onAppearance as any)
      window.removeEventListener('w3a:set-theme', onSetTheme as any)
    }
  }, [])

  return { theme, setTheme }
}
