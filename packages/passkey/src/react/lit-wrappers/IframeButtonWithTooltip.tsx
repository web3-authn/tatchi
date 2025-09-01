import React from 'react';
import { createComponent } from '@lit/react';
import { IframeButtonHost } from '@/core/WebAuthnManager/LitComponents/IframeButtonWithTooltipConfirmer';

// Base React component generated from the Lit element
const RawIframeButton = createComponent({
  react: React,
  tagName: 'iframe-button',
  elementClass: IframeButtonHost,
  events: {}
});

type RawProps = React.ComponentProps<typeof RawIframeButton>;

export type IframeButtonProps = Omit<RawProps, 'buttonStyle' | 'buttonHoverStyle'> & {
  buttonStyle?: React.CSSProperties;
  buttonHoverStyle?: React.CSSProperties;
};

export const toStyleRecord = (style?: React.CSSProperties): Record<string, string | number> | undefined => {
  if (!style) return undefined;
  const out: Record<string, string | number> = {};
  Object.keys(style).forEach((k) => {
    const v = (style as any)[k];
    if (v !== undefined && v !== null) out[k] = v as any;
  });
  return out;
};

export const IframeButtonWithTooltip = React.forwardRef<any, IframeButtonProps>(function IframeButton(
  { buttonStyle, buttonHoverStyle, ...rest },
  ref
) {
  return (
    <RawIframeButton
      ref={ref}
      {...(rest as RawProps)}
      buttonStyle={toStyleRecord(buttonStyle)}
      buttonHoverStyle={toStyleRecord(buttonHoverStyle)}
    />
  );
});

export default IframeButtonWithTooltip;
