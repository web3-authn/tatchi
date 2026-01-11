import { isString } from '@/utils/validation';

// Format NEAR gas (string) to TGas for display in logs.
export function formatGasToTGas(gasString: string): string {
  const gasAmount = BigInt(gasString);
  const tGas = Number(gasAmount) / 1e12;
  return `${tGas.toFixed(0)} TGas`;
}

// Convert yoctoNEAR to NEAR for display in logs.
export function formatYoctoToNear(yoctoAmount: string | bigint): string {
  const amount = isString(yoctoAmount) ? BigInt(yoctoAmount) : yoctoAmount;
  const nearAmount = Number(amount) / 1e24;
  return nearAmount.toFixed(3);
}
