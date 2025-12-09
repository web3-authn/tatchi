export type ForwardableEmailPayload = {
  from: string;
  to: string;
  headers: Record<string, string>;
  raw: string;
  rawSize?: number;
};

export function normalizeAddress(input: string): string {
  const trimmed = input.trim();
  const angleStart = trimmed.indexOf('<');
  const angleEnd = trimmed.indexOf('>');
  if (angleStart !== -1 && angleEnd > angleStart) {
    return trimmed.slice(angleStart + 1, angleEnd).trim().toLowerCase();
  }
  return trimmed.toLowerCase();
}

export async function buildForwardableEmailPayload(message: any): Promise<ForwardableEmailPayload> {
  const from = String(message.from || '');
  const to = String(message.to || '');

  const headersObj = Object.fromEntries(message.headers as any);
  const normalizedHeaders: Record<string, string> = {};
  for (const [k, v] of Object.entries(headersObj)) {
    normalizedHeaders[String(k).toLowerCase()] = String(v);
  }

  const raw = await new Response(message.raw).text();
  const rawSize = typeof message.rawSize === 'number' ? message.rawSize : undefined;

  return {
    from,
    to,
    headers: normalizedHeaders,
    raw,
    rawSize,
  };
}

export function parseAccountIdFromEmailPayload(payload: ForwardableEmailPayload): string | null {
  const subjectHeader = payload.headers['subject'];
  const rawForParsing = subjectHeader || payload.raw;

  const parseAccountIdFromSubject = (raw: string | undefined | null): string | null => {
    if (!raw || typeof raw !== 'string') return null;

    let subjectText = '';
    const lines = raw.split(/\r?\n/);
    const subjectLine = lines.find(line => /^subject:/i.test(line));
    if (subjectLine) {
      const [, restRaw = ''] = subjectLine.split(/:/, 2);
      subjectText = restRaw.trim();
    } else {
      subjectText = raw.trim();
    }

    if (!subjectText) return null;

    // Strip common reply/forward prefixes
    subjectText = subjectText.replace(/^(re|fwd):\s*/i, '').trim();
    if (!subjectText) return null;

    // Expected format:
    // - "recover-<request_id> <accountId> ed25519:<pk>"
    // Capture the accountId as the token after 'recover-<request_id>'.
    const spacedMatch = subjectText.match(
      /^recover-([A-Za-z0-9]{6})\s+([^\s]+)(?:\s+ed25519:[^\s]+)?\s*$/i
    );
    if (spacedMatch && spacedMatch[2]) {
      return spacedMatch[2];
    }

    return null;
  };

  const parsedAccountId = parseAccountIdFromSubject(rawForParsing);
  const headerAccountId = String(
    payload.headers['x-near-account-id'] || payload.headers['x-account-id'] || ''
  ).trim();
  const accountId = (parsedAccountId || headerAccountId || '').trim();

  return accountId || null;
}
