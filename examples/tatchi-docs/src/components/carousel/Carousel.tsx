import React from 'react'
import { useCarousel } from './CarouselProvider'

/**
 * Renders the active page and (when animating) the outgoing page layered.
 * Uses CSS classes and data-attributes to drive slide/fade animations.
 */
export function Carousel({ style }: { style?: React.CSSProperties }) {
  const { pages, index, transition, direction, rootStyle, nextSlide, prevSlide, isFirst, isLast } = useCarousel()
  const [leavingIndex, setLeavingIndex] = React.useState<number | null>(null)
  const [stageKey, setStageKey] = React.useState(0)
  const [activate, setActivate] = React.useState(false)
  const stageRef = React.useRef<HTMLDivElement | null>(null)
  const enterRef = React.useRef<HTMLDivElement | null>(null)
  const exitRef = React.useRef<HTMLDivElement | null>(null)

  const prevIndexRef = React.useRef(index)
  const initialRef = React.useRef(true)

  React.useEffect(() => {
    if (index !== prevIndexRef.current) {
      setLeavingIndex(prevIndexRef.current)
      prevIndexRef.current = index
      // bump stage key to retrigger enter state
      setActivate(false)
      setStageKey(k => k + 1)
      const timeout = setTimeout(() => setLeavingIndex(null), 300) // match CSS slide duration
      return () => clearTimeout(timeout)
    }
  }, [index])

  // Toggle active/leaving classes in the next frame so transitions fire
  React.useEffect(() => {
    // First render: show content without animating in
    if (initialRef.current && stageKey === 0) {
      setActivate(true)
      initialRef.current = false
      return
    }
    setActivate(false)
    const raf = requestAnimationFrame(() => setActivate(true))
    return () => cancelAnimationFrame(raf)
  }, [stageKey])

  // Removed height animation: let the stage size naturally to content changes

  const activePage = pages[index]
  const leavingPage = leavingIndex != null ? pages[leavingIndex] : null

  const mergedStyle = React.useMemo(() => ({ ...(rootStyle || {}), ...(style || {}) }), [rootStyle, style])

  const renderPage = React.useCallback(
    (page: (typeof pages)[number] | null) => {
      if (!page) return null
      const el = page.element as any
      if (typeof el === 'function') {
        // compute whether there is an enabled prev/next
        let canPrev = false
        for (let i = index - 1; i >= 0; i--) { if (!pages[i]?.disabled) { canPrev = true; break } }
        let canNext = false
        for (let i = index + 1; i < pages.length; i++) { if (!pages[i]?.disabled) { canNext = true; break } }
        return el({ index, isFirst, isLast, canPrev, canNext, nextSlide, prevSlide })
      }
      return el
    },
    [index, isFirst, isLast, nextSlide, prevSlide, pages]
  )

  return (
    <div className="carousel-root"
      data-transition={transition}
      data-dir={direction}
      aria-live="polite"
      style={mergedStyle}
    >
      <div className="carousel-stage" key={stageKey} ref={stageRef}>
        {leavingPage && (
          <div ref={exitRef} className={`carousel-page page--exit${activate ? ' page--leaving' : ''}`} aria-hidden>
            {renderPage(leavingPage)}
          </div>
        )}
        {activePage && (
          <div ref={enterRef} className={`carousel-page page--enter${activate ? ' page--active' : ''}`}>
            {renderPage(activePage)}
          </div>
        )}
      </div>
    </div>
  )
}

export default Carousel
