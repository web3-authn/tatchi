import { useState } from 'react';
import { ArrowUpRight, BookOpen } from 'lucide-react';
import CopyButton from './CopyButton';
import { useTheme } from '@tatchi-xyz/sdk/react';
import { mobilePressHandlers } from '../utils/press';
import NearLogo from './icons/NearLogoWithText';
import { useVitepressRouter } from '../hooks/useVitepressRouter';

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
          className="cta-button cta-primary"
          {...linkProps('/docs/getting-started/overview')}
          aria-label="Learn more about the Tatchi SDK"
        >
          <BookOpen size={16} className="cta-icon" aria-hidden="true" />
          <span>Learn More</span>
        </a>
        <a
          className="cta-button cta-secondary"
          {...linkProps('/docs/getting-started/installation')}
          aria-label="Get started installing the Tatchi SDK"
        >
          <span>Get Started</span>
          <ArrowUpRight size={16} className="cta-icon" aria-hidden="true" />
        </a>
        <a
          href="https://near.org"
          target="_blank"
          rel="noopener noreferrer"
          className="hero-built-on"
          aria-label="Built on NEAR"
        >
          <span className="hero-built-on__label">built on</span>
          <NearLogo size={80} />
        </a>
      </div>

    </section>
  );
}
