import { unified, type Processor, type Plugin } from 'unified'
import remarkParse from 'remark-parse'
import remarkGfm from 'remark-gfm'
import remarkDirective from 'remark-directive'
import remarkRehype from 'remark-rehype'
import rehypeStringify from 'rehype-stringify'
import rehypeSanitize, { defaultSchema } from 'rehype-sanitize'
import rehypePrettyCode from 'rehype-pretty-code'
import rehypeSlug from 'rehype-slug'
import rehypeAutolinkHeadings from 'rehype-autolink-headings'
import { createHighlighter } from 'shiki'
import { visit } from 'unist-util-visit'
import type { ContainerDirective } from 'remark-directive'
import type { Code } from 'mdast'
import type { Root, Element } from 'hast'

const THEMES = {
  dark: 'github-dark',
  light: 'github-light',
}

let processorPromise: Promise<Processor | null> | undefined

export async function renderMarkdown(source: string): Promise<string> {
  const normalized = normalizeDirectives(source)
  const processor = await getProcessor()
  if (!processor) return source
  const result = await processor.process(normalized)
  return String(result)
}

async function getProcessor(): Promise<Processor | null> {
  if (!processorPromise) {
    processorPromise = (async () => {
      try {
        const highlighter = await createHighlighter({
          themes: Object.values(THEMES),
          langs: ['ts', 'tsx', 'js', 'jsx', 'bash', 'sh', 'shell', 'json', 'yaml', 'yml', 'rust', 'toml', 'html', 'css'],
        })

        const schema = createSanitizeSchema()

        return unified()
          .use(remarkParse)
          .use(remarkGfm)
          .use(remarkDirective)
          .use(codeGroupDirective)
          .use(remarkRehype, { allowDangerousHtml: true })
          .use(rehypeSlug)
          .use(rehypeAutolinkHeadings, { behavior: 'wrap' })
          .use(rehypeSanitize, schema)
          .use(rehypePrettyCode, {
            keepBackground: false,
            theme: THEMES,
            getHighlighter: () => highlighter,
          })
          .use(rehypeCodeGroups)
          .use(rehypeStringify, { allowDangerousHtml: true })
      } catch (error) {
        console.error('[docs] failed to initialise markdown pipeline:', error)
        return null
      }
    })()
  }

  return processorPromise
}

const codeGroupDirective: Plugin = () => (tree) => {
  visit(tree, (node) => {
    if (node.type !== 'containerDirective') return

    const directive = node as ContainerDirective

    if (directive.name === 'code-group') {
      directive.data = directive.data || {}
      directive.data.hName = 'div'
      directive.data.hProperties = {
        ...(directive.data.hProperties || {}),
        'data-code-group': 'true',
      }

      directive.children.forEach((child) => {
        if (child.type === 'code') {
          annotateCode(child as Code)
        }
      })
      return
    }

    const classes = CALLOUT_CLASSES[directive.name]
    if (classes) {
      directive.data = directive.data || {}
      directive.data.hName = 'div'
      directive.data.hProperties = {
        ...(directive.data.hProperties || {}),
        className: classes,
      }
    }
  })
}

function annotateCode(code: Code) {
  let { lang = '' } = code
  let meta = code.meta ?? ''
  let label = ''

  const langMatch = lang.match(/^([^\[]+?)\s*\[(.+)]$/)
  if (langMatch) {
    lang = langMatch[1].trim()
    label = langMatch[2].trim()
  }

  const metaMatch = meta.match(/\[(.+)]/)
  if (metaMatch) {
    label = metaMatch[1].trim()
    meta = meta.replace(metaMatch[0], '').trim()
  }

  code.lang = lang

  if (label) {
    code.data = { ...(code.data || {}), codeGroupLabel: label }
    const metaParts: string[] = []
    if (meta) metaParts.push(meta)
    metaParts.push(`title="${label.replace(/"/g, '&quot;')}"`)
    code.meta = metaParts.join(' ')
  } else if (meta) {
    code.meta = meta
  }
}

const rehypeCodeGroups: Plugin = () => (tree: Root) => {
  visit(tree, 'element', (node) => {
    if (!isElement(node) || node.properties?.['data-code-group'] !== 'true') return

    const wrappers = node.children.filter(
      (child): child is Element => isElement(child) && isCodeWrapper(child)
    )

    if (!wrappers.length) return

    const tabNodes: Element[] = []
    const panelNodes: Element[] = []

    wrappers.forEach((wrapper, idx) => {
      const title = getCodeBlockTitle(wrapper, idx)
      const isActive = idx === 0

      tabNodes.push({
        type: 'element',
        tagName: 'button',
        properties: {
          type: 'button',
          role: 'tab',
          'aria-selected': String(isActive),
          tabIndex: isActive ? 0 : -1,
          className: ['doc-code-group__tab', isActive ? 'is-active' : undefined].filter(Boolean),
          'data-doc-tab': String(idx),
        },
        children: [{ type: 'text', value: title }],
      })

      panelNodes.push({
        type: 'element',
        tagName: 'div',
        properties: {
          role: 'tabpanel',
          className: ['doc-code-group__panel', isActive ? 'is-active' : undefined].filter(Boolean),
          'data-doc-panel': String(idx),
        },
        children: [wrapper],
      })
    })

    node.tagName = 'div'
    node.properties = {
      className: ['doc-code-group'],
      role: 'group',
    }
    delete node.properties['data-code-group']

    node.children = [
      {
        type: 'element',
        tagName: 'div',
        properties: {
          role: 'tablist',
          className: ['doc-code-group__tabs'],
        },
        children: tabNodes,
      },
      {
        type: 'element',
        tagName: 'div',
        properties: {
          className: ['doc-code-group__panels'],
        },
        children: panelNodes,
      },
    ]
  })
}

function createSanitizeSchema() {
  const schema: any = JSON.parse(JSON.stringify(defaultSchema))
  schema.tagNames = Array.from(new Set([...(schema.tagNames || []), 'mark', 'button', 'div']))

  schema.attributes = schema.attributes || {}

  const globalAttrs = new Set([
    ...((schema.attributes['*'] as string[] | undefined) || []),
    'className',
    'style',
    ['data-*'] as any,
  ])
  schema.attributes['*'] = Array.from(globalAttrs)

  schema.attributes.button = Array.from(new Set([
    ...((schema.attributes.button as string[] | undefined) || ['type']),
    'className',
    'aria-selected',
    'aria-expanded',
    'aria-controls',
    'role',
    'tabIndex',
    ['data-*'] as any,
  ]))

  schema.attributes.div = Array.from(new Set([
    ...((schema.attributes.div as string[] | undefined) || []),
    'className',
    'role',
    ['data-*'] as any,
  ]))

  schema.attributes.pre = Array.from(new Set([
    ...((schema.attributes.pre as string[] | undefined) || []),
    'className',
    'tabIndex',
    'data-lang',
    'data-language',
    ['data-*'] as any,
  ]))

  schema.attributes.code = Array.from(new Set([
    ...((schema.attributes.code as string[] | undefined) || []),
    'className',
    ['data-*'] as any,
  ]))

  schema.attributes.mark = Array.from(new Set([
    ...((schema.attributes.mark as string[] | undefined) || []),
    'className',
  ]))

  return schema
}

function getCodeBlockTitle(element: Element, index: number): string {
  const target = element.tagName === 'pre' ? element : findChildPre(element)
  const title = target?.properties?.['data-rehype-pretty-code-title']
  const lang = target?.properties?.['data-language'] || target?.properties?.['data-lang']
  if (typeof title === 'string' && title.trim()) return title.trim()
  if (typeof lang === 'string' && lang.trim()) return lang.trim()
  return `Tab ${index + 1}`
}

function isElement(node: any): node is Element {
  return node && typeof node === 'object' && node.type === 'element'
}

function isCodeWrapper(node: Element): boolean {
  if (node.tagName === 'pre') return true
  return Boolean(findChildPre(node))
}

function findChildPre(element: Element): Element | null {
  for (const child of element.children || []) {
    if (!isElement(child)) continue
    if (child.tagName === 'pre') return child
    const nested = findChildPre(child)
    if (nested) return nested
  }
  return null
}

function normalizeDirectives(source: string): string {
  return source.replace(/^::::/gm, ':::')
}
const CALLOUT_CLASSES: Record<string, string[]> = {
  steps: ['doc-block', 'doc-steps'],
  info: ['doc-block', 'doc-callout', 'doc-callout--info'],
}
