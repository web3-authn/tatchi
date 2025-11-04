import React from 'react'
import { useCarousel } from './CarouselProvider'

export function PaginationDots(props: { ariaLabel?: string }) {
  const { pages, index, goTo } = useCarousel()

  const onKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (e.key === 'ArrowLeft') { e.preventDefault(); goTo(Math.max(0, index - 1)); }
    if (e.key === 'ArrowRight') { e.preventDefault(); goTo(Math.min(pages.length - 1, index + 1)); }
    if (e.key === 'Home') { e.preventDefault(); goTo(0) }
    if (e.key === 'End') { e.preventDefault(); goTo(pages.length - 1) }
  }

  return (
    <nav className="carousel-dots" aria-label={props.ariaLabel || 'Onboarding pagination'}>
      <div className="dots" role="tablist" aria-orientation="horizontal" onKeyDown={onKeyDown}>
        {pages.map((p, i) => {
          const isDisabled = !!p.disabled && i !== index
          const isActive = i === index
          return (
            <button
              key={i}
              type="button"
              role="tab"
              aria-selected={isActive}
              aria-current={isActive ? 'step' : undefined}
              aria-disabled={isDisabled || undefined}
              disabled={isDisabled}
              className={`dot${isActive ? ' is-active' : ''}${isDisabled ? ' is-disabled' : ''}`}
              onClick={() => { if (!isDisabled) goTo(i) }}
            >
              <span className="sr-only">Go to slide {i + 1}</span>
            </button>
          )
        })}
      </div>
    </nav>
  )
}

export default PaginationDots
