import React from 'react'
import './Footer.css'
import NearLogo from './icons/NearLogoWithText'

export const Footer: React.FC = () => {
  return (
    <footer className="app-footer" aria-label="Site footer">
      <div className="app-footer__brandword" aria-hidden> Tatchi </div>
      <div className="app-footer__inner">
        <div className="app-footer__brand">
        </div>
        <nav className="app-footer__nav" aria-label="Footer navigation">
          <div className="app-footer__col">
          </div>
          <div className="app-footer__col">
            <div className="app-footer__heading">External Links</div>
            <a href="https://github.com/web3-authn/tatchi" target="_blank">GitHub</a>
            <a href="https://x.com/lowerarchy" target="_blank">Contact Us</a>
            <a href="/docs/concepts" target="_blank">Documentation</a>
            <a
              href="https://near.org"
              target="_blank"
              rel="noopener noreferrer"
              className="app-footer__logo"
              aria-label="built on NEAR"
            >
              Built on <NearLogo className="app-footer__logo-svg" />
            </a>
          </div>
        </nav>
      </div>
    </footer>
  )
}

export default Footer
