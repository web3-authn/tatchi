import React from 'react'
import { Breadcrumbs } from './Breadcrumbs'
import { PaginationDots } from './PaginationDots'

export type TransitionKind = 'slide' | 'fade'

export type CarouselPage = {
  key: string
  title: string
  /**
   * A page can be a plain ReactNode or a render function that receives
   * navigation helpers so slides can render their own controls.
   */
  element:
    | React.ReactNode
    | ((args: {
        index: number
        isFirst: boolean
        isLast: boolean
        /** Whether there is an enabled previous/next slide */
        canPrev: boolean
        canNext: boolean
        nextSlide: () => void
        prevSlide: () => void
      }) => React.ReactNode)
  disabled?: boolean
}

export type Direction = 'forward' | 'backward'

export type CarouselControls = {
  index: number
  key: string
  pages: CarouselPage[]
  isFirst: boolean
  isLast: boolean
  transition: TransitionKind
  direction: Direction
  setTransition: (t: TransitionKind) => void
  next: () => void
  prev: () => void
  /** Aliases provided for slide-local semantics */
  nextSlide: () => void
  prevSlide: () => void
  goTo: (index: number) => void
  goToByKey: (key: string) => void
  rootStyle?: React.CSSProperties
  breadcrumbsStyle?: React.CSSProperties
}

type Ctx = CarouselControls | null

const CarouselContext = React.createContext<Ctx>(null)

export function useCarousel(): CarouselControls {
  const ctx = React.useContext(CarouselContext)
  if (!ctx) throw new Error('useCarousel must be used within <CarouselProvider>')
  return ctx
}

export function CarouselProvider(props: {
  pages: CarouselPage[]
  initialKey?: string
  initialIndex?: number
  defaultTransition?: TransitionKind
  showBreadcrumbs?: boolean
  showPaginationDots?: boolean
  currentPage?: number
  onCurrentPageChange?: (index: number) => void
  breadcrumbsStyle?: React.CSSProperties
  rootStyle?: React.CSSProperties
  children: React.ReactNode
}) {
  const {
    pages,
    children,
    defaultTransition = 'slide',
    showBreadcrumbs = true,
    showPaginationDots = false
  } = props
  const isControlled = typeof props.currentPage === 'number'
  const initialIndex = React.useMemo(() => {
    if (isControlled) {
      const cp = Math.min(Math.max(props.currentPage!, 0), pages.length - 1)
      return cp
    }
    if (typeof props.initialIndex === 'number') return Math.min(Math.max(props.initialIndex, 0), pages.length - 1)
    if (props.initialKey) {
      const i = pages.findIndex(p => p.key === props.initialKey)
      return i >= 0 ? i : 0
    }
    return 0
  }, [pages, props.initialIndex, props.initialKey, props.currentPage, isControlled])

  const [index, setIndex] = React.useState(initialIndex)
  const [key, setKey] = React.useState(pages[initialIndex]?.key || '')
  const [transition, setTransition] = React.useState<TransitionKind>(defaultTransition)
  const [direction, setDirection] = React.useState<Direction>('forward')

  React.useEffect(() => {
    // keep key in sync with index updates
    const k = pages[index]?.key
    if (k && k !== key) setKey(k)
  }, [index, pages, key])

  const isFirst = index <= 0
  const isLast = index >= pages.length - 1

  const goTo = React.useCallback((i: number) => {
    const next = Math.min(Math.max(i, 0), pages.length - 1)
    setDirection(next > index ? 'forward' : 'backward')
    if (props.onCurrentPageChange) {
      props.onCurrentPageChange(next)
    } else {
      setIndex(next)
    }
  }, [pages.length, index, props])

  const goToByKey = React.useCallback((k: string) => {
    const i = pages.findIndex(p => p.key === k)
    if (i >= 0) goTo(i)
  }, [pages, goTo])

  const next = React.useCallback(() => {
    if (isLast) return
    // advance to next enabled page
    for (let i = index + 1; i < pages.length; i++) {
      if (!pages[i]?.disabled) { goTo(i); return }
    }
  }, [goTo, index, isLast, pages])

  const prev = React.useCallback(() => {
    if (isFirst) return
    // go back to previous enabled page
    for (let i = index - 1; i >= 0; i--) {
      if (!pages[i]?.disabled) { goTo(i); return }
    }
  }, [goTo, index, isFirst, pages])

  // Sync internal state when controlled currentPage changes
  React.useEffect(() => {
    if (isControlled) {
      const next = Math.min(Math.max(props.currentPage!, 0), pages.length - 1)
      setDirection(next > index ? 'forward' : 'backward')
      setIndex(next)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [props.currentPage, pages.length])

  const value: CarouselControls = {
    index,
    key,
    pages,
    isFirst,
    isLast,
    transition,
    direction,
    setTransition,
    next,
    prev,
    nextSlide: next,
    prevSlide: prev,
    goTo,
    goToByKey,
    rootStyle: props.rootStyle,
    breadcrumbsStyle: props.breadcrumbsStyle,
  }

  return (
    <CarouselContext.Provider value={value}>
      <div className="carousel-demo-root">
        {showBreadcrumbs && <Breadcrumbs style={props.breadcrumbsStyle} />}
        {children}
        {showPaginationDots && <PaginationDots />}
      </div>
    </CarouselContext.Provider>
  )
}
