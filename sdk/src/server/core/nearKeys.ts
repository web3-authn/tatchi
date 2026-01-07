import bs58 from 'bs58';

import { stripEd25519Prefix, toPublicKeyString } from '../../core/nearCrypto';

export function toPublicKeyStringFromSecretKey(secretKey: string): string {
  const bytes = bs58.decode(stripEd25519Prefix(secretKey));
  if (bytes.length !== 64) {
    throw new Error(`Invalid NEAR secret key length: ${bytes.length}`);
  }
  return toPublicKeyString(bytes.subarray(32, 64));
}
