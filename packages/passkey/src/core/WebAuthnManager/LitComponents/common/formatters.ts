
export function formatArgs(args?: string | Record<string, string>): string {
  if (!args) return '';
  if (typeof args === 'string') return args;
  try {
    return JSON.stringify(args, (_k, v) => typeof v === 'bigint' ? v.toString() : v, 2);
  } catch (e) {
    return String(args);
  }
}

export function formatDeposit(deposit?: string): string {
  if (!deposit || deposit === '0') return '0 NEAR';
  try {
    const yocto = BigInt(deposit);
    const YOCTO_FACTOR = BigInt('1000000000000000000000000'); // 1e24

    const whole = yocto / YOCTO_FACTOR;
    const frac = yocto % YOCTO_FACTOR;

    // Format up to 5 decimal places (as before), then trim trailing zeros
    const maxDecimals = 5;
    if (frac === BigInt(0)) {
      return `${whole.toString()} NEAR`;
    }

    // Pad fractional to 24 digits, then take the first maxDecimals
    const fracStrFull = frac.toString().padStart(24, '0');
    let fracStr = fracStrFull.slice(0, maxDecimals);
    // Trim trailing zeros
    fracStr = fracStr.replace(/0+$/g, '');

    // If trimming removed all digits, omit decimal part
    if (fracStr.length === 0) {
      return `${whole.toString()} NEAR`;
    }

    return `${whole.toString()}.${fracStr} NEAR`;
  } catch (e) {
    // If parsing fails, return original value
    return deposit;
  }
}

export function formatGas(gas?: string): string {
  if (!gas) return '';
  try {
    const gasValue = BigInt(gas);
    const tgas = gasValue / BigInt('1000000000000'); // Convert to Tgas (divide by 10^12)
    return `${tgas} Tgas`;
  } catch (e) {
    // If parsing fails, return original value
    return gas;
  }
}

/**
 * Shorten a long public key or identifier by keeping a head and tail
 * and replacing the middle with an ellipsis.
 * Example: ed25519:ABCDEFGH...WXYZ12
 */
export function shortenPubkey(
  pk?: string,
  opts: { prefix?: number; suffix?: number } = {}
): string {
  if (!pk || typeof pk !== 'string') return '';
  const { prefix = 12, suffix = 6 } = opts;
  if (pk.length <= prefix + suffix + 3) return pk; // +3 for '...'
  const head = pk.slice(0, prefix);
  const tail = pk.slice(-suffix);
  return `${head}...${tail}`;
}


// Helper function for calculating code size
export function formatCodeSize(code: Uint8Array | string): string {
  if (!code) return '0 bytes';
  if (code instanceof Uint8Array) return `${code.byteLength} bytes`;
  if (Array.isArray(code)) return `${code.length} bytes`;
  if (typeof code === 'string') return `${code.length} bytes`;
  return 'unknown';
}