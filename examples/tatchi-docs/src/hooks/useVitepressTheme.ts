import * as React from 'react'

export type VitepressTheme = 'light' | 'dark'

type VitepressAppearance = VitepressTheme | 'auto'

const VITEPRESS_APPEARANCE_KEY = 'vitepress-theme-appearance'

function parseVitepressAppearance(raw: string | null | undefined): VitepressAppearance | null {
  if (!raw) return null
  if (raw === 'light' || raw === 'dark' || raw === 'auto') return raw

  try {
    const parsed = JSON.parse(raw)
    if (parsed === 'light' || parsed === 'dark' || parsed === 'auto') return parsed
  } catch {}

  const normalized = raw.replace(/\"/g, '')
  if (normalized === 'light' || normalized === 'dark' || normalized === 'auto') return normalized

  return null
}

function getSystemTheme(): VitepressTheme {
  if (typeof document !== 'undefined') {
    try {
      const attr = document.documentElement.getAttribute('data-w3a-theme')
      if (attr === 'light' || attr === 'dark') return attr
    } catch {}

    const isDark = document.documentElement.classList.contains('dark')
    return isDark ? 'dark' : 'light'
  }

  if (typeof window !== 'undefined') {
    try {
      return window.matchMedia?.('(prefers-color-scheme: dark)')?.matches ? 'dark' : 'light'
    } catch {}
  }

  return 'dark'
}

export function getVitepressTheme(): VitepressTheme {
  if (typeof window !== 'undefined') {
    const stored = parseVitepressAppearance(window.localStorage?.getItem?.(VITEPRESS_APPEARANCE_KEY))
    if (stored === 'light' || stored === 'dark') return stored
    if (stored === 'auto') return getSystemTheme()
  }

  return getSystemTheme()
}

function applyVitepressTheme(next: VitepressTheme): void {
  if (typeof window !== 'undefined') {
    // VitePress uses @vueuse/core useStorage() under the hood, which JSON-serializes strings.
    // If we write raw values here, other tabs will attempt JSON.parse(...) and fall back,
    // causing the "flash then revert" behavior.
    window.localStorage?.setItem?.(VITEPRESS_APPEARANCE_KEY, JSON.stringify(next))
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
      if (e.key !== VITEPRESS_APPEARANCE_KEY) return
      const stored = parseVitepressAppearance(e.newValue)
      if (stored === 'light' || stored === 'dark') setThemeState(stored)
      else if (stored === 'auto' || stored === null) setThemeState(getSystemTheme())
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
