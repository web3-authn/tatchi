import * as React from 'react'

export type DocumentTheme = 'light' | 'dark'

function getDocumentTheme(): DocumentTheme {
  try {
    if (typeof document !== 'undefined') {
      const attr = document.documentElement.getAttribute('data-w3a-theme')
      if (attr === 'light' || attr === 'dark') return attr
    }
  } catch {}

  try {
    if (typeof document !== 'undefined') {
      const isDark = document.documentElement.classList.contains('dark')
      return isDark ? 'dark' : 'light'
    }
  } catch {}

  return 'dark'
}

export function useDocumentTheme() {
  const [theme, setTheme] = React.useState<DocumentTheme>(() => getDocumentTheme())

  React.useEffect(() => {
    try {
      document.documentElement.setAttribute('data-w3a-theme', theme)
    } catch {}
  }, [theme])

  return { theme, setTheme }
}
