import { test, expect } from '@playwright/test';
import { assertWalletHostConfigsNoNestedIframeWallet, sanitizeWalletHostConfigs } from '../../core/WalletIframe/host/config-guards';

test.describe('WalletIframe host config guardrails', () => {
  test('sanitizeWalletHostConfigs clears nested iframeWallet fields', async () => {
    const warnings: unknown[] = [];
    const prevWarn = console.warn;
    console.warn = (...args: unknown[]) => { warnings.push(args); };
    try {
      const sanitized = sanitizeWalletHostConfigs({
        relayer: { url: 'https://relay.example' },
        iframeWallet: {
          walletOrigin: 'https://wallet.example.localhost',
          walletServicePath: '/wallet-service',
          sdkBasePath: '/sdk',
          rpIdOverride: 'example.localhost',
        },
      });

      expect(sanitized.iframeWallet?.walletOrigin).toBe('');
      expect(sanitized.iframeWallet?.walletServicePath).toBe('');
      expect(sanitized.iframeWallet?.sdkBasePath).toBe('/sdk');
      expect(sanitized.iframeWallet?.rpIdOverride).toBe('example.localhost');
      expect(warnings.length).toBeGreaterThan(0);
    } finally {
      console.warn = prevWarn;
    }
  });

  test('assertWalletHostConfigsNoNestedIframeWallet throws when walletOrigin is set', async () => {
    expect(() => assertWalletHostConfigsNoNestedIframeWallet({
      relayer: { url: 'https://relay.example' },
      iframeWallet: { walletOrigin: 'https://wallet.example.localhost' },
    })).toThrow(/walletOrigin/);
  });
});

