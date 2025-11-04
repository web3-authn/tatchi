import React from 'react'
import { useCarousel } from './CarouselProvider'

export function Breadcrumbs({ style }: { style?: React.CSSProperties }) {
  const { pages, index, goTo } = useCarousel()
  return (
    <nav className="carousel-breadcrumbs" aria-label="Breadcrumb" style={style}>
      <ol>
        {pages.map((p, i) => {
          const isActive = i === index
          const isDisabled = !!p.disabled && !isActive
          return (
            <li key={p.key}>
              <button
                type="button"
                className={`crumb${isActive ? ' is-active' : ''}${isDisabled ? ' is-disabled' : ''}`}
                aria-current={isActive ? 'page' : undefined}
                aria-disabled={isDisabled || undefined}
                disabled={isDisabled}
                onClick={() => { if (!isDisabled) goTo(i) }}
              >
                {p.title}
              </button>
              {i < pages.length - 1 && (
                <span className="crumb-sep" aria-hidden>
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    width="16"
                    height="16"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    className="lucide lucide-chevron-right"
                  >
                    <path d="m9 18 6-6-6-6"></path>
                  </svg>
                </span>
              )}
            </li>
          )
        })}
      </ol>
    </nav>
  )
}

export default Breadcrumbs
