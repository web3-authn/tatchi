import React from 'react';
import { ChromeIcon, AppleIcon, AtSignIcon } from './icons';

export type SocialLoginHandlers = {
  google?: () => string;
  x?: () => string;
  apple?: () => string;
};

export interface SocialProvidersProps {
  socialLogin?: SocialLoginHandlers;
}

const iconByKey: Record<
  keyof SocialLoginHandlers,
  { Icon: React.ComponentType<any>; label: string }
> = {
  google: { Icon: ChromeIcon, label: 'Google' },
  x: { Icon: AtSignIcon, label: 'X' },
  apple: { Icon: AppleIcon, label: 'Apple' },
};

/*
 * Not implemented
 */
export const SocialProviders: React.FC<SocialProvidersProps> = ({ socialLogin }) => {
  return null;
  // const entries = Object.entries(socialLogin || {}) as [
  //   keyof SocialLoginHandlers,
  //   (() => string) | undefined,
  // ][];
  // const enabled = entries.filter(([, fn]) => typeof fn === 'function');
  // if (!enabled.length) return null;
  // return (
  //   <div>
  //     <div className="w3a-social-row">
  //       {enabled.map(([key, fn]) => {
  //         const { Icon, label } = iconByKey[key];
  //         return (
  //           <button
  //             key={key}
  //             className="w3a-social-btn"
  //             title={label}
  //             onClick={() => {
  //               try {
  //                 const result = fn?.();
  //                 if (result) {
  //                   // Placeholder: later this can feed into register/login flows
  //                   // eslint-disable-next-line no-console
  //                   console.log(`[socialLogin:${String(key)}]`, result);
  //                 }
  //               } catch (e) {
  //                 // eslint-disable-next-line no-console
  //                 console.error(`[socialLogin:${String(key)}] error`, e);
  //               }
  //             }}
  //           >
  //             <Icon size={22} style={{ display: 'block' }} />
  //           </button>
  //         );
  //       })}
  //     </div>
  //     <div
  //       className="w3a-social-disclaimer"
  //       aria-live="polite"
  //       style={{
  //         marginTop: 8,
  //         fontSize: 12,
  //         lineHeight: 1.4,
  //         opacity: 0.8,
  //         textAlign: 'center',
  //       }}
  //     >
  //       Social login is not implemented
  //     </div>
  //   </div>
  // );
};

export default SocialProviders;
