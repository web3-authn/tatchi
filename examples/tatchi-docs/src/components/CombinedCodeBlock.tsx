import { useState } from 'react';
import CopyButton from './CopyButton';
import { useTheme } from '@tatchi-xyz/sdk/react';
import { mobilePressHandlers } from '../utils/press';

import reactSnippet from '../snippets/react.tsx.txt?raw'
import coreSnippet from '../snippets/core.ts.txt?raw'
import { reactHtmlLight, reactHtmlDark, coreHtmlLight, coreHtmlDark } from '../generated/home-snippets-html'

type TabKey = 'react' | 'core';

export function CombinedCodeBlock() {
  const { theme } = useTheme();
  const [tab, setTab] = useState<TabKey>('core');

  const currentSnippet = tab === 'react' ? reactSnippet : coreSnippet;
  const currentHtml = tab === 'react'
    ? (theme === 'dark' ? reactHtmlDark : reactHtmlLight)
    : (theme === 'dark' ? coreHtmlDark : coreHtmlLight);

  return (
    <section className="hero-intro" aria-label="SDK overview code examples">
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
    </section>
  );
}
