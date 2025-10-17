import CopyButton from './CopyButton';
import reactSnippet from '../snippets/react.tsx.txt?raw'
import { useTheme } from '@tatchi/sdk/react';
import { reactHtmlLight, reactHtmlDark } from '../generated/home-snippets-html'

export function ReactCodeBlock() {
  const { theme } = useTheme();
  return (
    <section className="hero-intro" aria-label="SDK overview">
      <div className="install-panel" style={{ marginTop: '0.75rem' }} role="group" aria-label="React setup">
        <div className="install-header">
          <div className="install-header-left">
            <div className="install-tabs"><span className="install-tab active">React</span></div>
          </div>
          <CopyButton text={reactSnippet} ariaLabel="Copy React example" size={14} />
        </div>
        <div className="install-body">
          <div
            dangerouslySetInnerHTML={{ __html: theme === 'dark' ? reactHtmlDark : reactHtmlLight }}
          />
        </div>
      </div>
    </section>
  );
}

