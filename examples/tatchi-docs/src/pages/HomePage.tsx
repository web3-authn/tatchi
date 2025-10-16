import { useState } from 'react';
import GithubIcon  from "../components/GithubIcon";
import { BookOpenText, PanelsTopLeft, Boxes, Cog, Code, SquareTerminal, Copy, Twitter } from 'lucide-react';
import { usePasskeyContext, useTheme } from '@tatchi/sdk/react';

import { PasskeyLoginMenu } from '../components/PasskeyLoginMenu';
import { GreetingMenu } from '../components/GreetingMenu';
import { TransactionDetails } from '../components/TransactionDetails';
import { EmbeddedTxButton } from '../components/EmbeddedTxButton'
import type { LastTxDetails } from '../types';
import reactSnippet from '../snippets/react.tsx.txt?raw'
import coreSnippet from '../snippets/core.ts.txt?raw'
import { reactHtmlLight, reactHtmlDark, coreHtmlLight, coreHtmlDark } from '../generated/home-snippets-html'

export function HomePage() {
  const [lastTxDetails, setLastTxDetails] = useState<LastTxDetails | null>(null);
  // package manager selector for install command
  const [pm, setPm] = useState<'npm' | 'pnpm' | 'yarn' | 'bun'>('npm');
  // separate selector for full code-block install (npm/pnpm/bun only)
  const [pmBlock, setPmBlock] = useState<'npm' | 'pnpm' | 'bun'>('npm');
  const installCmd = pm === 'npm'
    ? 'npm install @tatchi/sdk'
    : pm === 'pnpm'
    ? 'pnpm add @tatchi/sdk'
    : pm === 'yarn'
    ? 'yarn add @tatchi/sdk'
    : 'bun add @tatchi/sdk';
  const installBlockCmd = pmBlock === 'npm'
    ? 'npm install @tatchi/sdk'
    : pmBlock === 'pnpm'
    ? 'pnpm add @tatchi/sdk'
    : 'bun add @tatchi/sdk';
  const highlightedInstall = installBlockCmd
    .replace(/^(npm|pnpm|bun)/, '<span class="code-kw-pm">$1</span>')
    .replace(/(@tatchi\/sdk)/, '<span class="code-kw-pkg">$1</span>')
  const copyText = (text: string) => { try { navigator.clipboard?.writeText(text); } catch {} };
  // Code snippets are imported as raw text from small .txt files

  const { loginState } = usePasskeyContext();
  const { tokens, theme } = useTheme();
  const navigate = (to: string) => (e: React.MouseEvent<HTMLAnchorElement>) => {
    try { e.preventDefault() } catch {}
    try {
      // Prefer VitePress client-side navigation when available
      const vpGo = (window as any).__vp_go
      if (typeof vpGo === 'function') return vpGo(to)
      window.dispatchEvent(new CustomEvent('vp:navigate', { detail: to }))
    } catch {
      // Fallback to hard navigation
      try { window.location.href = to } catch {}
    }
  }

  return (
    <div className="layout-root">

      <div className="layout-column-left" data-w3a-theme={theme}>
        <div className="constrained-column">
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
                <GithubIcon size={16} className="cta-icon" aria-hidden="true" />
                <span>GitHub</span>
              </a>
            </div>
          </section>

          <section className="hero-intro" aria-label="SDK overview">

            {/* Install command as a full code block with tab switcher */}
            <div className="install-panel" style={{ marginTop: '0.5rem' }} role="group" aria-label="Install command (CLI)">
              <div className="install-header">
                <div className="install-header-left">
                  <SquareTerminal size={16} aria-hidden className="install-term" />
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
                <button className="install-copy" onClick={() => copyText(installBlockCmd)} aria-label="Copy install command">
                  <Copy size={16} aria-hidden />
                </button>
              </div>
              <div className="install-body">
                <pre className="code-block code-block--dark"><code dangerouslySetInnerHTML={{ __html: highlightedInstall }} /></pre>
              </div>
            </div>
          </section>

          <section className="bento-grid" aria-label="Key features">
            <div className="bento-card accent-pink" role="group" aria-labelledby="bento-dev-title">
              <div className="bento-content">
                <PanelsTopLeft className="bento-icon" aria-hidden />
                <h3 className="bento-title" id="bento-dev-title">Developer First</h3>
                <p className="bento-desc">No selectors or popups. Embed and keep full UX control.</p>
              </div>
            </div>
            <div className="bento-card accent-orange" role="group" aria-labelledby="bento-flex-title">
              <div className="bento-content">
                <Boxes className="bento-icon" aria-hidden />
                <h3 className="bento-title" id="bento-flex-title">Serverless WebAuthn</h3>
                <p className="bento-desc">VRF‑based challenges replace centralized verifiers.</p>
              </div>
            </div>
            <div className="bento-card accent-teal" role="group" aria-labelledby="bento-simple-title">
              <div className="bento-content">
                <Cog className="bento-icon" aria-hidden />
                <h3 className="bento-title" id="bento-simple-title">Simple & modular</h3>
                <p className="bento-desc">Open source. Use just the parts you need.</p>
              </div>
            </div>
            <div className="bento-card accent-blue" role="group" aria-labelledby="bento-prog-title">
              <div className="bento-content">
                <Code className="bento-icon" aria-hidden />
                <h3 className="bento-title" id="bento-prog-title">Programmable</h3>
                <p className="bento-desc">Integrate flows, tooltips, and confirmations in your app.</p>
              </div>
            </div>
          </section>

          <section className="hero-intro" aria-label="SDK overview">
            {/* Getting started code blocks */}
            <div className="install-panel" style={{ marginTop: '0.75rem' }} role="group" aria-label="React setup">
              <div className="install-header">
                <div className="install-header-left">
                  <SquareTerminal size={16} aria-hidden className="install-term" />
                  <div className="install-tabs"><span className="install-tab active">react</span></div>
                </div>
                <button className="install-copy" onClick={() => copyText(reactSnippet)} aria-label="Copy React example">
                  <Copy size={16} aria-hidden />
                </button>
              </div>
              <div className="install-body">
                <div
                  dangerouslySetInnerHTML={{ __html: theme === 'dark' ? reactHtmlDark : reactHtmlLight }}
                />
              </div>
            </div>

            <div className="install-panel" style={{ marginTop: '0.5rem' }} role="group" aria-label="Core setup">
              <div className="install-header">
                <div className="install-header-left">
                  <SquareTerminal size={16} aria-hidden className="install-term" />
                  <div className="install-tabs"><span className="install-tab active">core</span></div>
                </div>
                <button className="install-copy" onClick={() => copyText(coreSnippet)} aria-label="Copy Core example">
                  <Copy size={16} aria-hidden />
                </button>
              </div>
              <div className="install-body">
                <div
                  dangerouslySetInnerHTML={{ __html: theme === 'dark' ? coreHtmlDark : coreHtmlLight }}
                />
              </div>
            </div>
          </section>

          <footer className="site-footer" aria-label="Social links">
            <a
              className="site-footer-link"
              href="https://github.com/web3-authn/tatchi"
              target="_blank"
              rel="noopener noreferrer"
              aria-label="Open the Tatchi GitHub repository"
            >
              <GithubIcon size={24} aria-hidden />
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

      <div className="layout-column-right" data-w3a-theme={theme}>
        <div className="constrained-column">
          <div className="passkey-sticky">
            {
              loginState.isLoggedIn
              ? <>
                  <GreetingMenu onTransactionUpdate={setLastTxDetails} />
                  <EmbeddedTxButton setLastTxDetails={setLastTxDetails} />
                  <TransactionDetails lastTxDetails={lastTxDetails} />
                </>
              : <PasskeyLoginMenu />
            }
          </div>
        </div>
      </div>
    </div>
  );
}
