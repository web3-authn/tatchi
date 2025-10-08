import React, { useState, useEffect, useMemo, isValidElement, cloneElement } from 'react';
import { createComponent } from '@lit/react';
import PasskeyHaloLoadingElement from '../../core/WebAuthnManager/LitComponents/PasskeyHaloLoading';

export interface LitPasskeyHaloLoadingProps {
  // Pass-through to HaloBorder
  animated?: boolean;
  theme?: 'dark' | 'light';
  ringGap?: number;
  ringWidth?: number;
  ringBorderRadius?: string;
  ringBorderShadow?: string;
  ringBackground?: string;
  padding?: string;
  innerPadding?: string;
  innerBackground?: string;
  // Local visual props
  height?: number;
  width?: number;
  className?: string;
  style?: React.CSSProperties;
}

type ReactWebComponent<P> = React.ForwardRefExoticComponent<
  React.PropsWithChildren<P & React.HTMLAttributes<HTMLElement>>
>;

export const LitPasskeyHaloLoading = createComponent({
  react: React,
  tagName: 'w3a-passkey-halo-loading',
  elementClass: PasskeyHaloLoadingElement,
  displayName: 'LitPasskeyHaloLoading',
}) as ReactWebComponent<LitPasskeyHaloLoadingProps>;

export default LitPasskeyHaloLoading;
