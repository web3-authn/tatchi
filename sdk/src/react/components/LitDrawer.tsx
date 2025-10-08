import React from 'react';
import { createComponent } from '@lit/react';
import DrawerElement from '../../core/WebAuthnManager/LitComponents/Drawer';

export interface LitDrawerProps {
  open?: boolean;
  theme?: 'dark' | 'light';
  title?: string;
  subtitle?: string;
  accountId?: string;
  confirmText?: string;
  cancelText?: string;
  loading?: boolean;
  errorMessage?: string;
  dragToClose?: boolean;
  className?: string;
  style?: React.CSSProperties;
  onCancel?: () => void;
  onConfirm?: () => void;
}

type ReactWebComponent<P> = React.ForwardRefExoticComponent<
  React.PropsWithChildren<P & React.HTMLAttributes<HTMLElement>>
>;

export const LitDrawer = createComponent({
  react: React,
  tagName: 'w3a-drawer',
  elementClass: DrawerElement,
  displayName: 'LitDrawer',
  events: {
    onCancel: 'cancel',
    onConfirm: 'confirm',
  },
}) as ReactWebComponent<LitDrawerProps>;

export default LitDrawer;
