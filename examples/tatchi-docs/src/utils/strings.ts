
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
