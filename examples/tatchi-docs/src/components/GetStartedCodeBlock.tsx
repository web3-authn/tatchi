import { useState } from 'react';
import { BookOpen } from 'lucide-react';
import CopyButton from './CopyButton';
import { useTheme } from '@tatchi-xyz/sdk/react';
import { mobilePressHandlers } from '../utils/press';
import NearLogo from './icons/NearLogoWithText';
import { useVitepressRouter } from '../hooks/useVitepressRouter';
import { ArrowRightAnim } from './ArrowRightAnim';

import reactSnippet from '../snippets/react.tsx.txt?raw';
import coreSnippet from '../snippets/core.ts.txt?raw';
import { reactHtmlLight, reactHtmlDark, coreHtmlLight, coreHtmlDark } from '../generated/home-snippets-html';

type TabKey = 'react' | 'core';

export function GetStartedCodeBlock() {
  const { theme } = useTheme();
  const [tab, setTab] = useState<TabKey>('core');
  const { linkProps } = useVitepressRouter();

  const currentSnippet = tab === 'react' ? reactSnippet : coreSnippet;
  const currentHtml = tab === 'react'
    ? (theme === 'dark' ? reactHtmlDark : reactHtmlLight)
    : (theme === 'dark' ? coreHtmlDark : coreHtmlLight);

  return (
    <section className="hero-intro" aria-label="SDK overview code examples">

      {/* <div className="hero-intro-title">
        <span>Simple.</span>
        <span>Seamless.</span>
        <span>Flexible.</span>
      </div> */}

      <div className="install-panel" role="group" aria-label="SDK setup code examples">
        <div className="install-header">
          <div className="install-header-left">
            <div className="install-tabs" role="tablist" aria-label="Framework examples">
              <button
                role="tab"
                aria-selected={tab === 'core'}
                className={`install-tab${tab === 'core' ? ' active' : ''}`}
                {...mobilePressHandlers(() => setTab('core'))}
              >Typescript</button>
              <button
                role="tab"
                aria-selected={tab === 'react'}
                className={`install-tab${tab === 'react' ? ' active' : ''}`}
                {...mobilePressHandlers(() => setTab('react'))}
              >React</button>
            </div>
          </div>
          <CopyButton
            text={currentSnippet}
            size={16}
            ariaLabel={`Copy ${tab === 'react' ? 'React' : 'Typescript'} example`}
          />
        </div>
        <div className="install-body">
          <div dangerouslySetInnerHTML={{ __html: currentHtml }} />
        </div>
      </div>

      <div className="hero-ctas-bottom-grid">
        <a
          className="cta-3"
          {...linkProps('/docs/getting-started/overview')}
          aria-label="Learn more about the Tatchi SDK"
        >
          <span>Learn More</span>
          <ArrowRightAnim className="cta-icon" size={16}/>
        </a>
        <a
          className="cta-3"
          {...linkProps('/docs/getting-started/installation')}
          aria-label="Get started installing the Tatchi SDK"
        >
          <span>Get Started</span>
          <ArrowRightAnim className="cta-icon" size={16}/>
        </a>
        <a
          href="https://near.org"
          target="_blank"
          rel="noopener noreferrer"
          className="hero-built-on cta-3"
          aria-label="Built on NEAR"
        >
          <span className="hero-built-on__label">Built on</span>
          <NearLogo className={"near-svg"} size={96} />
          <ArrowRightAnim className="cta-icon" size={16}/>
        </a>
      </div>

    </section>
  );
}
