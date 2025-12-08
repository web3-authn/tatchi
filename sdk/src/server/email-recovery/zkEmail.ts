export interface ForwardableEmailPayload {
  from: string;
  to: string;
  headers: Record<string, string>;
  raw?: string;
  rawSize?: number;
}

export type NormalizedEmailResult =
  | { ok: true; payload: ForwardableEmailPayload }
  | { ok: false; code: string; message: string };

export function normalizeForwardableEmailPayload(input: unknown): NormalizedEmailResult {
  if (!input || typeof input !== 'object') {
    return { ok: false, code: 'invalid_email', message: 'JSON body required' };
  }

  const body = input as Partial<ForwardableEmailPayload>;
  const { from, to, headers, raw, rawSize } = body;

  if (!from || typeof from !== 'string' || !to || typeof to !== 'string') {
    return { ok: false, code: 'invalid_email', message: 'from and to are required' };
  }

  if (!headers || typeof headers !== 'object') {
    return { ok: false, code: 'invalid_email', message: 'headers object is required' };
  }

  const normalizedHeaders: Record<string, string> = {};
  for (const [k, v] of Object.entries(headers as Record<string, unknown>)) {
    normalizedHeaders[String(k).toLowerCase()] = String(v);
  }

  return {
    ok: true,
    payload: {
      from,
      to,
      headers: normalizedHeaders,
      raw: typeof raw === 'string' ? raw : undefined,
      rawSize: typeof rawSize === 'number' ? rawSize : undefined,
    },
  };
}

/**
 * Parse NEAR accountId from the Subject line inside a raw RFC822 email.
 * Expected primary format (case-insensitive on "Subject"):
 *   Subject: recover bob.testnet
 *
 * Returns the parsed accountId (e.g. "bob.testnet") or null if not found.
 */
export function parseAccountIdFromSubject(raw: string | undefined | null): string | null {
  if (!raw || typeof raw !== 'string') return null;

  // Accept either a full RFC822 message (with "Subject: ..." header)
  // or a bare Subject value ("recover bob.testnet").
  let subjectText = '';

  const lines = raw.split(/\r?\n/);
  const subjectLine = lines.find(line => /^subject:/i.test(line));
  if (subjectLine) {
    const [, restRaw = '' ] = subjectLine.split(/:/, 2);
    subjectText = restRaw.trim();
  } else {
    subjectText = raw.trim();
  }

  if (!subjectText) return null;

  // Strip common reply/forward prefixes
  subjectText = subjectText.replace(/^(re|fwd):\s*/i, '').trim();
  if (!subjectText) return null;

  // Strict format: "recover <accountId> ed25519:<pk>"
  const spacedMatch = subjectText.match(/^recover\s+([^\s]+)\s+ed25519:[^\s]+\s*$/i);
  if (spacedMatch?.[1]) {
    return spacedMatch[1];
  }

  return null;
}

export async function generateZkEmailProofFromPayload(
  payload: ForwardableEmailPayload
): Promise<{ proof: unknown; publicInputs: unknown }> {

  // TODO: Stub implementation for now.
  // Will later call EmailRecoverer contract:
  // pub fn verify_zkemail_and_recover(
  //     &mut self,
  //     proof: ProofInput,
  //     public_inputs: Vec<String>,
  //     account_id: String,
  //     new_public_key: String,
  //     from_email: String,
  //     timestamp: String,
  // ) -> Promise

  void payload;
  return { proof: null, publicInputs: null };
}
