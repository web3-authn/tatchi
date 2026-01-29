import { test, expect } from '@playwright/test';
import {
  ensureTrailingSlash,
  getNodeEnv,
  isDevHost,
  normalizeOrigin,
} from '../../core/WalletIframe/shared/runtime';
import { mergeWalletHostConfig } from '../../core/WalletIframe/host/context';

test.describe('wallet iframe runtime helpers', () => {
  test('getNodeEnv reads process.env.NODE_ENV', async () => {
    const prev = process.env.NODE_ENV;
    process.env.NODE_ENV = 'runtime-test';
    try {
      expect(getNodeEnv()).toBe('runtime-test');
    } finally {
      if (prev === undefined) {
        delete process.env.NODE_ENV;
      } else {
        process.env.NODE_ENV = prev;
      }
    }
  });

  test('isDevHost respects non-production NODE_ENV override', async () => {
    expect(isDevHost('example.com', 'development')).toBe(true);
    expect(isDevHost('example.com', 'test')).toBe(true);
  });

  test('isDevHost matches localhost and .local patterns', async () => {
    expect(isDevHost('localhost', 'production')).toBe(true);
    expect(isDevHost('foo.localhost', 'production')).toBe(true);
    expect(isDevHost('bar.local', 'production')).toBe(true);
    expect(isDevHost('127.0.0.1', 'production')).toBe(true);
    expect(isDevHost('example.com', 'production')).toBe(false);
  });

  test('normalizeOrigin resolves with a base and rejects invalid', async () => {
    expect(normalizeOrigin('https://wallet.example.com/path?x=1')).toBe('https://wallet.example.com');
    expect(normalizeOrigin('/wallet-service', 'https://wallet.example.com')).toBe('https://wallet.example.com');
    expect(normalizeOrigin('http://[invalid')).toBeNull();
  });

  test('ensureTrailingSlash appends only when missing', async () => {
    expect(ensureTrailingSlash('https://wallet.example.com/sdk')).toBe('https://wallet.example.com/sdk/');
    expect(ensureTrailingSlash('https://wallet.example.com/sdk/')).toBe('https://wallet.example.com/sdk/');
  });
});

test.describe('mergeWalletHostConfig', () => {
  const location = {
    origin: 'https://wallet.example.com',
    href: 'https://wallet.example.com/wallet-service',
  };

  test('uses default /sdk/ base when assetsBaseUrl is missing', async () => {
    const result = mergeWalletHostConfig(null, { nearRpcUrl: 'https://rpc.example.com' }, location);
    expect(result.embeddedAssetsBase).toBe('https://wallet.example.com/sdk/');
    expect(result.configs.nearNetwork).toBe('testnet');
  });

  test('accepts same-origin assetsBaseUrl and appends trailing slash', async () => {
    const result = mergeWalletHostConfig(null, { assetsBaseUrl: '/static' }, location);
    expect(result.embeddedAssetsBase).toBe('https://wallet.example.com/static/');
  });

  test('ignores cross-origin assetsBaseUrl', async () => {
    const result = mergeWalletHostConfig(null, { assetsBaseUrl: 'https://evil.example.com/assets' }, location);
    expect(result.embeddedAssetsBase).toBe('https://wallet.example.com/sdk/');
  });

  test('merges rpIdOverride and uiRegistry', async () => {
    const prev = { iframeWallet: { rpIdOverride: 'prev' } };
    const payload = {
      rpIdOverride: 'next',
      uiRegistry: {
        demo: { tag: 'x-demo' },
      },
    };
    const result = mergeWalletHostConfig(prev, payload, location);
    expect(result.configs.iframeWallet?.rpIdOverride).toBe('next');
    expect(result.uiRegistry).toEqual({ demo: { tag: 'x-demo' } });
  });
});
