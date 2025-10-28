import { useState } from 'react';
import Github from "./icons/Github";
import { BookOpenText } from 'lucide-react';
import CopyButton from './CopyButton';
import { TouchIcon } from '@tatchi-xyz/sdk/react';
import { useVitepressRouter } from '../hooks/useVitepressRouter';

export function HomeHero() {
  const [pmBlock, setPmBlock] = useState<'npm' | 'pnpm' | 'bun'>('npm');
  const { linkProps } = useVitepressRouter();

  const installBlockCmd = pmBlock === 'npm'
    ? 'npm install @tatchi-xyz/sdk'
    : pmBlock === 'pnpm'
    ? 'pnpm add @tatchi-xyz/sdk'
    : 'bun add @tatchi-xyz/sdk';

  const highlightedInstall = installBlockCmd
    .replace(/^(npm|pnpm|bun)/, '<span class="code-kw-pm">$1</span>')
    .replace(/(@tatchi\/sdk)/, '<span class="code-kw-pkg">$1</span>');

  return (
    <>
      <section className="hero" aria-labelledby="hero-title">
        <h1 id="hero-title" className="hero-title">
          <span aria-hidden="true" style={{ display: 'inline-flex', marginRight: '0.5rem', verticalAlign: 'middle' }}>
            <TouchIcon className="w3a-user-account--fingerprint-icon open w3a-touch-icon--hero" width={40} height={40} />
          </span>
          Tatchi Passkey Wallet
        </h1>
        <p className="hero-subtitle" style={{ fontSize: '1.1rem', fontWeight: 600, margin: '0.5rem 0 0.25rem 0' }}>
          A TouchID based embedded wallet
          <br/>
          No popups. No keys. Serverless.
        </p>
        <p className="hero-description" style={{ margin: '0 0 0.75rem 0', color: 'var(--fe-text-dim)' }}>
          Tatchi is an embedded wallet SDK that brings passwordless authentication and on‑chain
          transactions directly into your app.
          <br/>
          Keep full control of your UI with zero popups,
          serverless WebAuthn, and VRF‑backed challenge flows designed for security and speed.
        </p>
        <div className="hero-ctas">
          <a
            className="cta-secondary"
            {...linkProps('/docs/getting-started/install')}
            aria-label="Read the documentation"
          >
            <BookOpenText size={16} className="cta-icon" aria-hidden="true" />
            <span>Get Started</span>
            <span className="cta-chevron" aria-hidden>›</span>
          </a>
          <a className="cta-primary" href="https://github.com/web3-authn/tatchi" target="_blank" rel="noopener noreferrer" aria-label="Open the Tatchi GitHub repository">
            <Github size={16} className="cta-icon" aria-hidden="true" />
            <span>GitHub</span>
          </a>
        </div>
      </section>

      {/* Install command as a full code block with tab switcher */}
      <section className="hero-intro" aria-label="Install the SDK">
        <div className="install-panel" role="group" aria-label="Install command (CLI)">
          <div className="install-header">
            <div className="install-header-left">
              <div className="install-tabs" role="tablist" aria-label="Package managers (CLI)">
                {(['npm','pnpm','bun'] as const).map((k) => (
                  <button
                    key={k}
                    role="tab"
                    aria-selected={pmBlock === k}
                    className={`install-tab${pmBlock === k ? ' active' : ''}`}
                    onClick={() => setPmBlock(k)}
                  >{k}</button>
                ))}
              </div>
            </div>
            <CopyButton
              text={installBlockCmd}
              size={16}
              ariaLabel="Copy install command"
            />
          </div>
          <div className="install-body">
            <pre className="code-block code-block--dark"><code dangerouslySetInnerHTML={{ __html: highlightedInstall }} /></pre>
          </div>
        </div>
      </section>
    </>
  );
}
