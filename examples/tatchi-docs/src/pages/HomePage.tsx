import React from 'react'
import { HomeHero } from '../components/HomeHero';
import { BentoGrid } from '../components/BentoGrid';
import { GetStartedCodeBlock } from '../components/GetStartedCodeBlock';
import { Footer } from '../components/Footer';

// Defer loading the PasskeyColumn until after first paint/idle
const PasskeyColumnLazy = React.lazy(() => import('../components/PasskeyColumn').then(m => ({ default: m.PasskeyColumn })))

function useRevealOnIdle(delayMs = 200, idleTimeoutMs = 1500): boolean {
  const [ready, setReady] = React.useState(false)
  React.useEffect(() => {
    const onIdle = (cb: () => void) =>
      (window as any).requestIdleCallback
        ? (window as any).requestIdleCallback(cb, { timeout: idleTimeoutMs })
        : setTimeout(cb, Math.min(idleTimeoutMs, 600))
    const t = setTimeout(() => onIdle(() => setReady(true)), delayMs)
    return () => { clearTimeout(t as any) }
  }, [delayMs, idleTimeoutMs])
  return ready
}

const SectionPlaceholder: React.FC = () => (
  <div style={{ minHeight: 360 }} />
)

const LazyPasskeySection: React.FC = () => {
  const show = useRevealOnIdle()
  return (
    <div className="card two">
      {show ? (
        <React.Suspense fallback={<SectionPlaceholder />}> 
          <PasskeyColumnLazy />
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
