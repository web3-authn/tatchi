import { x25519 } from '@noble/curves/ed25519.js';
import { hkdf } from '@noble/hashes/hkdf.js';
import { sha256 } from '@noble/hashes/sha2.js';
import { chacha20poly1305 } from '@noble/ciphers/chacha.js';
import type { EncryptedEmailEnvelope, EmailEncryptionContext } from './emailEncryptor';

export interface DecryptEmailForOutlayerTestOnlyInput {
  envelope: EncryptedEmailEnvelope;
  context: EmailEncryptionContext;
  recipientSk: Uint8Array;
}

/*
 * Sort the context keys by alphbetical order, then stringify
 * Needed for AEAD associated data in ChaCha20-Poly1305 decryption in the Outlayer worker
 */
function serializeContextForAad(context: EmailEncryptionContext): string {
  const entries = Object.entries(context).sort(([a], [b]) => a.localeCompare(b));
  return JSON.stringify(Object.fromEntries(entries));
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
