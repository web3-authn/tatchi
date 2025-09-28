
import type { ComponentStyles } from '../LitElementWithProps';
import { DARK_THEME, LIGHT_THEME } from '@/base-styles';

export type ModalConfirmerTheme = 'dark' | 'light';

export interface ModalTxConfirmerStyles extends ComponentStyles {
  // Component-specific modal variables
  host?: Record<string, string>;
  container?: Record<string, string>;
  content?: Record<string, string>;
  header?: Record<string, string>;
  grid?: Record<string, string>;
  row?: Record<string, string>;
  label?: Record<string, string>;
  value?: Record<string, string>;
  summarySection?: Record<string, string>;
  txSection?: Record<string, string>;
  actionOuter?: Record<string, string>;
  txList?: Record<string, string>;
  actionItem?: Record<string, string>;
  actionRow?: Record<string, string>;
  actionLabel?: Record<string, string>;
  actionContent?: Record<string, string>;
  actionValue?: Record<string, string>;
  actionSubitem?: Record<string, string>;
  actionSubheader?: Record<string, string>;
  codeBlock?: Record<string, string>;
  methodName?: Record<string, string>;
  buttons?: Record<string, string>;
  btn?: Record<string, string>;
  btnHover?: Record<string, string>;
  btnConfirmHover?: Record<string, string>;
  btnCancel?: Record<string, string>;
  btnConfirm?: Record<string, string>;
  loadingIndicator?: Record<string, string>;

  // Mobile responsive
  containerMobile?: Record<string, string>;
  headerMobile?: Record<string, string>;
  rowMobile?: Record<string, string>;
  actionRowMobile?: Record<string, string>;
  actionContentMobile?: Record<string, string>;
  buttonsMobile?: Record<string, string>;
  btnMobile?: Record<string, string>;
  actionContentScrollbarTrack?: Record<string, string>;
  actionContentScrollbarThumb?: Record<string, string>;
}

// Usage example:
// const customStyles: ModalTxConfirmerStyles = {
//   colorPrimary: '#ff6b6b',
//   colorBackground: '#2d3748',
//   fontSizeBase: '16px',
//   // ... customize other properties
// };
//
// const modal = document.createElement('passkey-modal-confirm');
// modal.styles = customStyles;
// document.body.appendChild(modal);

// Preset theme definitions for modal confirmer styling - comprehensive design system
export const MODAL_CONFIRMER_THEMES: Record<ModalConfirmerTheme, ModalTxConfirmerStyles> = {
  dark: {
    // Spread base colors from shared palette
    ...DARK_THEME,

    // Base design system variables
    host: {
      fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
      fontSize: '1rem',
      color: DARK_THEME.textPrimary,
      backgroundColor: DARK_THEME.colorBackground
    },

    // Main modal container
    modalBackdropBlur: {
      background: 'oklch(0.2 0.01 240 / 0.8)', // grey800 with alpha 0.8
      // backdropFilter: 'blur(0px)',
      // animation: 'none',
      // willChange: 'none',
      animation: 'backdrop-opacity 32ms ease-in',
      willChange: 'opacity',
    },
    modalBackdrop: {
      padding: '0.5rem',
      border: 'none',
      color: DARK_THEME.textPrimary,
    },
    modalContainerRoot: {
      // background: DARK_THEME.grey750,
      // border: `1px solid ${DARK_THEME.borderPrimary}`,
      // boxShadow: '0 2px 4px 0px rgba(25, 25, 25, 0.2)',
      background: 'none',
      border: 'none',
      boxShadow: 'none',
      margin: '1rem 0 0 0',
    },
    responsiveCard: {
      padding: '0rem',
      margin: '0px',
    },
    cardBackgroundBorder: {
      borderRadius: '2rem',
      background: DARK_THEME.colorBackground,
      border: `1px solid ${DARK_THEME.borderPrimary}`,
    },

    rpidWrapper: {
    },
    padlockIcon: {
      color: DARK_THEME.blue500,
    },
    blockHeightIcon: {
      color: DARK_THEME.blue500,
    },
    domainText: {
      color: DARK_THEME.textSecondary,
    },
    securityDetails: {
      color: DARK_THEME.textSecondary,
    },

    header: {
      color: DARK_THEME.textPrimary
    },
    grid: {
      color: DARK_THEME.textPrimary
    },
    row: {
      color: DARK_THEME.textPrimary
    },
    label: {
      color: DARK_THEME.textSecondary
    },
    value: {
      color: DARK_THEME.textPrimary
    },
    summarySection: {
      color: DARK_THEME.textPrimary
    },
    actionsTitle: {
      color: DARK_THEME.textSecondary
    },
    actionItem: {
      background: DARK_THEME.surface
    },
    actionRow: {
      color: DARK_THEME.textPrimary
    },
    actionLabel: {
      padding: '2px 0px',
      color: DARK_THEME.textSecondary
    },
    actionContent: {
      padding: '0.5rem',
      color: DARK_THEME.textPrimary,
      background: DARK_THEME.grey700,
      maxHeight: '50vh',
    },
    actionValue: {
      color: DARK_THEME.textPrimary
    },
    actionSubitem: {
    },
    actionSubheader: {
      color: DARK_THEME.highlightReceiverId
    },
    codeBlock: {
      fontSize: '0.75rem',
      margin: '4px 0px 0px 0px',
      background: DARK_THEME.grey650,
      color: DARK_THEME.grey350
    },
    methodName: {
      color: DARK_THEME.highlightMethodName
    },
    buttons: {
      background: 'transparent'
    },
    btn: {
      backgroundColor: DARK_THEME.surface,
      color: DARK_THEME.textPrimary,
      focusOutlineColor: DARK_THEME.primary,
    },
    btnConfirm: {
      padding: '0.5rem',
      backgroundColor: DARK_THEME.blue600,
      color: DARK_THEME.textPrimary,
      border: `1px solid ${DARK_THEME.blue400}`,
    },
    btnConfirmHover: {
      backgroundColor: DARK_THEME.blue500
    },
    btnCancel: {
      color: DARK_THEME.textPrimary,
      backgroundColor: DARK_THEME.colorBackground,
      border: `1px solid ${DARK_THEME.borderPrimary}`,
    },
    btnCancelHover: {
      backgroundColor: DARK_THEME.grey700,
    },
    btnDanger: {
      backgroundColor: DARK_THEME.red600,
      border: `1px solid ${DARK_THEME.red500}`,
    },
    btnDangerHover: {
      backgroundColor: DARK_THEME.red500,
    },
    loadingIndicator: {
      borderColor: DARK_THEME.borderPrimary,
      borderTopColor: DARK_THEME.primary
    },

    // PasskeyHaloLoading CSS variables
    passkeyHaloLoading: {
      innerBackground: DARK_THEME.grey650,
      innerPadding: '6px',
      ringBackground: `transparent 0%, ${LIGHT_THEME.green400} 10%, ${LIGHT_THEME.green500} 25%, transparent 35%`
      // ringBackground: `transparent 0%, ${LIGHT_THEME.yellow200} 10%, ${LIGHT_THEME.yellow300} 25%, transparent 35%`
    },
    passkeyHaloLoadingIconContainer: {
      backgroundColor: DARK_THEME.grey750,
    },
    passkeyHaloLoadingTouchIcon: {
      color: DARK_THEME.textSecondary,
      margin: '0.75rem',
      strokeWidth: '4',
    },

    hero: {
    },
    heroHeading: {
      color: LIGHT_THEME.grey100,
    },
    heroSubheading: {
      color: LIGHT_THEME.grey400,
    },
    heroContainer: {
      minHeight: '48px',
    },

    errorBanner: {
      color: DARK_THEME.red600,
      fontSize: '0.9rem',
    },

    // Mobile responsive
    containerMobile: {
      background: 'rgba(0, 0, 0, 0.5)'
    },
    headerMobile: {
      color: DARK_THEME.textPrimary
    },
    rowMobile: {
      color: DARK_THEME.textPrimary
    },
    actionRowMobile: {
      color: DARK_THEME.textPrimary
    },
    actionContentMobile: {
      color: DARK_THEME.textPrimary
    },
    buttonsMobile: {
      background: 'transparent'
    },
    btnMobile: {
      backgroundColor: DARK_THEME.surface,
      color: DARK_THEME.textPrimary
    },
    actionContentScrollbarTrack: {
      background: DARK_THEME.surface
    },
    actionContentScrollbarThumb: {
      background: DARK_THEME.textSecondary
    }
  },
  light: {
    // Spread base colors from shared palette
    ...LIGHT_THEME,

    // Base design system variables
    host: {
      fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
      fontSize: '1rem',
      color: LIGHT_THEME.textPrimary,
      backgroundColor: LIGHT_THEME.colorBackground
    },

    // Main modal container
    modalBackdropBlur: {
      background: 'oklch(0.2 0.01 240 / 0.8)', // grey800 with alpha 0.8
      // backdropFilter: 'blur(0px)',
      // animation: 'none',
      // willChange: 'none',
      animation: 'backdrop-opacity 32ms ease-in',
      willChange: 'opacity',
    },
    modalBackdrop: {
      padding: '0.5rem',
      background: LIGHT_THEME.grey25,
      border: 'none',
      color: LIGHT_THEME.textPrimary,
    },
    modalContainerRoot: {
      // background: DARK_THEME.grey100,
      // border: `1px solid ${LIGHT_THEME.borderPrimary}`,
      // boxShadow: '0 2px 4px 0px rgba(25, 25, 25, 0.2)',
      background: 'none',
      border: 'none',
      boxShadow: 'none',
      margin: '1rem 0 0 0',
    },
    responsiveCard: {
      padding: '0rem',
      margin: '0px',
      borderRadius: '2rem',
    },
    cardBackgroundBorder: {
      background: LIGHT_THEME.colorBackground,
      border: `1px solid ${LIGHT_THEME.borderPrimary}`,
    },

    rpidWrapper: {
    },
    padlockIcon: {
      color: DARK_THEME.blue500,
    },
    blockHeightIcon: {
      color: DARK_THEME.blue500,
    },
    domainText: {
      color: LIGHT_THEME.textSecondary,
    },
    securityDetails: {
      color: LIGHT_THEME.textSecondary,
    },

    header: {
      color: LIGHT_THEME.textPrimary
    },
    grid: {
      color: LIGHT_THEME.textPrimary
    },
    row: {
      color: LIGHT_THEME.textPrimary
    },
    label: {
      color: LIGHT_THEME.textSecondary
    },
    value: {
      color: LIGHT_THEME.textPrimary
    },
    summarySection: {
      color: LIGHT_THEME.textPrimary
    },
    actionsTitle: {
      color: LIGHT_THEME.textSecondary
    },
    actionItem: {
      background: LIGHT_THEME.colorBackground
    },
    actionRow: {
      color: LIGHT_THEME.textPrimary
    },
    actionLabel: {
      padding: '2px 0px',
      color: LIGHT_THEME.textSecondary
    },
    actionContent: {
      padding: '0.5rem',
      color: LIGHT_THEME.textPrimary,
      background: LIGHT_THEME.grey100,
      maxHeight: '50vh',
    },
    actionValue: {
      color: LIGHT_THEME.textPrimary
    },
    actionSubitem: {
    },
    actionSubheader: {
      color: LIGHT_THEME.highlightReceiverId
    },
    codeBlock: {
      fontSize: '0.75rem',
      margin: '4px 0px 0px 0px',
      background: LIGHT_THEME.slate150,
      color: LIGHT_THEME.textSecondary
    },
    methodName: {
      color: LIGHT_THEME.highlightMethodName
    },
    buttons: {
      background: 'transparent'
    },
    btn: {
      backgroundColor: LIGHT_THEME.colorBackground,
      color: LIGHT_THEME.textPrimary,
      focusOutlineColor: LIGHT_THEME.primary,
    },
    btnHover: {
      boxShadow: 'none'
    },
    btnConfirm: {
      padding: '0.5rem',
      bakgroundColor: LIGHT_THEME.blue600,
      color: LIGHT_THEME.colorBackground,
      border: `1px solid ${LIGHT_THEME.blue400}`,
    },
    btnConfirmHover: {
      backgroundColor: DARK_THEME.blue500
    },
    btnCancel: {
      color: LIGHT_THEME.textPrimary,
      backgroundColor: LIGHT_THEME.colorBackground,
      borderColor: LIGHT_THEME.borderPrimary,
      border: `1px solid ${LIGHT_THEME.borderPrimary}`,
    },
    btnCancelHover: {
      backgroundColor: LIGHT_THEME.grey100,
    },
    btnDanger: {
      backgroundColor: LIGHT_THEME.red600,
      border: `1px solid ${LIGHT_THEME.red500}`,
    },
    btnDangerHover: {
      backgroundColor: LIGHT_THEME.red500,
    },
    loadingIndicator: {
      borderColor: LIGHT_THEME.borderPrimary,
      borderTopColor: LIGHT_THEME.primary
    },

    // PasskeyHaloLoading CSS variables
    passkeyHaloLoading: {
      innerBackground: LIGHT_THEME.grey150,
      innerPadding: '6px',
      ringBackground: `transparent 0%, ${LIGHT_THEME.blue300} 10%, ${LIGHT_THEME.blue400} 25%, transparent 35%`
    },
    passkeyHaloLoadingIconContainer: {
      backgroundColor: LIGHT_THEME.colorBackground,
    },
    passkeyHaloLoadingTouchIcon: {
      color: LIGHT_THEME.textMuted,
      margin: '0.75rem',
      strokeWidth: '4',
    },

    hero: {
    },
    heroHeading: {
      color: LIGHT_THEME.grey100,
    },
    heroSubheading: {
      color: LIGHT_THEME.grey400,
    },
    heroContainer: {
      minHeight: '48px',
    },

    errorBanner: {
      color: LIGHT_THEME.red500,
      fontSize: '0.9rem',
    },

    // Mobile responsive
    containerMobile: {
      background: 'rgba(0, 0, 0, 0.5)'
    },
    headerMobile: {
      color: LIGHT_THEME.textPrimary
    },
    rowMobile: {
      color: LIGHT_THEME.textPrimary
    },
    actionRowMobile: {
      color: LIGHT_THEME.textPrimary
    },
    actionContentMobile: {
      color: LIGHT_THEME.textPrimary
    },
    buttonsMobile: {
      background: 'transparent'
    },
    btnMobile: {
      backgroundColor: LIGHT_THEME.colorBackground,
      color: LIGHT_THEME.textPrimary
    },
    actionContentScrollbarTrack: {
      background: LIGHT_THEME.surface
    },
    actionContentScrollbarThumb: {
      background: LIGHT_THEME.borderPrimary
    }
  }
};
