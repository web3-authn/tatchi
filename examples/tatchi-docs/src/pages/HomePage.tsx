import { useState } from 'react';
import Github from "../components/icons/Github";
import Twitter from "../components/icons/Twitter";
import type { LastTxDetails } from '../types';
import { HomeHero } from '../components/HomeHero';
import { BentoGrid } from '../components/BentoGrid';
import { ReactCodeBlock } from '../components/ReactCodeBlock';
import { CoreCodeBlock } from '../components/CoreCodeBlock';
import { PasskeyColumn } from '../components/PasskeyColumn';

export function HomePage() {
  const [lastTxDetails, setLastTxDetails] = useState<LastTxDetails | null>(null);

  return (
    <div className="layout-root"
      // style={{ height: '100vh'  }}
    >

      <div className="layout-column-left">
        <div className="constrained-column">
          <HomeHero />

          <BentoGrid />

          <ReactCodeBlock />
          <CoreCodeBlock />

          <footer className="site-footer" aria-label="Social links">
            <a
              className="site-footer-link"
              href="https://github.com/web3-authn/tatchi"
              target="_blank"
              rel="noopener noreferrer"
              aria-label="Open the Tatchi GitHub repository"
            >
              <Github size={24} aria-hidden />
            </a>
            <a
              className="site-footer-link"
              href="https://x.com/"
              target="_blank"
              rel="noopener noreferrer"
              aria-label="Open our X (Twitter) profile"
            >
              <Twitter size={24} aria-hidden />
            </a>
          </footer>
        </div>
      </div>

      <PasskeyColumn lastTxDetails={lastTxDetails} setLastTxDetails={setLastTxDetails} />
    </div>
  );
}
