import React from 'react'
import { HomeHero } from '../components/HomeHero';
import { BentoGrid } from '../components/BentoGrid';
import { GetStartedCodeBlock } from '../components/GetStartedCodeBlock';
import { Footer } from '../components/Footer';
import { useRevealOnIdle } from '../hooks/useRevealOnIdle';

// Defer loading the DemoPasskeyColumn until after first paint/idle
const DemoPasskeyColumnLazy = React.lazy(() => import('../components/DemoPasskeyColumn').then(m => ({ default: m.DemoPasskeyColumn })))

const SectionPlaceholder: React.FC = () => (
  <div style={{ minHeight: 360 }} />
)

const LazyPasskeySection: React.FC = () => {
  const show = useRevealOnIdle()
  return (
    <div className="card two">
      {show ? (
        <React.Suspense fallback={<SectionPlaceholder />}>
          <DemoPasskeyColumnLazy />
        </React.Suspense>
      ) : (
        <SectionPlaceholder />
      )}
    </div>
  )
}

export function HomePage() {
  return (
    <div className="layout-root">
      {/* one */}
      <div className="card one">
        <div className="constrained-column">
          <HomeHero />
        </div>
      </div>

      {/* two */}
      <LazyPasskeySection />

      {/* three */}
      <div className="card three">
        <div className="constrained-column">
          <BentoGrid />
        </div>
      </div>

      {/* four */}
      <div className="card four">
        <div className="constrained-column">
          <GetStartedCodeBlock />
        </div>
      </div>

      {/* five */}
      <div className="card five">
        <div className="full-bleed">
          <Footer />
        </div>
      </div>
    </div>
  );
}
