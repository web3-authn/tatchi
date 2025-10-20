import * as React from 'react'

type GoFn = (to: string) => void

function joinWithBase(to: string): string {
  if (/^https?:\/\//.test(to)) return to
  const base = ((import.meta as any)?.env?.BASE_URL || '/') as string
  const normalizedBase = base.endsWith('/') ? base.slice(0, -1) : base
  const normalizedTarget = to.startsWith('/') ? to : `/${to}`
  return `${normalizedBase}${normalizedTarget}`
}

function isModifiedClick(e: React.MouseEvent<any>): boolean {
  return !!(e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button !== 0)
}

export function useVitepressRouter(): {
  go: GoFn
  linkProps: (to: string) => { href: string; onClick: (e: React.MouseEvent<HTMLAnchorElement>) => void }
} {
  const go = React.useCallback<GoFn>((to: string) => {
    const url = joinWithBase(to)
    const w = window as any
    const vpGo = w?.__vp_go
    if (typeof vpGo === 'function') vpGo(url)
    else window.location.href = url
  }, [])

  const linkProps = React.useCallback((to: string) => {
    const href = joinWithBase(to)
    return {
      href,
      onClick: (e: React.MouseEvent<HTMLAnchorElement>) => {
        // Respect default browser behaviors (new tab, middle click, etc.)
        if (isModifiedClick(e)) return
        // Respect anchors with explicit targets
        const target = (e.currentTarget.getAttribute('target') || '').toLowerCase()
        if (target && target !== '_self') return
        e.preventDefault()
        go(to)
      },
    }
  }, [go])

  return { go, linkProps }
}

export default useVitepressRouter

