export type Hex = `0x${string}`;

export interface RSVSignature {
  r: Hex;
  s: Hex;
  v: number; // 27/28 or already normalized
}

function toHex(bytes: Uint8Array): Hex {
  return (
    '0x' + Array.from(bytes).map((b) => b.toString(16).padStart(2, '0')).join('')
  ) as Hex;
}

function sanitizeHex(input: string): Hex {
  const h = input.startsWith('0x') ? input : `0x${input}`;
  return h.toLowerCase() as Hex;
}

export function parseMpcSignature(bytes: Uint8Array): RSVSignature[] | null {
  // Case 1: raw 65-byte RSV
  if (bytes.length === 65) {
    const r = toHex(bytes.slice(0, 32));
    const s = toHex(bytes.slice(32, 64));
    const vRaw = bytes[64];
    const v = vRaw === 0 || vRaw === 1 ? vRaw + 27 : vRaw;
    return [{ r, s, v }];
  }

  // Case 1b: raw 64-byte (r||s) without recovery id — return both v candidates
  if (bytes.length === 64) {
    const r = toHex(bytes.slice(0, 32));
    const s = toHex(bytes.slice(32, 64));
    return [
      { r, s, v: 27 },
      { r, s, v: 28 },
    ];
  }

  // Try to interpret bytes as UTF-8 JSON (or JSON-encoded string)
  let parsed: any | null = null;
  let text: string | null = null;
  try {
    text = new TextDecoder().decode(bytes).trim();
    try {
      parsed = JSON.parse(text);
    } catch {
      // JSON-encoded string? e.g., "{...}"
      if ((text.startsWith('"') && text.endsWith('"')) || (text.startsWith("'") && text.endsWith("'"))) {
        const unquoted = text.slice(1, -1);
        try { parsed = JSON.parse(unquoted); } catch { parsed = unquoted; }
      } else {
        parsed = text;
      }
    }
  } catch {
    parsed = null;
  }

  // Case 2: parsed JSON with r/s/v or yParity
  if (parsed && typeof parsed === 'object') {
    const r0: string | undefined = (parsed as any).r || (parsed as any).R;
    const s0: string | undefined = (parsed as any).s || (parsed as any).S;
    let v0: number | undefined = (parsed as any).v ?? (parsed as any).V ?? (parsed as any).yParity ?? (parsed as any).y_parity;
    if (typeof r0 === 'string' && typeof s0 === 'string' && (typeof v0 === 'number' || v0 === 0 || v0 === 1)) {
      const r = sanitizeHex(r0);
      const s = sanitizeHex(s0);
      const v = v0 === 0 || v0 === 1 ? v0 + 27 : v0;
      return [{ r, s, v }];
    }

    // Case 2b: MPC-like JSON { scheme: 'Secp256k1', big_r: { affine_x, affine_y }, s, recovery_id }
    const scheme = (parsed as any).scheme || (parsed as any).schema;
    const bigR = (parsed as any).big_r || (parsed as any).bigR || (parsed as any).R;
    const sField: any = (parsed as any).s;
    // s may be an object with scalar field
    const sText: string | undefined = (typeof sField === 'string') ? sField : (sField?.scalar as string | undefined);
    let recId: number | undefined = (parsed as any).recovery_id ?? (parsed as any).recoveryId;
    if (scheme === 'Secp256k1' && bigR && typeof sText === 'string') {
      const x: string | undefined = bigR.affine_x || bigR.x || bigR.X;
      const y: string | undefined = bigR.affine_y || bigR.y || bigR.Y;
      const affinePoint: string | undefined = bigR.affine_point || bigR.affinePoint;
      if (typeof x === 'string') {
        const xHex = x.startsWith('0x') ? x.slice(2) : x;
        const r = sanitizeHex('0x' + xHex.padStart(64, '0'));
        const sHexOnly = (sText.startsWith('0x') ? sText.slice(2) : sText).padStart(64, '0');
        const s = sanitizeHex(`0x${sHexOnly}`);
        let yParity: number = 0;
        if (typeof recId === 'number' && (recId === 0 || recId === 1)) {
          yParity = recId;
        } else if (typeof y === 'string') {
          const yHex = y.startsWith('0x') ? y.slice(2) : y;
          const lastNibble = yHex[yHex.length - 1];
          const lsb = parseInt(lastNibble, 16) & 1;
          yParity = lsb;
        } else if (typeof affinePoint === 'string') {
          // Compressed point 02/03 + X (33 bytes). 02 => even Y (parity 0), 03 => odd Y (parity 1)
          const ap = affinePoint.startsWith('0x') ? affinePoint.slice(2) : affinePoint;
          const prefix = ap.slice(0, 2);
          if (prefix === '02') yParity = 0; else if (prefix === '03') yParity = 1;
          // r is X from the compressed point
          const xFromPoint = ap.slice(2);
          const r2 = sanitizeHex('0x' + xFromPoint.padStart(64, '0'));
          const v2 = yParity === 0 || yParity === 1 ? yParity + 27 : yParity;
          return [{ r: r2, s, v: v2 }];
        }
        const v = yParity === 0 || yParity === 1 ? yParity + 27 : yParity;
        return [{ r, s, v }];
      }
      // When only compressed point is provided (no x/y fields)
      if (typeof affinePoint === 'string') {
        const ap = affinePoint.startsWith('0x') ? affinePoint.slice(2) : affinePoint;
        // Expect 33-byte (66 hex chars) starting with 02/03
        if (/^(02|03)[0-9a-fA-F]{64}$/.test(ap)) {
          const prefix = ap.slice(0, 2);
          const xHex = ap.slice(2);
          const r = sanitizeHex('0x' + xHex.padStart(64, '0'));
          const sHexOnly = (sText.startsWith('0x') ? sText.slice(2) : sText).padStart(64, '0');
          const s = sanitizeHex(`0x${sHexOnly}`);
          let yParity: number = (prefix === '03') ? 1 : 0;
          if (typeof recId === 'number' && (recId === 0 || recId === 1)) yParity = recId;
          const v = yParity === 0 || yParity === 1 ? yParity + 27 : yParity;
          return [{ r, s, v }];
        }
      }
    }

    // Case 2c: single hex blob in JSON
    const sigHex: string | undefined = (parsed as any).signature || (parsed as any).sig;
    if (typeof sigHex === 'string') {
      const hexish = sigHex.startsWith('0x') ? sigHex.slice(2) : sigHex;
      if (/^[0-9a-fA-F]{130}$/.test(hexish)) {
        const r = sanitizeHex('0x' + hexish.slice(0, 64));
        const s = sanitizeHex('0x' + hexish.slice(64, 128));
        const vByte = parseInt(hexish.slice(128, 130), 16);
        const v = vByte === 0 || vByte === 1 ? vByte + 27 : vByte;
        return [{ r, s, v }];
      }
    }
  }

  // Case 3: hex text containing concatenated RSV (from parsed string or decoded text)
  const str = (typeof parsed === 'string' ? parsed : text) || '';
  if (str) {
    const hexish = str.startsWith('0x') ? str.slice(2) : str;
    const isHex = /^[0-9a-fA-F]+$/.test(hexish);
    if (isHex && hexish.length === 65 * 2) {
      const r = sanitizeHex('0x' + hexish.slice(0, 64));
      const s = sanitizeHex('0x' + hexish.slice(64, 128));
      const vByte = parseInt(hexish.slice(128, 130), 16);
      const v = vByte === 0 || vByte === 1 ? vByte + 27 : vByte;
      return [{ r, s, v }];
    }
    // 64-byte hex without v — return both v candidates
    if (isHex && hexish.length === 64 * 2) {
      const r = sanitizeHex('0x' + hexish.slice(0, 64));
      const s = sanitizeHex('0x' + hexish.slice(64, 128));
      return [
        { r, s, v: 27 },
        { r, s, v: 28 },
      ];
    }
  }

  return null;
}
