
export interface ValidationResult {
  valid: boolean;
  error?: string;
}

export interface NearAccountValidationOptions {
  /** Restrict to specific suffixes (e.g., ['testnet', 'near']) */
  allowedSuffixes?: string[];
  /** Require Top-level domains with exactly 2 parts (username.suffix) instead of allowing subdomains */
  requireTopLevelDomain?: boolean;
}

/**
 * Validate NEAR account ID format with optional suffix restrictions
 * @param nearAccountId - The account ID to validate
 * @param options - Optional validation constraints
 */
export function validateNearAccountId(
  nearAccountId: string,
  options: NearAccountValidationOptions = {
    allowedSuffixes: ['testnet', 'near'],
    requireTopLevelDomain: false
  }
): ValidationResult {
  if (!nearAccountId || typeof nearAccountId !== 'string') {
    return { valid: false, error: 'Account ID must be a non-empty string' };
  }

  const parts = nearAccountId.split('.');
  if (parts.length < 2) {
    return { valid: false, error: 'Account ID must contain at least one dot (e.g., username.testnet)' };
  }

  // Check for exact two parts requirement (e.g., server registration)
  if (options.requireTopLevelDomain && parts.length !== 2) {
    const suffixList = options.allowedSuffixes?.join(', ') || 'valid suffixes';
    return {
      valid: false,
      error: `Invalid NEAR account ID format. Expected format: <username>.<suffix> where suffix is one of: ${suffixList}`
    };
  }

  const username = parts[0];
  const suffix = parts[parts.length - 1]; // Last part for suffix checking
  const domain = parts.slice(1).join('.');

  // Validate username part
  if (!username || username.length === 0) {
    return { valid: false, error: 'Username part cannot be empty' };
  }

  if (!/^[a-z0-9_\-]+$/.test(username)) {
    return { valid: false, error: 'Username can only contain lowercase letters, numbers, underscores, and hyphens' };
  }

  // Validate domain part
  if (!domain || domain.length === 0) {
    return { valid: false, error: 'Domain part cannot be empty' };
  }

  // Check allowed suffixes if specified
  if (options.allowedSuffixes && options.allowedSuffixes.length > 0) {
    // Check if the account ID ends with any of the allowed suffixes
    const matchesAnySuffix = options.allowedSuffixes.some(allowedSuffix => {
      // For single-part suffixes, check the last part
      if (!allowedSuffix.includes('.')) {
        return suffix === allowedSuffix;
      }
      // For multi-part suffixes, check if the account ID ends with the full suffix
      return nearAccountId.endsWith(`.${allowedSuffix}`);
    });

    if (!matchesAnySuffix) {
      return {
        valid: false,
        error: `Invalid NEAR account ID suffix. Expected account to end with one of: ${options.allowedSuffixes.join(', ')}`
      };
    }
  }

  return { valid: true };
}