import { Account } from '@near-js/accounts';
import { getSignerFromKeystore } from '@near-js/client';
import { KeyPairEd25519, PublicKey } from '@near-js/crypto';
import { InMemoryKeyStore, type KeyStore } from '@near-js/keystores';
import { JsonRpcProvider, type Provider } from '@near-js/providers';
import type { Signer } from '@near-js/signers';
import { actionCreators } from '@near-js/transactions';
import type { FinalExecutionOutcome } from '@near-js/types';
import { validateConfigs } from './config';
import {
  Shamir3PassUtils,
  ApplyServerLockRequest,
  RemoveServerLockRequest
} from './shamirWorker';
import type {
  AuthServiceConfig,
  AccountCreationRequest,
  AccountCreationResult,
  CreateAccountAndRegisterRequest,
  CreateAccountAndRegisterResult,
  NearExecutionFailure,
  NearReceiptOutcomeWithId,
  VerifyAuthenticationRequest,
  VerifyAuthenticationResponse,
  ApplyServerLockResponse,
  RemoveServerLockResponse,
} from './types';

/**
 * Framework-agnostic NEAR account service
 * Core business logic for account creation and registration operations
 */
export class AuthService {
  private config: AuthServiceConfig;
  private keyStore: KeyStore;
  private isInitialized = false;
  private rpcProvider: Provider;
  private relayerAccount: Account = null!;
  private signer: Signer = null!;

  // Transaction queue to prevent nonce conflicts
  private transactionQueue: Promise<any> = Promise.resolve();
  private queueStats = { pending: 0, completed: 0, failed: 0 };

  // Shamir 3-pass key management
  private shamir3pass: Shamir3PassUtils | null = null;

  constructor(config: AuthServiceConfig) {
    validateConfigs(config);
    this.config = {
      // Use defaults if not set
      relayerAccountId: config.relayerAccountId,
      relayerPrivateKey: config.relayerPrivateKey,
      webAuthnContractId: config.webAuthnContractId,
      nearRpcUrl: config.nearRpcUrl
        || 'https://rpc.testnet.near.org',
      networkId: config.networkId
        || 'testnet',
      accountInitialBalance: config.accountInitialBalance
        || '50000000000000000000000', // 0.05 NEAR
      createAccountAndRegisterGas: config.createAccountAndRegisterGas
        || '120000000000000', // 120 TGas
      shamir_p_b64u: config.shamir_p_b64u,
      shamir_e_s_b64u: config.shamir_e_s_b64u,
      shamir_d_s_b64u: config.shamir_d_s_b64u,
    };
    this.keyStore = new InMemoryKeyStore();
    this.rpcProvider = new JsonRpcProvider({ url: config.nearRpcUrl }) as Provider;
  }

  async getRelayerAccount(): Promise<Account> {
    await this._ensureSignerAndRelayerAccount();
    return this.relayerAccount;
  }

  private async _ensureSignerAndRelayerAccount(): Promise<void> {
    if (this.isInitialized) {
      return;
    }

    // Initialize Shamir3Pass WASM module (loads same worker wasm)
    if (!this.shamir3pass) {
      this.shamir3pass = new Shamir3PassUtils({
        p_b64u: this.config.shamir_p_b64u,
        e_s_b64u: this.config.shamir_e_s_b64u,
        d_s_b64u: this.config.shamir_d_s_b64u,
      });
    }

    const privateKeyString = this.config.relayerPrivateKey.substring(8);
    const keyPair = new KeyPairEd25519(privateKeyString);
    await this.keyStore.setKey(this.config.networkId, this.config.relayerAccountId, keyPair);

    this.signer = await getSignerFromKeystore(this.config.relayerAccountId, this.config.networkId, this.keyStore);
    this.relayerAccount = new Account(this.config.relayerAccountId, this.rpcProvider, this.signer);
    this.isInitialized = true;
    console.log(`
    AuthService initialized with:
    • networkId: ${this.config.networkId}
    • nearRpcUrl: ${this.config.nearRpcUrl}
    • relayerAccountId: ${this.config.relayerAccountId}
    • webAuthnContractId: ${this.config.webAuthnContractId}
    • accountInitialBalance: ${this.config.accountInitialBalance} (${this.formatYoctoToNear(this.config.accountInitialBalance)} NEAR)
    • createAccountAndRegisterGas: ${this.config.createAccountAndRegisterGas} (${this.formatGasToTGas(this.config.createAccountAndRegisterGas)})
    • shamir_p_b64u: ${this.config.shamir_p_b64u.slice(0, 10)}...
    • shamir_e_s_b64u: ${this.config.shamir_e_s_b64u.slice(0, 10)}...
    • shamir_d_s_b64u: ${this.config.shamir_d_s_b64u.slice(0, 10)}...
    `);
  }
  /**
   * Shamir 3-pass: apply server exponent (registration step)
   * @param kek_c_b64u - base64url-encoded KEK_c (client locked key encryption key)
   * @returns base64url-encoded KEK_cs (server locked key encryption key)
   */
  async applyServerLock(kek_c_b64u: string): Promise<ApplyServerLockResponse> {
    if (!this.shamir3pass) throw new Error('Shamir3Pass not initialized');
    return await this.shamir3pass.applyServerLock({ kek_c_b64u } as ApplyServerLockRequest);
  }

  /**
   * Shamir 3-pass: remove server exponent (login step)
   */
  async removeServerLock(kek_cs_b64u: string): Promise<RemoveServerLockResponse> {
    if (!this.shamir3pass) throw new Error('Shamir3Pass not initialized');
    return await this.shamir3pass.removeServerLock({ kek_cs_b64u } as RemoveServerLockRequest);
  }

  // Format NEAR gas (string) to TGas for display
  private formatGasToTGas(gasString: string): string {
    const gasAmount = BigInt(gasString);
    const tGas = Number(gasAmount) / 1e12;
    return `${tGas.toFixed(0)} TGas`;
  }

  // Convert yoctoNEAR to NEAR for display
  private formatYoctoToNear(yoctoAmount: string | bigint): string {
    const amount = typeof yoctoAmount === 'string' ? BigInt(yoctoAmount) : yoctoAmount;
    const nearAmount = Number(amount) / 1e24;
    return nearAmount.toFixed(3);
  }

  /**
   * Create a new account with the specified balance
   */
  async createAccount(request: AccountCreationRequest): Promise<AccountCreationResult> {
    await this._ensureSignerAndRelayerAccount();

    return this.queueTransaction(async () => {
      try {
        if (!this.isValidAccountId(request.accountId)) {
          throw new Error(`Invalid account ID format: ${request.accountId}`);
        }

        // Check if account already exists
        console.log(`Checking if account ${request.accountId} already exists...`);
        const accountExists = await this.checkAccountExists(request.accountId);
        if (accountExists) {
          throw new Error(`Account ${request.accountId} already exists. Cannot create duplicate account.`);
        }
        console.log(`Account ${request.accountId} is available for creation`);

        const initialBalance = BigInt(this.config.accountInitialBalance);
        const publicKey = PublicKey.fromString(request.publicKey);

        console.log(`Creating account: ${request.accountId}`);
        console.log(`Initial balance: ${initialBalance.toString()} yoctoNEAR`);

        // Create account using actionCreators
        const result: FinalExecutionOutcome = await this.relayerAccount.signAndSendTransaction({
          receiverId: request.accountId,
          actions: [
            actionCreators.createAccount(),
            actionCreators.transfer(initialBalance),
            actionCreators.addKey(publicKey, actionCreators.fullAccessKey()),
          ]
        });

        console.log(`Account creation completed: ${result.transaction.hash}`);
        const nearAmount = (Number(initialBalance) / 1e24).toFixed(6);
        return {
          success: true,
          transactionHash: result.transaction.hash,
          accountId: request.accountId,
          message: `Account ${request.accountId} created with ${nearAmount} NEAR initial balance`
        };

      } catch (error: any) {
        console.error(`Account creation failed for ${request.accountId}:`, error);
        return {
          success: false,
          error: error.message || 'Unknown account creation error',
          message: `Failed to create account ${request.accountId}: ${error.message}`
        };
      }
    }, `create account ${request.accountId}`);
  }

  /**
   * Create account and register user with WebAuthn in a single atomic transaction
   */
  async createAccountAndRegisterUser(request: CreateAccountAndRegisterRequest): Promise<CreateAccountAndRegisterResult> {
    await this._ensureSignerAndRelayerAccount();

    return this.queueTransaction(async () => {
      try {
        if (!this.isValidAccountId(request.new_account_id)) {
          throw new Error(`Invalid account ID format: ${request.new_account_id}`);
        }

        // Check if account already exists
        console.log(`Checking if account ${request.new_account_id} already exists...`);
        const accountExists = await this.checkAccountExists(request.new_account_id);
        if (accountExists) {
          throw new Error(`Account ${request.new_account_id} already exists. Cannot create duplicate account.`);
        }
        console.log(`Account ${request.new_account_id} is available for atomic creation and registration`);
        console.log(`Atomic registration for account: ${request.new_account_id}`);
        console.log(`Contract: ${this.config.webAuthnContractId}`);

        // Prepare contract arguments
        const contractArgs = {
          new_account_id: request.new_account_id,
          new_public_key: request.new_public_key,
          vrf_data: request.vrf_data,
          webauthn_registration: request.webauthn_registration,
          deterministic_vrf_public_key: request.deterministic_vrf_public_key,
          authenticator_options: request.authenticator_options,
        };

        // Call the contract's atomic function
        const result: FinalExecutionOutcome = await this.relayerAccount.signAndSendTransaction({
          receiverId: this.config.webAuthnContractId,
          actions: [
            actionCreators.functionCall(
              'create_account_and_register_user',
              contractArgs,
              BigInt(this.config.createAccountAndRegisterGas),
              BigInt(this.config.accountInitialBalance) // Initial balance
            )
          ]
        });

        // Parse contract execution results to detect failures
        const contractError = this.parseContractExecutionError(result, request.new_account_id);
        if (contractError) {
          console.error(`Contract execution failed for ${request.new_account_id}:`, contractError);
          throw new Error(contractError);
        }

        console.log(`Atomic registration completed: ${result.transaction.hash}`);
        return {
          success: true,
          transactionHash: result.transaction.hash,
          message: `Account ${request.new_account_id} created and registered successfully`,
          contractResult: result,
        };

      } catch (error: any) {
        console.error(`Atomic registration failed for ${request.new_account_id}:`, error);
        return {
          success: false,
          error: error.message || 'Unknown atomic registration error',
          message: `Failed to create and register account ${request.new_account_id}: ${error.message}`
        };
      }
    }, `atomic create and register ${request.new_account_id}`);
  }

  /**
   * Verify authentication response and issue JWT
   * Calls the web3authn contract's verify_authentication_response method
   * and issues a JWT or session credential upon successful verification
   */
  async verifyAuthenticationResponse(
    request: VerifyAuthenticationRequest
  ): Promise<VerifyAuthenticationResponse> {
    try {
      await this._ensureSignerAndRelayerAccount();

      // Call the contract's verify_authentication_response method
      const result = await this.relayerAccount.functionCall({
        contractId: this.config.webAuthnContractId,
        methodName: 'verify_authentication_response',
        args: {
          vrf_data: request.vrf_data,
          webauthn_authentication: request.webauthn_authentication,
        },
        gas: BigInt('30000000000000'), // 30 TGas
        attachedDeposit: BigInt('0'),
      });

      // Parse the contract response
      const contractResponse = this.parseContractResponse(result);

      if (contractResponse.verified) {
        // Generate JWT or session credential
        const jwt = this.generateJWT(request.vrf_data.user_id);

        return {
          success: true,
          verified: true,
          jwt,
          sessionCredential: {
            userId: request.vrf_data.user_id,
            issuedAt: new Date().toISOString(),
            expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(), // 24 hours
          },
          contractResponse,
        };
      } else {
        return {
          success: false,
          verified: false,
          error: 'Authentication verification failed',
          contractResponse,
        };
      }
    } catch (error: any) {
      const errorMessage = this.parseContractExecutionError(error, 'verification');
      return {
        success: false,
        verified: false,
        error: errorMessage || error.message || 'Verification failed',
      };
    }
  }

  /**
   * Generate a simple JWT token
   * In production, you'd want to use a proper JWT library with signing
   */
  private generateJWT(userId: string): string {
    const header = {
      alg: 'HS256',
      typ: 'JWT',
    };

    const payload = {
      sub: userId,
      iat: Math.floor(Date.now() / 1000),
      exp: Math.floor(Date.now() / 1000) + (24 * 60 * 60), // 24 hours
      iss: 'web3authn-sdk',
    };

    // Simple base64 encoding (in production, use proper JWT signing)
    const encodedHeader = btoa(JSON.stringify(header));
    const encodedPayload = btoa(JSON.stringify(payload));

    // For demo purposes, using a simple signature
    // In production, use a proper JWT library with HMAC or RSA signing
    const signature = btoa(`signature-${userId}-${Date.now()}`);

    return `${encodedHeader}.${encodedPayload}.${signature}`;
  }

  /**
   * Parse contract response from execution outcome
   */
  private parseContractResponse(result: FinalExecutionOutcome): any {
    try {
      // For now, return a basic success response
      // In a real implementation, you'd parse the actual contract response
      return {
        verified: true,
        success: true,
      };
    } catch (error) {
      return {
        verified: false,
        error: 'Failed to parse contract response',
      };
    }
  }

  /**
   * Parse contract execution results to detect specific failure types
   */
  private parseContractExecutionError(result: FinalExecutionOutcome, accountId: string): string | null {
    try {
      // Check main transaction status
      if (result.status && typeof result.status === 'object' && 'Failure' in result.status) {
        console.log(`Transaction failed:`, result.status.Failure);
        return `Transaction failed: ${JSON.stringify(result.status.Failure)}`;
      }

      // Check receipts for failures
      const receipts = (result.receipts_outcome || []) as NearReceiptOutcomeWithId[];
      for (const receipt of receipts) {
        const status = receipt.outcome?.status;

        if (status?.Failure) {
          const failure: NearExecutionFailure = status.Failure;
          console.log(`Receipt failure detected:`, failure);

          if (failure.ActionError?.kind) {
            const actionKind = failure.ActionError.kind;

            if (actionKind.AccountAlreadyExists) {
              return `Account ${actionKind.AccountAlreadyExists.accountId} already exists on NEAR network`;
            }

            if (actionKind.AccountDoesNotExist) {
              return `Referenced account ${actionKind.AccountDoesNotExist.account_id} does not exist`;
            }

            if (actionKind.InsufficientStake) {
              const stakeInfo = actionKind.InsufficientStake;
              return `Insufficient stake for account creation: ${stakeInfo.account_id}`;
            }

            if (actionKind.LackBalanceForState) {
              const balanceInfo = actionKind.LackBalanceForState;
              return `Insufficient balance for account state: ${balanceInfo.account_id}`;
            }

            return `Account creation failed: ${JSON.stringify(actionKind)}`;
          }

          return `Contract execution failed: ${JSON.stringify(failure)}`;
        }

        // Check logs for error keywords
        const logs = receipt.outcome?.logs || [];
        for (const log of logs) {
          if (typeof log === 'string') {
            if (log.includes('AccountAlreadyExists') || log.includes('account already exists')) {
              return `Account ${accountId} already exists`;
            }
            if (log.includes('AccountDoesNotExist')) {
              return `Referenced account does not exist`;
            }
            if (log.includes('Cannot deserialize the contract state')) {
              return `Contract state deserialization failed. This may be due to a contract upgrade. Please try again or contact support.`;
            }
            if (log.includes('GuestPanic')) {
              return `Contract execution panic: ${log}`;
            }
          }
        }
      }

      return null;

    } catch (parseError: any) {
      console.warn(`Error parsing contract execution results:`, parseError);
      return null;
    }
  }

  private isValidAccountId(accountId: string): boolean {
    if (!accountId || accountId.length < 2 || accountId.length > 64) {
      return false;
    }
    const validPattern = /^[a-z0-9_.-]+$/;
    return validPattern.test(accountId);
  }

  /**
   * Framework-agnostic: handle verify-authentication request
   * Converts a generic ServerRequest to ServerResponse using this service
   */
  async handleVerifyAuthenticationResponse(request: VerifyAuthenticationRequest): Promise<VerifyAuthenticationResponse> {
    return this.verifyAuthenticationResponse(request);
  }

  /**
   * Express-style middleware factory for verify-authentication
   */
  verifyAuthenticationMiddleware() {
    return async (req: any, res: any) => {
      try {
        if (!req?.body) {
          res.status(400).json({ error: 'Request body is required' });
          return;
        }
        const body: VerifyAuthenticationRequest = req.body;
        if (!body.vrf_data || !body.webauthn_authentication) {
          res.status(400).json({ error: 'vrf_data and webauthn_authentication are required' });
          return;
        }
        const result = await this.verifyAuthenticationResponse(body);
        res.status(result.success ? 200 : 400).json(result);
      } catch (error: any) {
        console.error('Error in verify authentication middleware:', error);
        res.status(500).json({ success: false, error: 'Internal server error', details: error?.message });
      }
    };
  }

  /**
   * Framework-agnostic Shamir 3-pass: apply server lock
   */
  async handleApplyServerLock(request: {
    body: { kek_c_b64u: string }
  }): Promise<{ status: number; headers: Record<string, string>; body: string }> {
    try {
      if (!request.body) {
        return {
          status: 400,
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ error: 'Missing body' })
        };
      }
      if (typeof request.body.kek_c_b64u !== 'string' || !request.body.kek_c_b64u) {
        return {
          status: 400,
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ error: 'kek_c_b64u required and must be a non-empty string' })
        };
      }
      const out = await this.applyServerLock(request.body.kek_c_b64u);
      return {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(out)
      };
    } catch (e: any) {
      return {
        status: 500,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ error: 'internal', details: e?.message })
      };
    }
  }

  /**
   * Framework-agnostic Shamir 3-pass: remove server lock
   */
  async handleRemoveServerLock(request: {
    body: { kek_cs_b64u: string }
  }): Promise<{ status: number; headers: Record<string, string>; body: string }> {
    try {
      if (!request.body) {
        return {
          status: 400,
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ error: 'Missing body' })
        };
      }
      if (typeof request.body.kek_cs_b64u !== 'string' || !request.body.kek_cs_b64u) {
        return {
          status: 400,
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ error: 'kek_cs_b64u required and must be a non-empty string' })
        };
      }
      const out = await this.removeServerLock(request.body.kek_cs_b64u);
      return {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(out)
      };
    } catch (e: any) {
      return {
        status: 500,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ error: 'internal', details: e?.message })
      };
    }
  }

  async checkAccountExists(accountId: string): Promise<boolean> {
    await this._ensureSignerAndRelayerAccount();
    try {
      await this.rpcProvider.query({
        request_type: 'view_account',
        finality: 'final',
        account_id: accountId,
      });
      return true;
    } catch (error: any) {
      if (error.type === 'AccountDoesNotExist' ||
          (error.cause && error.cause.name === 'UNKNOWN_ACCOUNT')) {
        return false;
      }
      console.error(`Error checking account existence for ${accountId}:`, error);
      throw error;
    }
  }

  /**
   * Queue transactions to prevent nonce conflicts
   */
  private async queueTransaction<T>(operation: () => Promise<T>, description: string): Promise<T> {
    this.queueStats.pending++;
    console.log(`[AuthService] Queueing: ${description} (pending: ${this.queueStats.pending})`);

    this.transactionQueue = this.transactionQueue
      .then(async () => {
        try {
          console.log(`[AuthService] Executing: ${description}`);
          const result = await operation();
          this.queueStats.completed++;
          this.queueStats.pending--;
          console.log(`[AuthService] Completed: ${description} (pending: ${this.queueStats.pending})`);
          return result;
        } catch (error: any) {
          this.queueStats.failed++;
          this.queueStats.pending--;
          console.error(`[AuthService] Failed: ${description} (failed: ${this.queueStats.failed}):`, error?.message);
          throw error;
        }
      })
      .catch((error) => {
        throw error;
      });

    return this.transactionQueue;
  }
}