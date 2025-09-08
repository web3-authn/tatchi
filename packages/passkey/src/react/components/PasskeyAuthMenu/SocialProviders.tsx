import React from 'react';
import { Chrome, Apple, AtSign } from 'lucide-react';

export type SocialLoginHandlers = {
  google?: () => string;
  x?: () => string;
  apple?: () => string;
};

export interface SocialProvidersProps {
  socialLogin?: SocialLoginHandlers;
}

const iconByKey: Record<keyof SocialLoginHandlers, { Icon: React.ComponentType<any>; label: string }> = {
  google: { Icon: Chrome, label: 'Google' },
  x: { Icon: AtSign, label: 'X' },
  apple: { Icon: Apple, label: 'Apple' },
};

export const SocialProviders: React.FC<SocialProvidersProps> = ({ socialLogin }) => {
  const entries = Object.entries(socialLogin || {}) as [keyof SocialLoginHandlers, (() => string) | undefined][];
  const enabled = entries.filter(([, fn]) => typeof fn === 'function');
  if (!enabled.length) return null;

  return (
    <div className="w3a-social-row">
      {enabled.map(([key, fn]) => {
        const { Icon, label } = iconByKey[key];
        return (
          <button
            key={key}
            className="w3a-social-btn"
            title={label}
            onClick={() => {
              try {
                const result = fn?.();
                if (result) {
                  // Placeholder: later this can feed into register/login flows
                  // For now, surface in console for developers
                  // eslint-disable-next-line no-console
                  console.log(`[socialLogin:${String(key)}]`, result);
                }
              } catch (e) {
                // eslint-disable-next-line no-console
                console.error(`[socialLogin:${String(key)}] error`, e);
              }
            }}
          >
            <Icon size={22} style={{ display: 'block' }} />
          </button>
        );
      })}
    </div>
  );
};

export default SocialProviders;
