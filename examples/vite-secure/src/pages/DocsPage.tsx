import React from 'react'
import { MDXProvider } from '@mdx-js/react'
import { useLocation, useNavigate } from 'react-router-dom'
import { DocsLayout } from './docs/DocsLayout'

const modules = import.meta.glob('./docs/**/*.mdx', { eager: true }) as Record<string, any>

// Build a path map: '/docs' -> MDX component
const routeMap = Object.fromEntries(
  Object.entries(modules).map(([k, mod]) => {
    // k example: './docs/index.mdx' or './docs/guides/passkeys.mdx'
    const rel = k.replace(/^\.\/docs\//, '')
    const withoutExt = rel.replace(/\.mdx$/, '')
    // Map 'foo/index' -> 'foo'
    const normalized = withoutExt.endsWith('/index')
      ? withoutExt.slice(0, -('/index'.length))
      : withoutExt
    const path = normalized === 'index' ? '/docs' : `/docs/${normalized}`
    return [path, mod?.default]
  })
)

const components = {}

export const DocsPage: React.FC = () => {
  const { pathname } = useLocation()
  const navigate = useNavigate()
  const Comp = routeMap[pathname] ?? routeMap['/docs']

  React.useEffect(() => {
    if (!routeMap[pathname]) {
      // Redirect unknown subpaths to /docs
      navigate('/docs', { replace: true })
    }
  }, [pathname, navigate])

  return (
    <DocsLayout>
      <MDXProvider components={components}>{Comp ? <Comp /> : null}</MDXProvider>
    </DocsLayout>
  )
}
