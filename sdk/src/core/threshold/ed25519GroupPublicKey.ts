import { base64UrlDecode } from '../../utils/encoders';
import bs58 from 'bs58';
import { ed25519 } from '@noble/curves/ed25519.js';

export function normalizeEd25519PublicKey(input: string): string {
  const key = input;
  if (!key) return '';
  return key.startsWith('ed25519:') ? key : `ed25519:${key}`;
}

/**
 * Deterministically compute the 2-of-2 threshold group public key from verifying shares.
 *
 * For participant identifiers {1,2}, Lagrange coefficients at x=0 are:
 *   λ1 = 2, λ2 = -1
 *
 * groupPk = (2 * pk1) - pk2
 */
export function computeThresholdEd25519GroupPublicKeyFromVerifyingShares(input: {
  clientVerifyingShareB64u: string;
  relayerVerifyingShareB64u: string;
}): string {
  const clientBytes = base64UrlDecode(input.clientVerifyingShareB64u);
  const relayerBytes = base64UrlDecode(input.relayerVerifyingShareB64u);
  if (clientBytes.length !== 32) {
    throw new Error(`Invalid clientVerifyingShareB64u (expected 32 bytes, got ${clientBytes.length})`);
  }
  if (relayerBytes.length !== 32) {
    throw new Error(`Invalid relayerVerifyingShareB64u (expected 32 bytes, got ${relayerBytes.length})`);
  }

  const clientPoint = ed25519.Point.fromBytes(clientBytes);
  const relayerPoint = ed25519.Point.fromBytes(relayerBytes);
  const groupPoint = clientPoint.multiply(2n).subtract(relayerPoint);
  const pkBytes = groupPoint.toBytes();
  return normalizeEd25519PublicKey(bs58.encode(pkBytes));
}
