import { base64UrlDecode, base64UrlEncode } from '../../../utils/encoders';
import { toOptionalTrimmedString } from '../../../utils/validation';
import { sha512 } from '@noble/hashes/sha2.js';

const ED25519_ORDER_L = (1n << 252n) + 27742317777372353535851937790883648493n;

function modL(x: bigint): bigint {
  const r = x % ED25519_ORDER_L;
  return r >= 0n ? r : r + ED25519_ORDER_L;
}

function bytesToBigintLE(bytes: Uint8Array): bigint {
  let out = 0n;
  for (let i = 0; i < bytes.length; i += 1) {
    out |= BigInt(bytes[i]!) << (8n * BigInt(i));
  }
  return out;
}

function bigintToBytesLE32(x: bigint): Uint8Array {
  const out = new Uint8Array(32);
  let v = modL(x);
  for (let i = 0; i < 32; i += 1) {
    out[i] = Number(v & 0xffn);
    v >>= 8n;
  }
  return out;
}

function invModL(x: bigint): bigint {
  let a = modL(x);
  if (a === 0n) throw new Error('ed25519 scalar inverse: division by zero');

  // Extended Euclidean algorithm to find inverse mod L.
  let t = 0n;
  let newT = 1n;
  let r = ED25519_ORDER_L;
  let newR = a;
  while (newR !== 0n) {
    const q = r / newR;
    [t, newT] = [newT, t - q * newT];
    [r, newR] = [newR, r - q * newR];
  }
  if (r !== 1n) throw new Error('ed25519 scalar inverse: non-invertible');
  return modL(t);
}

function u16ToScalarBytesLE(id: number): Uint8Array {
  const n = Math.floor(Number(id) || 0);
  if (!Number.isFinite(n) || n <= 0 || n > 65535) {
    throw new Error('cosignerId must be an integer in [1,65535]');
  }
  const bytes = new Uint8Array(32);
  bytes[0] = n & 0xff;
  bytes[1] = (n >>> 8) & 0xff;
  return bytes;
}

function hashToScalarWideLE(inputs: Uint8Array[]): bigint {
  const totalLen = inputs.reduce((acc, b) => acc + b.length, 0);
  const preimage = new Uint8Array(totalLen);
  let offset = 0;
  for (const chunk of inputs) {
    preimage.set(chunk, offset);
    offset += chunk.length;
  }
  const digest = sha512(preimage);
  return modL(bytesToBigintLE(digest));
}

function deriveCosignerPolyCoefficients(input: {
  relayerSigningShareBytes: Uint8Array;
  cosignerThreshold: number;
}): bigint[] {
  const t = Math.floor(Number(input.cosignerThreshold) || 0);
  if (!Number.isFinite(t) || t < 1) {
    throw new Error('cosignerThreshold must be an integer >= 1');
  }

  const relayerSigningShareBytes = input.relayerSigningShareBytes;
  if (relayerSigningShareBytes.length !== 32) {
    throw new Error(`relayerSigningShare must be 32 bytes, got ${relayerSigningShareBytes.length}`);
  }

  const a0 = modL(bytesToBigintLE(relayerSigningShareBytes));
  if (a0 === 0n) {
    throw new Error('relayer signing share must be non-zero');
  }

  const coeffs: bigint[] = [a0];
  if (t === 1) return coeffs;

  const prefix = new TextEncoder().encode('w3a/threshold-ed25519/cosigner-poly_v1');
  const tBytes = new Uint8Array(4);
  new DataView(tBytes.buffer).setUint32(0, t, true);

  for (let i = 1; i < t; i += 1) {
    const idx = new Uint8Array(4);
    new DataView(idx.buffer).setUint32(0, i, true);
    const ai = hashToScalarWideLE([prefix, tBytes, relayerSigningShareBytes, idx]);
    coeffs.push(ai);
  }
  return coeffs;
}

export function normalizeCosignerIds(input: unknown): number[] | null {
  if (!Array.isArray(input)) return null;
  const ids: number[] = [];
  for (const item of input) {
    const n = Number(item);
    if (!Number.isFinite(n)) return null;
    const v = Math.floor(n);
    if (v <= 0 || v > 65535) return null;
    ids.push(v);
  }
  ids.sort((a, b) => a - b);
  const unique: number[] = [];
  for (const id of ids) {
    if (unique.length === 0 || unique[unique.length - 1] !== id) unique.push(id);
  }
  return unique.length ? unique : null;
}

export function deriveRelayerCosignerSharesFromRelayerSigningShare(input: {
  relayerSigningShareB64u: string;
  cosignerIds: number[];
  cosignerThreshold: number;
}): {
  ok: true;
  sharesByCosignerId: Record<string, string>;
} | {
  ok: false;
  code: string;
  message: string;
} {
  const relayerSigningShareB64u = toOptionalTrimmedString(input.relayerSigningShareB64u);
  if (!relayerSigningShareB64u) {
    return { ok: false, code: 'invalid_body', message: 'relayerSigningShareB64u is required' };
  }

  let relayerSigningShareBytes: Uint8Array;
  try {
    relayerSigningShareBytes = base64UrlDecode(relayerSigningShareB64u);
  } catch (e: unknown) {
    return { ok: false, code: 'invalid_body', message: `Invalid relayerSigningShareB64u: ${String(e || 'decode failed')}` };
  }
  if (relayerSigningShareBytes.length !== 32) {
    return { ok: false, code: 'invalid_body', message: `relayerSigningShareB64u must be 32 bytes, got ${relayerSigningShareBytes.length}` };
  }

  const cosignerIds = normalizeCosignerIds(input.cosignerIds);
  if (!cosignerIds) {
    return { ok: false, code: 'invalid_body', message: 'cosignerIds must be a non-empty list of u16 ids' };
  }

  const t = Math.floor(Number(input.cosignerThreshold) || 0);
  if (!Number.isFinite(t) || t < 1) {
    return { ok: false, code: 'invalid_body', message: 'cosignerThreshold must be an integer >= 1' };
  }
  if (t > cosignerIds.length) {
    return { ok: false, code: 'invalid_body', message: `cosignerThreshold must be <= cosignerIds.length (got t=${t}, n=${cosignerIds.length})` };
  }

  const coeffs = deriveCosignerPolyCoefficients({ relayerSigningShareBytes, cosignerThreshold: t });

  const sharesByCosignerId: Record<string, string> = {};
  for (const id of cosignerIds) {
    const x = BigInt(id);
    let xPow = x;
    let y = coeffs[0]!;
    for (let j = 1; j < coeffs.length; j += 1) {
      y = modL(y + coeffs[j]! * xPow);
      xPow = modL(xPow * x);
    }
    if (y === 0n) {
      return { ok: false, code: 'internal', message: `Derived cosigner share is zero for cosignerId=${id}` };
    }
    sharesByCosignerId[String(id)] = base64UrlEncode(bigintToBytesLE32(y));
  }

  return { ok: true, sharesByCosignerId };
}

export function lagrangeCoefficientAtZeroForCosigner(input: {
  cosignerId: number;
  cosignerIds: number[];
}): { ok: true; lambda: Uint8Array } | { ok: false; code: string; message: string } {
  const cosignerIds = normalizeCosignerIds(input.cosignerIds);
  if (!cosignerIds) {
    return { ok: false, code: 'invalid_body', message: 'cosignerIds must be a non-empty list of u16 ids' };
  }

  const cosignerId = Math.floor(Number(input.cosignerId) || 0);
  if (!Number.isFinite(cosignerId) || cosignerId <= 0 || cosignerId > 65535) {
    return { ok: false, code: 'invalid_body', message: 'cosignerId must be an integer in [1,65535]' };
  }
  if (!cosignerIds.includes(cosignerId)) {
    return { ok: false, code: 'invalid_body', message: 'cosignerIds must include cosignerId' };
  }

  const xI = BigInt(cosignerId);
  let num = 1n;
  let den = 1n;
  for (const id of cosignerIds) {
    if (id === cosignerId) continue;
    const xJ = BigInt(id);
    num = modL(num * xJ);
    den = modL(den * (xJ - xI));
  }
  if (den === 0n) {
    return { ok: false, code: 'invalid_body', message: 'duplicated cosignerId in cosignerIds' };
  }

  const lambda = modL(num * invModL(den));
  return { ok: true, lambda: bigintToBytesLE32(lambda) };
}

export function encodeFrostIdentifierBytesFromU16(id: number): Uint8Array {
  return u16ToScalarBytesLE(id);
}

export function multiplyEd25519ScalarB64uByScalarBytesLE32(input: {
  scalarB64u: string;
  factorBytesLE32: Uint8Array;
}): { ok: true; scalarB64u: string } | { ok: false; code: string; message: string } {
  const scalarB64u = toOptionalTrimmedString(input.scalarB64u);
  if (!scalarB64u) {
    return { ok: false, code: 'invalid_body', message: 'scalarB64u is required' };
  }

  let scalarBytes: Uint8Array;
  try {
    scalarBytes = base64UrlDecode(scalarB64u);
  } catch (e: unknown) {
    return { ok: false, code: 'invalid_body', message: `Invalid scalarB64u: ${String(e || 'decode failed')}` };
  }
  if (scalarBytes.length !== 32) {
    return { ok: false, code: 'invalid_body', message: `scalarB64u must be 32 bytes, got ${scalarBytes.length}` };
  }

  const factorBytes = input.factorBytesLE32;
  if (!(factorBytes instanceof Uint8Array) || factorBytes.length !== 32) {
    return { ok: false, code: 'invalid_body', message: 'factorBytesLE32 must be a 32-byte Uint8Array' };
  }

  const scalar = modL(bytesToBigintLE(scalarBytes));
  const factor = modL(bytesToBigintLE(factorBytes));
  const out = modL(scalar * factor);
  if (out === 0n) {
    return { ok: false, code: 'internal', message: 'Derived scalar is zero' };
  }
  return { ok: true, scalarB64u: base64UrlEncode(bigintToBytesLE32(out)) };
}

export function addEd25519ScalarsB64u(input: {
  scalarsB64u: string[];
}): { ok: true; scalarB64u: string } | { ok: false; code: string; message: string } {
  if (!Array.isArray(input.scalarsB64u) || input.scalarsB64u.length === 0) {
    return { ok: false, code: 'invalid_body', message: 'scalarsB64u must be a non-empty array' };
  }

  let acc = 0n;
  for (const item of input.scalarsB64u) {
    const raw = toOptionalTrimmedString(item);
    if (!raw) return { ok: false, code: 'invalid_body', message: 'scalarsB64u contains an empty item' };
    let bytes: Uint8Array;
    try {
      bytes = base64UrlDecode(raw);
    } catch (e: unknown) {
      return { ok: false, code: 'invalid_body', message: `Invalid scalar encoding: ${String(e || 'decode failed')}` };
    }
    if (bytes.length !== 32) {
      return { ok: false, code: 'invalid_body', message: `scalar must be 32 bytes, got ${bytes.length}` };
    }
    acc = modL(acc + bytesToBigintLE(bytes));
  }

  if (acc === 0n) {
    return { ok: false, code: 'internal', message: 'Sum of scalars is zero' };
  }
  return { ok: true, scalarB64u: base64UrlEncode(bigintToBytesLE32(acc)) };
}
