import { test, expect } from '@playwright/test';
import { parseAndValidateRegistrationCredentialConfirmationPayload } from '../../core/WebAuthnManager/SignerWorkerManager/handlers/validation';

const validSerializedRegistrationCredential = {
  id: 'credential-id',
  rawId: 'credential-raw-id-b64u',
  type: 'public-key',
  response: {
    clientDataJSON: 'Y2xpZW50LWRhdGE',
    attestationObject: 'YXR0ZXN0YXRpb24tb2JqZWN0',
    transports: [],
  },
};

const validVrfChallenge = {
  vrfInput: 'vrf-input',
  vrfOutput: 'vrf-output',
  vrfProof: 'vrf-proof',
  vrfPublicKey: 'vrf-public-key',
  userId: 'user.near',
  rpId: 'example.com',
  blockHeight: '123456',
  blockHash: 'block-hash',
};

test.describe('registration credential confirmation validation', () => {
  test('does not require credential fields when confirmation is rejected', async () => {
    const parsed = parseAndValidateRegistrationCredentialConfirmationPayload({
      confirmed: false,
      requestId: 'req-1',
      intentDigest: 'register:user.near:1',
      error: 'NotAllowedError: user cancelled',
    });

    expect(parsed.confirmed).toBe(false);
    expect(parsed.error).toContain('NotAllowedError');
  });

  test('still requires credential when confirmation succeeds', async () => {
    expect(() => parseAndValidateRegistrationCredentialConfirmationPayload({
      confirmed: true,
      requestId: 'req-2',
      intentDigest: 'register:user.near:1',
      vrfChallenge: validVrfChallenge,
    })).toThrow('Missing registration credential');
  });

  test('accepts complete success payload', async () => {
    const parsed = parseAndValidateRegistrationCredentialConfirmationPayload({
      confirmed: true,
      requestId: 'req-3',
      intentDigest: 'register:user.near:1',
      credential: validSerializedRegistrationCredential,
      vrfChallenge: validVrfChallenge,
    });

    expect(parsed.confirmed).toBe(true);
    if (!parsed.confirmed) {
      throw new Error('Expected confirmed registration payload');
    }
    expect(parsed.credential.id).toBe('credential-id');
    expect(parsed.vrfChallenge.vrfPublicKey).toBe('vrf-public-key');
  });
});
