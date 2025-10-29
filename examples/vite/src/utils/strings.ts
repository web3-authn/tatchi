
export const shortenString = (str: string | null | undefined, headChars = 6, tailChars = 4) => {
  if (!str) return '';
  if (str.length <= headChars + tailChars + 2) return str; // If already short or has a prefix like "ed25519:"
  const prefixIndex = str.indexOf(':');
  if (prefixIndex > -1 && prefixIndex < headChars) { // Handle prefixes like ed25519:
    return `${str.substring(0, prefixIndex + 1 + headChars)}...${str.substring(str.length - tailChars)}`;
  }
  return `${str.substring(0, headChars)}...${str.substring(str.length - tailChars)}`;
};

export function friendlyWebAuthnMessage(err: any): string {
  const msg = err?.message || String(err || 'Unknown error');
  const name = err?.name || '';

  const notAllowed = name === 'NotAllowedError' || /NotAllowedError/i.test(msg) || /timed out or was not allowed/i.test(msg);
  if (notAllowed) return 'Touch ID was cancelled or timed out.';

  if (name === 'AbortError' || /AbortError/i.test(msg)) return 'Authentication was cancelled.';
  if (name === 'TimeoutError' || /timed out/i.test(msg)) return 'Touch ID timed out. Please try again.';
  if (name === 'SecurityError' || /SecurityError/i.test(msg)) return 'Security error. Make sure you are on a secure site (HTTPS).';
  if (name === 'InvalidStateError' || /InvalidStateError/i.test(msg)) return 'No matching passkey found for this account.';

  return msg.startsWith('Recovery failed:') ? msg : `Recovery failed: ${msg}`;
}

