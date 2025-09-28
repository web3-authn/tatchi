import React, { useCallback } from 'react';
import { createComponent } from '@lit/react';
import ArrowRegisterButtonElement, {
  type ArrowRegisterButtonMode,
} from '@/core/WebAuthnManager/LitComponents/ArrowRegisterButton';

export interface ArrowButtonLitProps {
  disabled?: boolean;
  waiting?: boolean;
  mode?: ArrowRegisterButtonMode;
  width?: number | string;
  height?: number | string;
  label?: string;
  autoFocus?: boolean;
  className?: string;
  style?: React.CSSProperties;
  onClick?: () => void;
  onSubmit?: () => void;
}

type ReactWebComponent<P> = React.ForwardRefExoticComponent<
  React.PropsWithChildren<P & React.HTMLAttributes<HTMLElement>>
>;

const RawArrowButton = createComponent({
  react: React,
  tagName: 'w3a-arrow-register-button',
  elementClass: ArrowRegisterButtonElement,
  displayName: 'ArrowRegisterButton',
  events: {
    onArrowSubmit: 'arrow-submit',
  },
}) as ReactWebComponent<
  Omit<ArrowButtonLitProps, 'onClick' | 'onSubmit'> & {
    onArrowSubmit?: (event: CustomEvent<{ mode: ArrowRegisterButtonMode }>) => void;
  }
>;

export const ArrowButtonOverlayLit: React.FC<ArrowButtonLitProps> = (props) => {
  const { onClick, onSubmit, waiting, ...rest } = props;

  const handleArrowSubmit = useCallback(() => {
    try { onSubmit?.(); } catch {}
    try { onClick?.(); } catch {}
  }, [onClick, onSubmit]);

  // Hide entirely while parent shows waiting/loading UI
  if (waiting) return null;

  return (
    <RawArrowButton
      {...rest}
      waiting={false}
      onArrowSubmit={(onClick || onSubmit) ? (handleArrowSubmit as any) : undefined}
    />
  );
};

ArrowButtonOverlayLit.displayName = 'ArrowButtonOverlayLit';

export default ArrowButtonOverlayLit;
