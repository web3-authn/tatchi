import { x25519 } from '@noble/curves/ed25519.js';
import { hkdf } from '@noble/hashes/hkdf.js';
import { sha256 } from '@noble/hashes/sha2.js';
import { chacha20poly1305 } from '@noble/ciphers/chacha.js';
import { canonicalizeEmail } from './emailParsers';

export interface EncryptedEmailEnvelope {
  version: number;
  ephemeral_pub: string;
  nonce: string;
  ciphertext: string;
}

export interface EmailEncryptionContext {
  account_id: string;
  payer_account_id: string;
  network_id: string;
  // Allow relayers to include additional metadata bound into AAD
  [key: string]: unknown;
}

export interface EncryptEmailForOutlayerInput {
  emailRaw: string;
  aeadContext: EmailEncryptionContext;
  recipientPk: Uint8Array;
  /**
   * Test-only overrides to make encryption deterministic for round-trip tests.
   */
  testOverrides?: {
    ephemeralSecretKey?: Uint8Array;
    nonce?: Uint8Array;
  };
}

export interface EncryptEmailForOutlayerResult {
  envelope: EncryptedEmailEnvelope;
  aeadContext: EmailEncryptionContext;
}

// IMPORTANT: The exact JSON byte sequence here is used as AEAD AAD and must
// match what the AEAD context being passed into decrypt_encrypted_email().
// see: https://github.com/web3-authn/email-dkim-verifier-contract/blob/f06cf33b484cd9750661bf418812f259f0674b69/src/api.rs#L175
//
// The contract serializes `args` with serde_json, which orders keys
// lexicographically, so we must mirror that here. Changing this logic or
// adding/removing keys requires updating the Outlayer compat tests and
// verifying decryption end-to-end.
//
// Canonical form (alphabetical by key):
// ```
// {
//    "account_id": "...",
//    "network_id": "...",
//    "payer_account_id": "..."
// }
// ```
function serializeContextForAad(context: EmailEncryptionContext): string {
  const entries = Object.entries(context).sort(([a], [b]) => a.localeCompare(b));
  return JSON.stringify(Object.fromEntries(entries));
}

export function deriveOutlayerStaticKeyFromSeedHex(seedHex: string): { secretKey: Uint8Array; publicKey: Uint8Array } {
  const cleaned = seedHex.trim();
  if (cleaned.length !== 64) {
    throw new Error('OUTLAYER_WORKER_SK_SEED_HEX32 must be a 64-char hex string');
  }
  const seed = new Uint8Array(32);
  for (let i = 0; i < 32; i++) {
    const byteHex = cleaned.slice(i * 2, i * 2 + 2);
    const value = Number.parseInt(byteHex, 16);
    if (Number.isNaN(value)) {
      throw new Error('OUTLAYER_WORKER_SK_SEED_HEX32 contains non-hex characters');
    }
    seed[i] = value;
  }
  const encoder = new TextEncoder();
  const okm = hkdf(sha256, seed, undefined, encoder.encode('outlayer-email-dkim-x25519'), 32);
  const secretKey = okm instanceof Uint8Array ? okm : new Uint8Array(okm);
  const publicKey = x25519.getPublicKey(secretKey);
  return { secretKey, publicKey };
}

export async function encryptEmailForOutlayer(
  input: EncryptEmailForOutlayerInput
): Promise<EncryptEmailForOutlayerResult> {
  const { emailRaw, aeadContext, recipientPk, testOverrides } = input;

  if (!(recipientPk instanceof Uint8Array) || recipientPk.length !== 32) {
    throw new Error('recipientPk must be a 32-byte X25519 public key');
  }

  const encoder = new TextEncoder();

  // 1. Generate ephemeral X25519 keypair
  let ephemeralSk: Uint8Array;
  let ephemeralPk: Uint8Array;
  if (testOverrides?.ephemeralSecretKey) {
    if (!(testOverrides.ephemeralSecretKey instanceof Uint8Array) || testOverrides.ephemeralSecretKey.length !== 32) {
      throw new Error('testOverrides.ephemeralSecretKey must be a 32-byte Uint8Array');
    }
    ephemeralSk = testOverrides.ephemeralSecretKey;
    ephemeralPk = x25519.getPublicKey(ephemeralSk);
  } else {
    const { secretKey, publicKey } = x25519.keygen();
    ephemeralSk = secretKey;
    ephemeralPk = publicKey;
  }

  // 2. Derive shared secret via X25519 ECDH
  const sharedSecret = x25519.getSharedSecret(ephemeralSk, recipientPk); // 32 bytes

  // 3. Derive symmetric key via HKDF-SHA256 (info="email-dkim-encryption-key")
  const info = encoder.encode('email-dkim-encryption-key');
  const symmetricKey = hkdf(sha256, sharedSecret, undefined, info, 32);

  // 4. Encrypt using ChaCha20-Poly1305 with JSON(context) as AAD
  let nonce: Uint8Array;
  if (testOverrides?.nonce) {
    if (!(testOverrides.nonce instanceof Uint8Array) || testOverrides.nonce.length !== 12) {
      throw new Error('testOverrides.nonce must be a 12-byte Uint8Array');
    }
    nonce = testOverrides.nonce;
  } else {
    nonce = crypto.getRandomValues(new Uint8Array(12));
  }
  const aad = encoder.encode(serializeContextForAad(aeadContext));
  const plaintext = encoder.encode(emailRaw);

  const cipher = chacha20poly1305(symmetricKey, nonce, aad);
  const ciphertext = cipher.encrypt(plaintext);

  // 5. Serialize fields as base64 strings
  const b64 = (bytes: Uint8Array): string => {
    if (typeof Buffer !== 'undefined') {
      return Buffer.from(bytes).toString('base64');
    }
    let binary = '';
    for (let i = 0; i < bytes.length; i++) {
      binary += String.fromCharCode(bytes[i]);
    }
    return btoa(binary);
  };

  const envelope: EncryptedEmailEnvelope = {
    version: 1,
    ephemeral_pub: b64(ephemeralPk),
    nonce: b64(nonce),
    ciphertext: b64(ciphertext),
  };

  return { envelope, aeadContext };
}

export function hashRecoveryEmailForAccount(args: { recoveryEmail: string; accountId: string }): number[] {
  const salt = (args.accountId || '').trim().toLowerCase();
  const canonical = canonicalizeEmail(String(args.recoveryEmail || ''));
  if (!canonical) {
    throw new Error('Missing From email address for encrypted email recovery');
  }
  const input = `${canonical}|${salt}`;
  const bytes = new TextEncoder().encode(input);
  const digest = sha256(bytes);
  return Array.from(digest);
}
