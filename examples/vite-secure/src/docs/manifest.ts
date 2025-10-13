export type DocRoute = {
  route: string
  sidebarLabel: string
  section: string
  load: () => Promise<string>
}

export type SidebarSection = {
  text: string
  items: Array<{ text: string; link: string }>
}

const SECTION_TITLES: Record<string, string> = {
  guides: 'Guides',
  concepts: 'Concepts',
  'getting-started': 'Getting Started',
  api: 'API Reference',
  '': 'Overview',
}

const SECTION_ORDER: Record<string, number> = {
  'Getting Started': 1,
  Guides: 2,
  Concepts: 3,
  'API Reference': 4,
  Overview: 0,
}

const docsModules = import.meta.glob<string>('../pages/docs/**/*.mdx', { as: 'raw' })

const docEntries: DocRoute[] = Object.entries(docsModules).map(([filePath, loader]) => {
  const relativePath = filePath
    .replace('../pages/docs/', '')
    .replace(/\.mdx$/, '')

  const segments = relativePath.split('/')
  const isIndexRoute = segments[segments.length - 1] === 'index'

  if (isIndexRoute) {
    segments.pop()
  }

  const sectionKey = segments[0] ?? (segments.length === 0 ? 'getting-started' : '')
  const section = SECTION_TITLES[sectionKey] ?? toTitleCase(sectionKey || 'Overview')

  const sidebarLabel = isIndexRoute
    ? 'Overview'
    : toTitleCase(segments[segments.length - 1] ?? 'Overview')

  const slug = segments.join('/')
  const route = `/docs${slug ? `/${slug}` : ''}`

  return {
    route,
    sidebarLabel,
    section,
    load: loader,
  }
})

docEntries.sort((a, b) => a.route.localeCompare(b.route))

const sidebarSectionsMap = new Map<string, SidebarSection>()

for (const doc of docEntries) {
  const sectionKey = doc.section
  if (!sidebarSectionsMap.has(sectionKey)) {
    sidebarSectionsMap.set(sectionKey, { text: doc.section, items: [] })
  }

  const section = sidebarSectionsMap.get(sectionKey)!
  section.items.push({ text: doc.sidebarLabel, link: doc.route })
}

export const sidebarSections: SidebarSection[] = Array.from(sidebarSectionsMap.values()).map(
  (section) => ({
    text: section.text,
    items: section.items.sort((a, b) => a.link.localeCompare(b.link)),
  })
)

sidebarSections.sort((a, b) => {
  const orderA = SECTION_ORDER[a.text] ?? Number.MAX_SAFE_INTEGER
  const orderB = SECTION_ORDER[b.text] ?? Number.MAX_SAFE_INTEGER
  if (orderA !== orderB) return orderA - orderB
  return a.text.localeCompare(b.text)
})

export const docsRouteMap = new Map<string, DocRoute>()
for (const doc of docEntries) {
  docsRouteMap.set(normalizeRoute(doc.route), doc)
}

export function resolveDoc(pathname: string): DocRoute | undefined {
  return docsRouteMap.get(normalizeRoute(pathname))
}


function normalizeRoute(route: string): string {
  if (!route.startsWith('/')) {
    route = `/${route}`
  }
  return route.replace(/\/+/g, '/').replace(/\/$/, '') || '/docs'
}

function toTitleCase(slug: string): string {
  return slug
    .split(/[\s\-_/]+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase())
    .join(' ')
}
