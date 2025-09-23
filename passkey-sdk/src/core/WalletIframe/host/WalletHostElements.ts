import { html as htmlDyn, unsafeStatic } from 'lit/static-html.js';
import { ref, createRef, Ref } from 'lit/directives/ref.js';
import { LitElementWithProps } from '../../WebAuthnManager/LitComponents/LitElementWithProps';

// Ensure underlying lit elements are defined and not tree‑shaken
import { IframeButtonHost as __KeepTxButton } from '../../WebAuthnManager/LitComponents/IframeButtonWithTooltipConfirmer/iframe-host';

// Types mirrored from React hosts to smooth interop
import type { WalletIframeTxButtonHostProps } from '../../../react/components/WalletIframeTxButtonHost';
import type { TransactionInput } from '../../types';
import { getTag, defineTag } from '../../WebAuthnManager/LitComponents/tags';

// Keep references alive
// eslint-disable-next-line @typescript-eslint/no-unused-vars
const __ensure = [__KeepTxButton];

// Register-button host removed; only transaction host remains.
// Register host removed

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

export type { WalletIframeTxButtonHostProps };
