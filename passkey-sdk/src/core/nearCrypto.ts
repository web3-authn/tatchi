import * as ed25519 from '@noble/ed25519';
import bs58 from 'bs58';

// NEAR key prefix
const NEAR_KEY_PREFIX = 'ed25519:';

function ensurePrefix(str: string): string {
  return str.startsWith(NEAR_KEY_PREFIX) ? str : `${NEAR_KEY_PREFIX}${str}`;
}

function stripPrefix(str: string): string {
  return str.startsWith(NEAR_KEY_PREFIX) ? str.slice(NEAR_KEY_PREFIX.length) : str;
}

/**
 * Creates a NEAR-compatible Ed25519 keypair formatted as strings:
 * - publicKey:  'ed25519:' + base58(pub)
 * - privateKey: 'ed25519:' + base58(seed(32) | pub(32))
 */
export async function createNearKeypair(): Promise<{ publicKey: string; privateKey: string }> {
  const seed = ed25519.utils.randomPrivateKey(); // 32 bytes
  const pub = await ed25519.getPublicKeyAsync(seed); // 32 bytes

  const secret = new Uint8Array(64);
  secret.set(seed, 0);
  secret.set(pub, 32);

  const publicKey = ensurePrefix(bs58.encode(pub));
  const privateKey = ensurePrefix(bs58.encode(secret));
  return { publicKey, privateKey };
}

/** Parse NEAR public key string ('ed25519:...') into 32-byte Uint8Array */
export function parseNearPublicKey(str: string): Uint8Array {
  const b58 = stripPrefix(str);
  const bytes = bs58.decode(b58);
  if (bytes.length !== 32) {
    throw new Error(`Invalid NEAR public key length: ${bytes.length}`);
  }
  return new Uint8Array(bytes);
}

/**
 * Parse NEAR secret key string ('ed25519:...') into its components.
 * NEAR secrets are 64 bytes: seed(32) | pub(32)
 */
export function parseNearSecretKey(str: string): { seed: Uint8Array; pub: Uint8Array } {
  const b58 = stripPrefix(str);
  const bytes = bs58.decode(b58);
  if (bytes.length !== 64) {
    throw new Error(`Invalid NEAR secret key length: ${bytes.length}`);
  }
  const all = new Uint8Array(bytes);
  const seed = all.slice(0, 32);
  const pub = all.slice(32, 64);
  return { seed, pub };
}

/** Convert raw 32-byte public key to NEAR string ('ed25519:...') */
export function toPublicKeyString(pub: Uint8Array): string {
  if (!(pub?.length === 32)) {
    throw new Error('Public key must be 32 bytes');
  }
  return ensurePrefix(bs58.encode(pub));
}

/** Convert raw seed(32) + pub(32) to NEAR secret string ('ed25519:...') */
export function toSecretKeyString(seed: Uint8Array, pub: Uint8Array): string {
  if (!(seed?.length === 32)) {
    throw new Error('Seed must be 32 bytes');
  }
  if (!(pub?.length === 32)) {
    throw new Error('Public key must be 32 bytes');
  }
  const secret = new Uint8Array(64);
  secret.set(seed, 0);
  secret.set(pub, 32);
  return ensurePrefix(bs58.encode(secret));
}

