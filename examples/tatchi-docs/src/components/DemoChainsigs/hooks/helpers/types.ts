import type { TransactionRequest } from 'viem';

export type EVMUnsignedTransaction = TransactionRequest & {
  type: 'eip1559';
  chainId: number;
};

