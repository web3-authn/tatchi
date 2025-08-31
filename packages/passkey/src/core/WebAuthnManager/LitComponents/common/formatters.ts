
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
    const depositValue = BigInt(deposit);
    const nearValue = Number(depositValue) / 1e24; // Convert yoctoNEAR to NEAR
    return `${nearValue.toFixed(5)} NEAR`;
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
    return `${tgas}Tgas`;
  } catch (e) {
    // If parsing fails, return original value
    return gas;
  }
}
