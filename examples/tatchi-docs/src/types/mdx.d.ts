declare module '*.mdx' {
  import type { ComponentType } from 'react'
  const MDXComponent: ComponentType<any>
  export default MDXComponent
}

