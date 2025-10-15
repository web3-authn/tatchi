import React from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { NavbarStatic } from './NavbarStatic'

class WalletNavbarElement extends HTMLElement {
  private root: Root | null = null

  connectedCallback() {
    const shadow = this.attachShadow({ mode: 'open' })
    const container = document.createElement('div')
    shadow.appendChild(container)
    this.root = createRoot(container)
    this.root.render(<NavbarStatic />)
  }

  disconnectedCallback() {
    this.root?.unmount()
    this.root = null
  }
}

if (!customElements.get('wallet-navbar')) {
  customElements.define('wallet-navbar', WalletNavbarElement)
}
