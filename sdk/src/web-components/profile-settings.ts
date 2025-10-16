import React from 'react';
import { createRoot, Root } from 'react-dom/client';

import { ProfileSettingsButton } from '../react/components/ProfileSettingsButton';
import type { ProfileSettingsButtonProps, DeviceLinkingScannerParams } from '../react/components/ProfileSettingsButton/types';
import { TatchiPasskeyProvider } from '../react/components/shell/TatchiPasskeyProvider';
import type { PasskeyManagerConfigs } from '../core/types/passkeyManager';

import { attachOpenShadow, dispatchTypedEvent, ensureReactStyles, getPortalTarget, toBoolean, toStringAttr, type PortalStrategy } from './utils';

// Tag name used for the custom element
export const TATCHI_PROFILE_SETTINGS_TAG = 'tatchi-profile-settings';

type PartialConfig = Partial<PasskeyManagerConfigs>;

/**
 * Web Component wrapper for React ProfileSettingsButton.
 * Provides a framework-agnostic custom element that mounts a React tree
 * within an open ShadowRoot and bridges attributes/properties to React props.
 *
 * Notes:
 * - Requires PasskeyManager configuration. Provide via the `config` property
 *   or minimal attributes like `relayer-url`. For advanced setups, set the
 *   full `config` object on the element instance.
 */
export class TatchiProfileSettingsElement extends HTMLElement {
  static get observedAttributes() {
    return ['near-account-id', 'username', 'hide-username', 'near-explorer-base-url', 'portal-strategy', 'theme'];
  }

  private _root: Root | null = null;
  private _shadow!: ShadowRoot;

  // Attributes → internal state
  private _nearAccountId?: string;
  private _username?: string | null;
  private _hideUsername?: boolean;
  private _nearExplorerBaseUrl?: string;
  private _portalStrategy: PortalStrategy = 'shadow';
  private _themeName?: 'light' | 'dark';

  // Properties → passed to React props
  private _onLogout?: () => void;
  private _deviceLinkingScannerParams?: DeviceLinkingScannerParams;
  private _portalTarget?: HTMLElement | ShadowRoot | null;
  private _config?: PartialConfig;

  connectedCallback() {
    this._shadow = attachOpenShadow(this);
    if (!this._root) {
      this._root = createRoot(this._ensureMount());
    }
    // Inject shared React styles into this shadow root
    void ensureReactStyles(this._shadow);
    this._readAllAttributes();
    this._render();
  }

  disconnectedCallback() {
    try { this._root?.unmount(); } catch {}
    this._root = null;
  }

  attributeChangedCallback(name: string, _old: string | null, value: string | null) {
    switch (name) {
      case 'near-account-id':
        this._nearAccountId = toStringAttr(value);
        break;
      case 'username':
        this._username = toStringAttr(value) ?? null;
        break;
      case 'hide-username':
        this._hideUsername = toBoolean(value);
        break;
      case 'near-explorer-base-url':
        this._nearExplorerBaseUrl = toStringAttr(value);
        break;
      case 'portal-strategy':
        this._portalStrategy = (value === 'document' ? 'document' : 'shadow');
        break;
      case 'theme':
        this._themeName = (value === 'dark' ? 'dark' : value === 'light' ? 'light' : undefined);
        break;
    }
    this._render();
  }

  // Properties
  get onLogout() { return this._onLogout; }
  set onLogout(fn: (() => void) | undefined) {
    this._onLogout = fn;
    this._render();
  }

  get deviceLinkingScannerParams() { return this._deviceLinkingScannerParams; }
  set deviceLinkingScannerParams(v: DeviceLinkingScannerParams | undefined) {
    this._deviceLinkingScannerParams = v;
    this._render();
  }

  get portalTarget() { return this._portalTarget ?? null; }
  set portalTarget(v: HTMLElement | ShadowRoot | null) {
    this._portalTarget = v;
    this._render();
  }

  get config() { return this._config; }
  set config(v: PartialConfig | undefined) {
    this._config = v;
    this._render();
  }
  get theme() { return this._themeName; }
  set theme(v: 'light' | 'dark' | undefined) {
    this._themeName = v;
    this._render();
  }

  // Internal helpers
  private _ensureMount(): HTMLElement {
    let mount = this._shadow.querySelector('#root') as HTMLElement | null;
    if (!mount) {
      mount = document.createElement('div');
      mount.id = 'root';
      this._shadow.appendChild(mount);
    }
    return mount;
  }

  private _readAllAttributes() {
    this._nearAccountId = toStringAttr(this.getAttribute('near-account-id'));
    this._username = toStringAttr(this.getAttribute('username')) ?? null;
    this._hideUsername = toBoolean(this.getAttribute('hide-username'));
    this._nearExplorerBaseUrl = toStringAttr(this.getAttribute('near-explorer-base-url'));
    const ps = this.getAttribute('portal-strategy');
    this._portalStrategy = (ps === 'document' ? 'document' : 'shadow');
  }

  private _buildProps(): ProfileSettingsButtonProps {
    const portalTarget = getPortalTarget(this, this._portalStrategy, this._portalTarget);
    const onLogoutWrapped = () => {
      try { this._onLogout?.(); } catch {}
      dispatchTypedEvent(this, 'logout');
    };

    const scanner: DeviceLinkingScannerParams | undefined = this._deviceLinkingScannerParams ? {
      ...this._deviceLinkingScannerParams,
      onDeviceLinked: (r) => {
        try { this._deviceLinkingScannerParams?.onDeviceLinked?.(r); } catch {}
        dispatchTypedEvent(this, 'deviceLinked', r);
      },
      onError: (err) => {
        try { this._deviceLinkingScannerParams?.onError?.(err as any); } catch {}
        dispatchTypedEvent(this, 'error', err);
      },
      onClose: () => {
        try { this._deviceLinkingScannerParams?.onClose?.(); } catch {}
        dispatchTypedEvent(this, 'close');
      },
      onEvent: (ev) => {
        try { this._deviceLinkingScannerParams?.onEvent?.(ev as any); } catch {}
        dispatchTypedEvent(this, 'deviceLinkingEvent', ev);
      },
    } : undefined;

    return {
      nearAccountId: this._nearAccountId || '',
      username: this._username || undefined,
      hideUsername: this._hideUsername,
      nearExplorerBaseUrl: this._nearExplorerBaseUrl,
      onLogout: onLogoutWrapped,
      deviceLinkingScannerParams: scanner,
      portalTarget,
    } as ProfileSettingsButtonProps;
  }

  private _render() {
    if (!this._root) return;

    const props = this._buildProps();

    // Build minimal config from attributes if no explicit config is set.
    const cfg: PartialConfig | undefined = this._config ?? this._inferConfigFromAttributes();

    if (!cfg || !cfg.relayer?.url) {
      // Render a small warning to make it explicit in vanilla HTML usage.
      this._root.render(React.createElement('div', {
        style: {
          fontFamily: 'system-ui, Arial, sans-serif',
          fontSize: '12px',
          color: '#a00',
          padding: '8px',
        }
      }, '[tatchi-profile-settings] Missing required Passkey config (relayer.url). Set element.config or relayer-url attribute.'));
      return;
    }

    const themeProps = this._themeName ? { theme: this._themeName } : undefined;
    const tree = (
      React.createElement(TatchiPasskeyProvider as any, { config: cfg, theme: themeProps },
        React.createElement(ProfileSettingsButton as any, props)
      )
    );

    this._root.render(tree);
  }

  private _inferConfigFromAttributes(): PartialConfig | undefined {
    // Support basic attributes for config to reduce friction in HTML usage.
    const relayerUrl = toStringAttr(this.getAttribute('relayer-url'));
    if (!relayerUrl) return undefined;

    const nearNetwork = toStringAttr(this.getAttribute('near-network')) as any;
    const nearRpcUrl = toStringAttr(this.getAttribute('near-rpc-url'));
    const contractId = toStringAttr(this.getAttribute('contract-id'));

    const walletOrigin = toStringAttr(this.getAttribute('wallet-origin'));
    const walletServicePath = toStringAttr(this.getAttribute('wallet-service-path'));
    const rpIdOverride = toStringAttr(this.getAttribute('rp-id-override'));

    const cfg: PartialConfig = {
      nearNetwork: (nearNetwork === 'mainnet' ? 'mainnet' : 'testnet'),
      nearRpcUrl: nearRpcUrl || (nearNetwork === 'mainnet' ? 'https://rpc.mainnet.near.org' : 'https://test.rpc.fastnear.com'),
      contractId: contractId || (nearNetwork === 'mainnet' ? 'tatchi-v1.near' : 'w3a-v1.testnet'),
      relayer: {
        accountId: (nearNetwork === 'mainnet' ? 'tatchi-v1.near' : 'w3a-v1.testnet'),
        url: relayerUrl,
      },
    } as PartialConfig;

    if (walletOrigin || walletServicePath || rpIdOverride) {
      cfg.iframeWallet = {
        walletOrigin: walletOrigin || undefined,
        walletServicePath: walletServicePath || undefined,
        rpIdOverride: rpIdOverride || undefined,
      } as any;
    }

    return cfg;
  }
}

export function defineProfileSettings(tag: string = TATCHI_PROFILE_SETTINGS_TAG) {
  if (!customElements.get(tag)) customElements.define(tag, TatchiProfileSettingsElement);
}

// Side-effect friendly auto-define when importing this module directly
try { defineProfileSettings(); } catch {}
