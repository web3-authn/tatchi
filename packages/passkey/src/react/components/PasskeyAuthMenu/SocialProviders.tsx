import React from 'react';
import { Chrome, Github, Apple, Gamepad2 } from 'lucide-react';

export type SocialProviderName = 'google' | 'github' | 'apple' | 'discord';

export interface SocialProvidersProps {
  providers?: SocialProviderName[];
}

const iconByProvider: Record<SocialProviderName, { Icon: React.ComponentType<any>; label: string }> = {
  google: { Icon: Chrome, label: 'Google' },
  discord: { Icon: Gamepad2, label: 'Discord' },
  github: { Icon: Github, label: 'GitHub' },
  apple: { Icon: Apple, label: 'Apple' },
};

export const SocialProviders: React.FC<SocialProvidersProps> = ({ providers = ['google', 'discord', 'github', 'apple'] }) => {
  if (!providers || providers.length === 0) return null;
  return (
    <div className="w3a-social-row">
      {providers.map((name) => {
        const { Icon, label } = iconByProvider[name];
        return (
          <button key={name} className="w3a-social-btn" title={label}>
            <Icon size={22} style={{ display: 'block' }} />
          </button>
        );
      })}
    </div>
  );
};

export default SocialProviders;
