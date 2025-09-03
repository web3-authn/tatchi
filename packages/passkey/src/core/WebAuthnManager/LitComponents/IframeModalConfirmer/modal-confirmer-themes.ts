
import type { ComponentStyles } from '../LitElementWithProps';
import { DARK_THEME_COLORS, LIGHT_THEME_COLORS } from '@/base-styles';

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
  actionsSection?: Record<string, string>;
  actionOuter?: Record<string, string>;
  actionList?: Record<string, string>;
  gradientBorder?: Record<string, string>;
  actionsTitle?: Record<string, string>;
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
    ...DARK_THEME_COLORS,

    // Base design system variables
    host: {
      fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
      fontSize: '1rem',
      color: DARK_THEME_COLORS.colorText,
      backgroundColor: DARK_THEME_COLORS.colorBackground
    },

    // Modal border containers (matching tooltip tree structure)
    modalBorderOuter: {
      background: 'transparent',
      border: `1px solid transparent`,
      borderRadius: '28px',
      padding: '0.5rem',
    },

    // Main modal container - the glass-like container around the content
    modalBorderInner: {
      background: DARK_THEME_COLORS.grey600,
      borderRadius: '24px',
      border: `1px solid ${DARK_THEME_COLORS.grey600}`,
      boxShadow: '0 2px 4px 0px rgba(25, 25, 25, 0.2)'
    },

    // Component-specific modal variables
    modalContainer: {
      padding: '0.5rem',
      background: DARK_THEME_COLORS.grey700,
      border: 'none',
      color: DARK_THEME_COLORS.colorText,
    },

    modalBackdrop: {
      background: 'rgba(0, 0, 0, 0.5)'
    },
    header: {
      color: DARK_THEME_COLORS.colorText
    },
    grid: {
      color: DARK_THEME_COLORS.colorText
    },
    row: {
      color: DARK_THEME_COLORS.colorText
    },
    label: {
      color: DARK_THEME_COLORS.colorTextSecondary
    },
    value: {
      color: DARK_THEME_COLORS.colorText
    },
    summarySection: {
      color: DARK_THEME_COLORS.colorText
    },
    actionsSection: {
      color: DARK_THEME_COLORS.colorText
    },
    actionList: {
      borderRadius: '8px',
      padding: '1rem',
      background: DARK_THEME_COLORS.grey750
    },
    gradientBorder: {
      background: `linear-gradient(${DARK_THEME_COLORS.colorSurface}, ${DARK_THEME_COLORS.colorSurface}) padding-box, conic-gradient(from var(--border-angle), rgba(0, 0, 0, 0.0) 0%, rgba(0, 0, 0, 0.35) 10%, rgba(0, 0, 0, 0.0) 20%, rgba(0, 0, 0, 0.0) 100%) border-box`
    },
    actionsTitle: {
      color: DARK_THEME_COLORS.colorTextSecondary
    },
    actionItem: {
      background: DARK_THEME_COLORS.colorSurface
    },
    actionRow: {
      color: DARK_THEME_COLORS.colorText
    },
    actionLabel: {
      padding: '2px 0px',
      color: DARK_THEME_COLORS.colorTextSecondary
    },
    actionContent: {
      padding: '0.5rem 0rem',
      color: DARK_THEME_COLORS.colorText
    },
    actionValue: {
      color: DARK_THEME_COLORS.colorText
    },
    actionSubitem: {
    },
    actionSubheader: {
      color: DARK_THEME_COLORS.highlightReceiverId
    },
    codeBlock: {
      fontSize: '0.75rem',
      margin: '4px 0px 4px 0px',
      background: DARK_THEME_COLORS.grey650,
      color: DARK_THEME_COLORS.grey350
    },
    methodName: {
      color: DARK_THEME_COLORS.highlightMethodName
    },
    buttons: {
      background: 'transparent'
    },
    btn: {
      backgroundColor: DARK_THEME_COLORS.colorSurface,
      color: DARK_THEME_COLORS.colorText,
      borderColor: 'transparent',
      focusOutlineColor: DARK_THEME_COLORS.colorPrimary,
    },
    btnConfirm: {
      padding: '0.5rem',
      backgroundColor: DARK_THEME_COLORS.blue600,
      color: DARK_THEME_COLORS.colorText,
      borderColor: DARK_THEME_COLORS.blue600,
    },
    btnConfirmHover: {
      backgroundColor: DARK_THEME_COLORS.blue500
    },
    btnCancel: {
      backgroundColor: 'transparent',
      color: DARK_THEME_COLORS.colorText,
      borderColor: 'transparent',
    },
    btnCancelHover: {
      backgroundColor: DARK_THEME_COLORS.grey700,
    },
    btnDanger: {
      backgroundColor: LIGHT_THEME_COLORS.red600,
    },
    btnDangerHover: {
      backgroundColor: LIGHT_THEME_COLORS.red500,
    },
    loadingIndicator: {
      borderColor: DARK_THEME_COLORS.colorBorder,
      borderTopColor: DARK_THEME_COLORS.colorPrimary
    },

    // Mobile responsive
    containerMobile: {
      background: 'rgba(0, 0, 0, 0.5)'
    },
    headerMobile: {
      color: DARK_THEME_COLORS.colorText
    },
    rowMobile: {
      color: DARK_THEME_COLORS.colorText
    },
    actionRowMobile: {
      color: DARK_THEME_COLORS.colorText
    },
    actionContentMobile: {
      color: DARK_THEME_COLORS.colorText
    },
    buttonsMobile: {
      background: 'transparent'
    },
    btnMobile: {
      backgroundColor: DARK_THEME_COLORS.colorSurface,
      color: DARK_THEME_COLORS.colorText
    },
    actionContentScrollbarTrack: {
      background: DARK_THEME_COLORS.colorSurface
    },
    actionContentScrollbarThumb: {
      background: DARK_THEME_COLORS.colorTextSecondary
    }
  },
  light: {
    // Spread base colors from shared palette
    ...LIGHT_THEME_COLORS,

    // Base design system variables
    host: {
      fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
      fontSize: '1rem',
      color: LIGHT_THEME_COLORS.colorText,
      backgroundColor: LIGHT_THEME_COLORS.colorBackground
    },

    // Modal border containers (matching tooltip tree structure)
    modalBorderOuter: {
      background: 'transparent',
      border: `1px solid transparent`,
      borderRadius: '28px',
      padding: '0.5rem',
    },

    // Main modal container - the glass-like container around the content
    modalBorderInner: {
      background: LIGHT_THEME_COLORS.grey100,
      borderRadius: '24px',
      border: `1px solid ${LIGHT_THEME_COLORS.slate200}`,
      boxShadow: '0 2px 4px 0px rgba(25, 25, 25, 0.2)'
    },

    // Component-specific modal variables
    modalContainer: {
      padding: '0.5rem',
      background: LIGHT_THEME_COLORS.grey25,
      border: 'none',
      color: LIGHT_THEME_COLORS.colorText,
    },
    modalBackdrop: {
      background: 'rgba(0, 0, 0, 0.5)'
    },
    header: {
      color: LIGHT_THEME_COLORS.colorText
    },
    grid: {
      color: LIGHT_THEME_COLORS.colorText
    },
    row: {
      color: LIGHT_THEME_COLORS.colorText
    },
    label: {
      color: LIGHT_THEME_COLORS.colorTextSecondary
    },
    value: {
      color: LIGHT_THEME_COLORS.colorText
    },
    summarySection: {
      color: LIGHT_THEME_COLORS.colorText
    },
    actionsSection: {
      color: LIGHT_THEME_COLORS.colorText
    },
    actionList: {
      borderRadius: '8px',
      padding: '1rem',
      background: LIGHT_THEME_COLORS.grey50
    },
    gradientBorder: {
      background: `linear-gradient(${LIGHT_THEME_COLORS.colorBackground}, ${LIGHT_THEME_COLORS.colorBackground}) padding-box, conic-gradient(from var(--border-angle), rgba(0, 0, 0, 0.0) 0%, rgba(0, 0, 0, 0.35) 10%, rgba(0, 0, 0, 0.0) 20%, rgba(0, 0, 0, 0.0) 100%) border-box`
    },
    actionsTitle: {
      color: LIGHT_THEME_COLORS.colorTextSecondary
    },
    actionItem: {
      background: LIGHT_THEME_COLORS.colorBackground
    },
    actionRow: {
      color: LIGHT_THEME_COLORS.colorText
    },
    actionLabel: {
      padding: '2px 0px',
      color: LIGHT_THEME_COLORS.colorTextSecondary
    },
    actionContent: {
      padding: '0.5rem 0rem',
      color: LIGHT_THEME_COLORS.colorText
    },
    actionValue: {
      color: LIGHT_THEME_COLORS.colorText
    },
    actionSubitem: {
    },
    actionSubheader: {
      color: LIGHT_THEME_COLORS.highlightReceiverId
    },
    codeBlock: {
      fontSize: '0.75rem',
      margin: '4px 0px 4px 0px',
      background: LIGHT_THEME_COLORS.grey100,
      color: LIGHT_THEME_COLORS.colorTextSecondary
    },
    methodName: {
      color: LIGHT_THEME_COLORS.highlightMethodName
    },
    buttons: {
      background: 'transparent'
    },
    btn: {
      backgroundColor: LIGHT_THEME_COLORS.colorBackground,
      color: LIGHT_THEME_COLORS.colorText,
      borderColor: 'transparent',
      focusOutlineColor: LIGHT_THEME_COLORS.colorPrimary,
    },
    btnHover: {
      boxShadow: 'none'
    },
    btnConfirm: {
      padding: '0.5rem',
      bakgroundColor: LIGHT_THEME_COLORS.blue600,
      color: LIGHT_THEME_COLORS.colorBackground,
      borderColor: LIGHT_THEME_COLORS.blue600
    },
    btnConfirmHover: {
      backgroundColor: LIGHT_THEME_COLORS.blue500
    },
    btnCancel: {
      backgroundColor: 'transparent',
      color: LIGHT_THEME_COLORS.colorText,
      borderColor: 'transparent',
    },
    btnCancelHover: {
      backgroundColor: LIGHT_THEME_COLORS.grey100,
    },
    btnDanger: {
      backgroundColor: LIGHT_THEME_COLORS.red600,
    },
    btnDangerHover: {
      backgroundColor: LIGHT_THEME_COLORS.red500,
    },
    loadingIndicator: {
      borderColor: LIGHT_THEME_COLORS.colorBorder,
      borderTopColor: LIGHT_THEME_COLORS.colorPrimary
    },

    // Mobile responsive
    containerMobile: {
      background: 'rgba(0, 0, 0, 0.5)'
    },
    headerMobile: {
      color: LIGHT_THEME_COLORS.colorText
    },
    rowMobile: {
      color: LIGHT_THEME_COLORS.colorText
    },
    actionRowMobile: {
      color: LIGHT_THEME_COLORS.colorText
    },
    actionContentMobile: {
      color: LIGHT_THEME_COLORS.colorText
    },
    buttonsMobile: {
      background: 'transparent'
    },
    btnMobile: {
      backgroundColor: LIGHT_THEME_COLORS.colorBackground,
      color: LIGHT_THEME_COLORS.colorText
    },
    actionContentScrollbarTrack: {
      background: LIGHT_THEME_COLORS.colorSurface
    },
    actionContentScrollbarThumb: {
      background: LIGHT_THEME_COLORS.colorBorder
    }
  }
};
