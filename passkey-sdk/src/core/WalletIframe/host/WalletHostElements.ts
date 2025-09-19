import { css } from 'lit';
import { html as htmlDyn, unsafeStatic } from 'lit/static-html.js';
import { ref, createRef, Ref } from 'lit/directives/ref.js';
import { LitElementWithProps } from '../../WebAuthnManager/LitComponents/LitElementWithProps';

// Ensure underlying lit elements are defined and not tree‑shaken
import '../../WebAuthnManager/LitComponents/EmbeddedRegisterButton';
import { EmbeddedRegisterButton as __KeepRegister } from '../../WebAuthnManager/LitComponents/EmbeddedRegisterButton/index';
import { IframeButtonHost as __KeepTxButton } from '../../WebAuthnManager/LitComponents/IframeButtonWithTooltipConfirmer/IframeButtonHost';

// Types mirrored from React hosts to smooth interop
import type { WalletIframeRegisterButtonHostProps } from '../../../react/components/WalletIframeRegisterButtonHost';
import type { WalletIframeTxButtonHostProps } from '../../../react/components/WalletIframeTxButtonHost';
import type { TransactionInput } from '../../types';
import { getTag, defineTag } from '../../WebAuthnManager/LitComponents/tags';

// Keep references alive
// eslint-disable-next-line @typescript-eslint/no-unused-vars
const __ensure = [__KeepRegister, __KeepTxButton];

/**
 * w3a-wallet-register-host
 * Thin Lit wrapper that renders the existing <embedded-register-button>
 * while exposing the same props shape as WalletIframeRegisterButtonHost.
 *
 * Business logic (calling PasskeyManager) should be wired by the caller via
 * listening to the 'w3a-register-click' event on this element or by setting
 * the busy state via property on the child.
 */
export class WalletRegisterHostElement extends LitElementWithProps {
  static properties = {
    nearAccountId: { type: String, attribute: 'near-account-id' },
    text: { type: String },
    theme: { type: String },
    width: { type: String },
    height: { type: String },
    styleMap: { type: Object },
    autoClose: { type: Boolean, attribute: 'auto-close' },
    busy: { type: Boolean },
  } as const;

  declare nearAccountId: string;
  declare text?: string;
  declare theme?: 'dark' | 'light';
  declare width?: string;
  declare height?: string;
  // Avoid shadowing HTMLElement.className; read from attribute instead
  declare styleMap?: Record<string, string>;
  declare autoClose?: boolean;
  declare busy?: boolean;

  static styles = css`
    :host { display: inline-block; }
  `;

  private regRef: Ref<HTMLElement> = createRef();

  render() {
    const text = this.text ?? 'Create Passkey';
    const theme = this.theme === 'light' ? 'light' : 'dark';
    const width = this.width ?? '220px';
    const height = this.height ?? '44px';
    const styleObj = this.styleMap || {};
    const hostClass = this.getAttribute('class') || '';

    const childTag = unsafeStatic(getTag('registerButton'));
    return htmlDyn`
      <${childTag}
        ${ref(this.regRef)}
        .text=${text}
        .theme=${theme}
        .width=${width}
        .height=${height}
        .busy=${!!this.busy}
        .buttonClass=${hostClass}
        .buttonStyle=${styleObj}
      ></${childTag}>
    `;
  }
}

// Preferred + alias
try { defineTag('registerHost', WalletRegisterHostElement as unknown as CustomElementConstructor); } catch {}

/**
 * w3a-wallet-tx-host
 * Thin Lit wrapper that renders the existing <iframe-button> (tooltip confirmer)
 * while exposing a props shape compatible with WalletIframeTxButtonHost.
 *
 * The caller should set `.externalConfirm`, `.onSuccess`, `.onCancel` on this
 * element instance to wire business logic.
 */
export class WalletTxHostElement extends LitElementWithProps {
  static properties = {
    nearAccountId: { type: String, attribute: 'near-account-id' },
    transactions: { type: Array },
    text: { type: String },
    theme: { type: String },
    buttonStyle: { type: Object },
    buttonHoverStyle: { type: Object },
    tooltipPosition: { type: Object },
  } as const;

  declare nearAccountId: string;
  declare transactions: Array<TransactionInput>;
  declare text?: string;
  declare theme?: 'dark' | 'light';
  // Avoid shadowing HTMLElement.className; read from attribute instead
  declare buttonStyle?: Record<string, string> | CSSStyleDeclaration;
  declare buttonHoverStyle?: Record<string, string> | CSSStyleDeclaration;
  declare tooltipPosition?: Record<string, string>;

  // Function props to be assigned by controller
  externalConfirm?: (args: {
    nearAccountId: string;
    txSigningRequests: TransactionInput[];
    options?: Record<string, unknown>;
  }) => Promise<unknown>;
  onSuccess?: (result: unknown) => void;
  onCancel?: () => void;

  private txRef: Ref<HTMLElement> = createRef();

  render() {
    const text = this.text ?? 'Send Transaction';
    const theme = this.theme === 'light' ? 'light' : 'dark';
    const hostClass = this.getAttribute('class') || '';

    const childTag = unsafeStatic(getTag('txButton'));
    return htmlDyn`
      <${childTag}
        ${ref(this.txRef)}
        class=${hostClass}
        .nearAccountId=${this.nearAccountId}
        .txSigningRequests=${this.transactions || []}
        .buttonTextElement=${text}
        .txTreeTheme=${theme}
        .buttonStyle=${this.buttonStyle || {}}
        .buttonHoverStyle=${this.buttonHoverStyle || {}}
        .tooltipPosition=${this.tooltipPosition || undefined}
        .externalConfirm=${this.externalConfirm}
        .onSuccess=${this.onSuccess}
        .onCancel=${this.onCancel}
      ></${childTag}>
    `;
  }
}

// Preferred + alias
try { defineTag('txHost', WalletTxHostElement as unknown as CustomElementConstructor); } catch {}

export type { WalletIframeRegisterButtonHostProps, WalletIframeTxButtonHostProps };
