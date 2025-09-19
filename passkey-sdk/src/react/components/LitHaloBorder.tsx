import React, { useState, useEffect, useMemo, isValidElement, cloneElement } from 'react';
import { createComponent } from '@lit/react';
import HaloBorderElement from '../../core/WebAuthnManager/LitComponents/HaloBorder';

export interface LitHaloBorderProps {
  animated?: boolean;
  theme?: 'dark' | 'light';
  ringGap?: number;
  ringWidth?: number;
  ringBorderRadius?: string;
  ringBorderShadow?: string;
  ringBackground?: string; // stops portion of the conic-gradient
  padding?: string;
  innerPadding?: string;
  innerBackground?: string;
  className?: string;
  style?: React.CSSProperties;
  children?: React.ReactNode;
}

type ReactWebComponent<P> = React.ForwardRefExoticComponent<
  React.PropsWithChildren<P & React.HTMLAttributes<HTMLElement>>
>;

export const LitHaloBorder = createComponent({
  react: React,
  tagName: 'w3a-halo-border',
  elementClass: HaloBorderElement,
  displayName: 'LitHaloBorder',
}) as ReactWebComponent<LitHaloBorderProps>;

export default LitHaloBorder;
