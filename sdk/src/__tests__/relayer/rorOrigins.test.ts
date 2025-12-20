import { test, expect } from '@playwright/test';
import { AuthService } from '../../server/core/AuthService';

function makeAuthServiceForRor(): AuthService {
  return new AuthService({
    relayerAccountId: 'relayer.testnet',
    relayerPrivateKey: 'ed25519:dummy',
    webAuthnContractId: 'w3a-v1.testnet',
    nearRpcUrl: 'https://rpc.testnet.near.org',
    networkId: 'testnet',
    accountInitialBalance: '1',
    createAccountAndRegisterGas: '1',
  });
}

test.describe('AuthService.getRorOrigins()', () => {
  test('accepts string[] and sanitizes origins', async () => {
    const svc = makeAuthServiceForRor();
    (svc as any).nearClient = {
      view: async () => ([
        'https://EXAMPLE.com',
        'https://example.com/', // dup
        'https://example.com/path', // path rejected
        'http://localhost:3000',
        'http://evil.com',
      ]),
    };

    const out = await svc.getRorOrigins();
    expect(out).toEqual(['https://example.com', 'http://localhost:3000']);
  });

  test('accepts { origins: string[] } shape', async () => {
    const svc = makeAuthServiceForRor();
    (svc as any).nearClient = {
      view: async () => ({ origins: ['https://a.com', 'https://A.com'] }),
    };
    const out = await svc.getRorOrigins();
    expect(out).toEqual(['https://a.com']);
  });

  test('returns [] on RPC error', async () => {
    const svc = makeAuthServiceForRor();
    (svc as any).nearClient = {
      view: async () => { throw new Error('rpc down'); },
    };
    const out = await svc.getRorOrigins();
    expect(out).toEqual([]);
  });
});

