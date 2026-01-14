import { useState } from 'react';
import Github from "./icons/Github";
import { LibraryBig } from 'lucide-react';
import { BookOpenText } from 'lucide-react';
import CopyButton from './CopyButton';
import { TouchIcon, useTheme } from '@tatchi-xyz/sdk/react';
import { useVitepressRouter } from '../hooks/useVitepressRouter';
import { mobilePressHandlers } from '../utils/press';
import { ArrowRightAnim } from './ArrowRightAnim';

export function HomeHero() {

  const [packageManager, setPackageManager] = useState<'npm' | 'pnpm' | 'bun'>('npm');
  const { linkProps } = useVitepressRouter();
  const { theme } = useTheme();

  const installBlockCmd = packageManager === 'npm'
    ? 'npm install @tatchi-xyz/sdk'
    : packageManager === 'pnpm'
    ? 'pnpm add @tatchi-xyz/sdk'
    : 'bun add @tatchi-xyz/sdk';

  const highlightedInstall = installBlockCmd
    .replace(/^(npm|pnpm|bun)/, '<span class="code-kw-pm">$1</span>')
    .replace(/(@tatchi-xyz\/sdk)/, '<span class="code-kw-pkg">$1</span>');

  return (
    <>
      <section className="hero" aria-labelledby="hero-title">
        <h1 className="hero-title">
          Tatchi Passkey Wallet
          <span className="touch-icon-pattern-position" aria-hidden="true">
            <TouchIcon
              style={{ color: theme == 'dark' ? 'var(--w3a-colors-surface)' : 'var(--w3a-colors-surface2)'}}
              strokeWidth={11}
              width={124}
              height={124}
            />
          </span>
        </h1>
        <h3 className="hero-subtitle">
          A TouchID native wallet
        </h3>
        <p className="hero-description">
          Tatchi is a browser embedded wallet allows users to
          sign transactions without popups, managing keys, or installing extensions.
        </p>
        <h3 className="hero-subtitle">
          No popups. No keys. No passwords.
        </h3>
        <p className="hero-description">
          Keep full control of your UI with zero popups,
          serverless WebAuthn authentication with VRF challenges designed for security and speed.
        </p>
        <h3 className="hero-subtitle">
          Fearless account recovery
        </h3>
        <p className="hero-description">
          Your passkey is your wallet.
          Tatchi derives wallets from Passkeys and saves authenticator metadata onchain,
          meaning your users can sync accounts, and link multiple devices all by themselves without
          intermediaries.
        </p>
        <div className="hero-ctas">
          <a
            className="cta-button cta-primary cta-3"
            {...linkProps('/docs/getting-started/installation')}
            aria-label="Read the documentation"
          >
            <LibraryBig size={24} className="cta-icon" aria-hidden="true" />
            <span>Get Started</span>
            <ArrowRightAnim className="cta-icon" size={16}/>
          </a>
          <a className="cta-button cta-secondary cta-3" href="https://github.com/web3-authn/tatchi" target="_blank" rel="noopener noreferrer" aria-label="Open the Tatchi GitHub repository">
            <Github size={22} className="cta-icon" aria-hidden="true" />
            <span>Github Repository</span>
            <ArrowRightAnim className="cta-icon" size={16}/>
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
                    aria-selected={packageManager === k}
                    className={`install-tab${packageManager === k ? ' active' : ''}`}
                    {...mobilePressHandlers(() => setPackageManager(k))}
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
