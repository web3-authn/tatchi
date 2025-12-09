import { x25519 } from '@noble/curves/ed25519.js';
import { hkdf } from '@noble/hashes/hkdf.js';
import { sha256 } from '@noble/hashes/sha2.js';
import { chacha20poly1305 } from '@noble/ciphers/chacha.js';

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
  context: EmailEncryptionContext;
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
  context: EmailEncryptionContext;
}

function serializeContextForAad(context: EmailEncryptionContext): string {
  // Canonicalize context for AAD by sorting keys alphabetically so
  // JSON.stringify(context) matches the contract/worker JSON representation:
  // {"account_id": "...", "network_id": "...", "payer_account_id": "..."}
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
  const { emailRaw, context, recipientPk, testOverrides } = input;

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
  const aad = encoder.encode(serializeContextForAad(context));
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

  return { envelope, context };
}

export interface DecryptEmailForOutlayerTestOnlyInput {
  envelope: EncryptedEmailEnvelope;
  context: EmailEncryptionContext;
  recipientSk: Uint8Array;
}

/**
 * Test-only helper to decrypt an EncryptedEmailEnvelope using the recipient's
 * X25519 private key. This mirrors the Outlayer worker logic so unit tests can
 * perform deterministic round-trip checks of encryptEmailForOutlayer.
 */
export async function decryptEmailForOutlayerTestOnly(
  input: DecryptEmailForOutlayerTestOnlyInput
): Promise<string> {
  const { envelope, context, recipientSk } = input;

  if (!(recipientSk instanceof Uint8Array) || recipientSk.length !== 32) {
    throw new Error('recipientSk must be a 32-byte X25519 secret key');
  }

  const encoder = new TextEncoder();
  const decoder = new TextDecoder();

  const fromB64 = (value: string): Uint8Array => {
    if (!value) return new Uint8Array();
    if (typeof Buffer !== 'undefined') {
      return new Uint8Array(Buffer.from(value, 'base64'));
    }
    const bin = atob(value);
    const out = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) {
      out[i] = bin.charCodeAt(i);
    }
    return out;
  };

  const ephemeralPub = fromB64(envelope.ephemeral_pub);
  const nonce = fromB64(envelope.nonce);
  const ciphertext = fromB64(envelope.ciphertext);

  if (ephemeralPub.length !== 32) {
    throw new Error(`ephemeral_pub must decode to 32 bytes, got ${ephemeralPub.length}`);
  }
  if (nonce.length !== 12) {
    throw new Error(`nonce must decode to 12 bytes, got ${nonce.length}`);
  }

  // Derive shared secret and symmetric key exactly as in encryptEmailForOutlayer
  const sharedSecret = x25519.getSharedSecret(recipientSk, ephemeralPub);
  const info = encoder.encode('email-dkim-encryption-key');
  const symmetricKey = hkdf(sha256, sharedSecret, undefined, info, 32);

  const aad = encoder.encode(serializeContextForAad(context));
  const cipher = chacha20poly1305(symmetricKey, nonce, aad);
  const plaintext = cipher.decrypt(ciphertext);

  return decoder.decode(plaintext);
}

/**
 * Test-only helper to derive a deterministic X25519 keypair from a seed string.
 * This is used only in unit tests so they don't need to import @noble/curves directly.
 */
export function deriveTestX25519KeypairFromSeed(seed: string): { secretKey: Uint8Array; publicKey: Uint8Array } {
  const encoder = new TextEncoder();
  const bytes = encoder.encode(seed || '');
  const sk = new Uint8Array(32);
  sk.set(bytes.slice(0, 32));
  const pk = x25519.getPublicKey(sk);
  return { secretKey: sk, publicKey: pk };
}
