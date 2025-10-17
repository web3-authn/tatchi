import { useState } from 'react';
import Github from "./icons/Github";
import { BookOpenText } from 'lucide-react';
import CopyButton from './CopyButton';

export function HomeHero() {
  const [pmBlock, setPmBlock] = useState<'npm' | 'pnpm' | 'bun'>('npm');

  const installBlockCmd = pmBlock === 'npm'
    ? 'npm install @tatchi/sdk'
    : pmBlock === 'pnpm'
    ? 'pnpm add @tatchi/sdk'
    : 'bun add @tatchi/sdk';

  const highlightedInstall = installBlockCmd
    .replace(/^(npm|pnpm|bun)/, '<span class="code-kw-pm">$1</span>')
    .replace(/(@tatchi\/sdk)/, '<span class="code-kw-pkg">$1</span>');

  const navigate = (to: string) => (e: React.MouseEvent<HTMLAnchorElement>) => {
    try { e.preventDefault() } catch {}
    try {
      const vpGo = (window as any).__vp_go
      if (typeof vpGo === 'function') return vpGo(to)
      window.dispatchEvent(new CustomEvent('vp:navigate', { detail: to }))
    } catch {
      try { window.location.href = to } catch {}
    }
  };

  return (
    <>
      <section className="hero" aria-labelledby="hero-title">
        <h1 id="hero-title" className="hero-title">Tatchi Passkey Wallet</h1>
        <p className="hero-subtitle" style={{ fontSize: '1.1rem', fontWeight: 600, margin: '0.5rem 0 0.25rem 0' }}>
          A TouchID based embedded wallet
          <br/>
          No popups; no keys, full UX control
        </p>
        <p className="hero-description" style={{ margin: '0 0 0.75rem 0', color: 'var(--fe-text-dim)' }}>
          Tatchi is an embedded wallet SDK that brings passwordless authentication and on‑chain
          transactions directly into your app. Keep full control of your UI with zero popups,
          serverless WebAuthn, and VRF‑backed challenge flows designed for security and speed.
        </p>
        <div className="hero-ctas">
          <a className="cta-secondary" href="/docs/guides/" onClick={navigate('/docs/guides/')} aria-label="Read the documentation">
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
        <div className="install-panel" style={{ marginTop: '0.5rem' }} role="group" aria-label="Install command (CLI)">
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
            <CopyButton text={installBlockCmd} ariaLabel="Copy install command" size={14} />
          </div>
          <div className="install-body">
            <pre className="code-block code-block--dark"><code dangerouslySetInnerHTML={{ __html: highlightedInstall }} /></pre>
          </div>
        </div>
      </section>
    </>
  );
}

