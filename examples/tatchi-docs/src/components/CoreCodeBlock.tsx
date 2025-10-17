import CopyButton from './CopyButton';
import coreSnippet from '../snippets/core.ts.txt?raw'
import { useTheme } from '@tatchi/sdk/react';
import { coreHtmlLight, coreHtmlDark } from '../generated/home-snippets-html'

export function CoreCodeBlock() {
  const { theme } = useTheme();
  return (
    <section className="hero-intro" aria-label="SDK overview">
      <div className="install-panel" style={{ marginTop: '0.5rem' }} role="group" aria-label="Core setup">
        <div className="install-header">
          <div className="install-header-left">
            <div className="install-tabs"><span className="install-tab active">Typescript</span></div>
          </div>
          <CopyButton text={coreSnippet} ariaLabel="Copy Core example" size={14} />
        </div>
        <div className="install-body">
          <div
            dangerouslySetInnerHTML={{ __html: theme === 'dark' ? coreHtmlDark : coreHtmlLight }}
          />
        </div>
      </div>
    </section>
  );
}

