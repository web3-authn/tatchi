import { HomeHero } from '../components/HomeHero';
import { BentoGrid } from '../components/BentoGrid';
import { CombinedCodeBlock } from '../components/CombinedCodeBlock';
import { PasskeyColumn } from '../components/PasskeyColumn';
import { Footer } from '../components/Footer';

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
      <div className="card two">
        <PasskeyColumn />
      </div>

      {/* three */}
      <div className="card three">
        <div className="constrained-column">
          <BentoGrid />
        </div>
      </div>

      {/* four */}
      <div className="card four">
        <div className="constrained-column">
          <CombinedCodeBlock />
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
