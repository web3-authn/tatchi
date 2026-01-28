import type { PasskeyManagerContext } from './index';
import type {
  ExtensionMigrationEvent,
  ExtensionMigrationOptions,
  ExtensionMigrationResult,
  ExtensionMigrationState,
  ExtensionMigrationStep,
} from '../types/extensionMigration';
import { ExtensionMigrationStatus, ExtensionMigrationStep as Step } from '../types/extensionMigration';
import { toAccountId } from '../types/accountIds';
import { toError } from '@/utils/errors';
import type { RegistrationResult } from '../types/tatchi';
import type { ActionSSEEvent } from '../types/sdkSentEvents';
import type { WalletIframeRouter } from '../WalletIframe/client/router';
import { ActionType } from '../types/actions';
import { ensureEd25519Prefix } from '@/utils/validation';
import { syncAuthenticatorsContractCall } from '../rpcCalls';

type ExtensionMigrationDeps = {
  getWebWalletRouter?: () => Promise<WalletIframeRouter | null>;
};

const sleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

export class ExtensionMigrationFlow {
  private readonly context: PasskeyManagerContext;
  private options: ExtensionMigrationOptions;
  private deps: ExtensionMigrationDeps;
  private extensionRegistration: RegistrationResult | null = null;
  private state: ExtensionMigrationState = {
    status: ExtensionMigrationStatus.IDLE,
    step: Step.IDLE,
    accountId: null,
    startedAt: undefined,
    updatedAt: undefined,
    message: undefined,
    error: undefined,
  };

  constructor(context: PasskeyManagerContext, options?: ExtensionMigrationOptions, deps?: ExtensionMigrationDeps) {
    this.context = context;
    this.options = options || {};
    this.deps = deps || {};
  }

  setOptions(next?: ExtensionMigrationOptions): void {
    if (!next) return;
    this.options = { ...this.options, ...next };
  }

  getState(): ExtensionMigrationState {
    return { ...this.state };
  }

  async start(args: { accountId: string; options?: ExtensionMigrationOptions }): Promise<ExtensionMigrationResult> {
    if (this.state.status === ExtensionMigrationStatus.RUNNING) {
      throw new Error('Extension migration is already running.');
    }
    const accountId = toAccountId(args.accountId);
    this.setOptions(args.options);

    const extensionOrigin = this.context.configs.iframeWallet?.extensionWalletOrigin || '';
    const webWalletOrigin = this.context.configs.iframeWallet?.walletOrigin || '';
    let extensionRouter: WalletIframeRouter | null = null;

    try {
      this.setState({
        status: ExtensionMigrationStatus.RUNNING,
        step: Step.PRECHECKS,
        accountId,
        message: 'Starting extension migration.',
      });
      this.emitEvent({
        step: Step.PRECHECKS,
        status: 'progress',
        message: 'Running prechecks before migration.',
        data: { extensionOrigin, webWalletOrigin },
      });

      if (!extensionOrigin) {
        throw new Error('Extension wallet origin is not configured. Set iframeWallet.extensionWalletOrigin to enable migration.');
      }

      extensionRouter = await this.createExtensionRouter({
        extensionOrigin,
        connectTimeoutMs: 10_000,
        requestTimeoutMs: 120_000,
      });
      await extensionRouter.init();

      // Best-effort reachability check against the extension wallet target.
      await this.checkExtensionReachability({
        router: extensionRouter,
        extensionOrigin,
        step: Step.PRECHECKS,
        successMessage: 'Extension wallet reachable.',
      });

      this.setState({
        status: ExtensionMigrationStatus.RUNNING,
        step: Step.REGISTER_EXTENSION_CREDENTIAL,
        message: 'Registering extension passkey.',
      });
      this.emitEvent({
        step: Step.REGISTER_EXTENSION_CREDENTIAL,
        status: 'progress',
        message: 'Creating a new passkey under the extension origin.',
      });

      const deviceNumber = await this.getNextDeviceNumberFromContract(accountId);
      this.emitEvent({
        step: Step.REGISTER_EXTENSION_CREDENTIAL,
        status: 'progress',
        message: `Using device number ${deviceNumber} for extension migration.`,
        data: { deviceNumber },
      });

      const registrationResult = await extensionRouter.prepareExtensionMigration({
        accountId,
        deviceNumber,
      });
      if (!registrationResult?.success) {
        throw new Error(registrationResult?.error || 'Extension passkey registration failed.');
      }
      this.extensionRegistration = registrationResult;
      this.emitEvent({
        step: Step.REGISTER_EXTENSION_CREDENTIAL,
        status: 'success',
        message: 'Extension passkey created.',
        data: {
          clientNearPublicKey: registrationResult.clientNearPublicKey ?? null,
          nearAccountId: registrationResult.nearAccountId ?? accountId,
        },
      });

      const extensionPublicKey = String(registrationResult.clientNearPublicKey || '').trim();
      if (!extensionPublicKey) {
        throw new Error('Extension passkey registration did not return a public key.');
      }

      this.setState({
        status: ExtensionMigrationStatus.RUNNING,
        step: Step.LINK_ON_CHAIN,
        message: 'Linking extension key to the existing account.',
      });
      this.emitEvent({
        step: Step.LINK_ON_CHAIN,
        status: 'progress',
        message: 'Adding the extension key on-chain using the web wallet.',
      });

      const linkResult = await this.linkExtensionKeyOnChain({
        accountId,
        publicKey: extensionPublicKey,
      });
      if (!linkResult?.success) {
        throw new Error(linkResult?.error || 'Failed to add extension key on-chain.');
      }
      this.emitEvent({
        step: Step.LINK_ON_CHAIN,
        status: 'success',
        message: 'Extension key added on-chain.',
        data: { transactionId: linkResult.transactionId ?? null },
      });

      this.emitEvent({
        step: Step.LINK_ON_CHAIN,
        status: 'progress',
        message: 'Finalizing extension device registration.',
      });
      const finalizeRes = await extensionRouter.finalizeExtensionMigration({ accountId });
      if (!finalizeRes?.success) {
        try {
          // Best-effort: wipe extension-scoped user data to avoid partial migration state.
          await extensionRouter.clearUserData(accountId);
        } catch {}

        throw new Error(finalizeRes?.error || 'Failed to finalize extension device registration.');
      }
      this.emitEvent({
        step: Step.LINK_ON_CHAIN,
        status: 'success',
        message: 'Extension device registration finalized.',
        data: { transactionId: finalizeRes.transactionId ?? null },
      });

      this.setState({
        status: ExtensionMigrationStatus.RUNNING,
        step: Step.CLEANUP,
        message: 'Saving extension preference.',
      });
      this.emitEvent({
        step: Step.CLEANUP,
        status: 'progress',
        message: 'Setting preference to use the extension wallet by default.',
      });
      this.applyExtensionPreference(accountId);
      this.emitEvent({
        step: Step.CLEANUP,
        status: 'success',
        message: 'Extension preference stored.',
      });

      await this.performOptionalCleanup({
        accountId,
        extensionPublicKey: extensionPublicKey,
      });

      try {
        await this.finalizeMigrationHealthCheck({
          accountId,
          extensionOrigin,
          router: extensionRouter,
          extensionPublicKey: extensionPublicKey,
        });
      } catch (error) {
        const err = toError(error);
        this.emitEvent({
          step: Step.CLEANUP,
          status: 'error',
          message: err.message,
        });
        try {
          this.revertExtensionPreference(accountId);
        } catch {}
        throw error;
      }

      this.setState({
        status: ExtensionMigrationStatus.COMPLETED,
        step: Step.COMPLETE,
        message: 'Extension key linked on-chain and preference updated.',
      });
      this.emitEvent({ step: Step.COMPLETE, status: 'success', message: this.state.message });

      await this.options.afterCall?.(true, { success: true, state: this.getState(), message: this.state.message });
      return { success: true, state: this.getState(), message: this.state.message };
    } catch (error) {
      this.handleError(error);
      throw error;
    } finally {
      if (extensionRouter) {
        try { extensionRouter.dispose({ removeIframe: true }); } catch {}
      }
    }
  }

  cancel(message = 'Extension migration cancelled.'): void {
    if (this.state.status === ExtensionMigrationStatus.COMPLETED || this.state.status === ExtensionMigrationStatus.IDLE) {
      return;
    }
    this.setState({
      status: ExtensionMigrationStatus.CANCELLED,
      step: Step.CLEANUP,
      message,
    });
    this.emitEvent({ step: Step.CLEANUP, status: 'error', message });
  }

  private setState(next: Partial<ExtensionMigrationState>): void {
    this.state = {
      ...this.state,
      ...next,
      updatedAt: Date.now(),
      startedAt: this.state.startedAt ?? Date.now(),
    };
  }

  private emitEvent(ev: ExtensionMigrationEvent): void {
    try {
      this.options.onEvent?.(ev);
    } catch {}
  }

  private handleError(error: unknown): void {
    const err = toError(error);
    this.setState({
      status: ExtensionMigrationStatus.ERROR,
      step: Step.ERROR,
      error: err.message,
    });
    this.emitEvent({ step: Step.ERROR, status: 'error', message: err.message });
    try {
      this.options.onError?.(err);
    } catch {}
    void this.options.afterCall?.(false);
  }

  private async checkExtensionReachability(params: {
    router?: WalletIframeRouter;
    extensionOrigin: string;
    step?: ExtensionMigrationStep;
    successMessage?: string;
  }): Promise<void> {
    const { extensionOrigin } = params;
    const step = params.step ?? Step.PRECHECKS;
    // Avoid heavy UI: run a quick ping via WalletIframeRouter with a short timeout.
    const router =
      params.router ||
      (await this.createExtensionRouter({
        extensionOrigin,
        connectTimeoutMs: 6_000,
        requestTimeoutMs: 10_000,
      }));
    try {
      if (!params.router) {
        await router.init();
      }
      try {
        await router.ping({ timeoutMs: 2_000 });
      } catch (error) {
        const err = toError(error);
        this.emitEvent({
          step,
          status: 'error',
          message: err.message || 'Extension wallet is unreachable.',
        });
        throw error;
      }

      const caps = await router.getCapabilities({ timeoutMs: 2_000 }).catch(() => null);
      this.emitEvent({
        step,
        status: 'success',
        message: params.successMessage || 'Extension wallet reachable.',
        data: {
          protocolVersion: caps?.protocolVersion ?? router.getProtocolVersion?.(),
          isChromeExtension: caps?.isChromeExtension,
          hasPrfExtension: caps?.hasPrfExtension,
        },
      });
    } finally {
      if (!params.router) {
        try { router.dispose({ removeIframe: true }); } catch {}
      }
    }
  }

  private async getNextDeviceNumberFromContract(accountId: string): Promise<number> {
    try {
      const authenticators = await syncAuthenticatorsContractCall(
        this.context.nearClient,
        this.context.configs.contractId,
        toAccountId(accountId)
      );
      const numbers = authenticators
        .map(({ authenticator }) => authenticator.deviceNumber)
        .filter((n): n is number => typeof n === 'number' && Number.isFinite(n));
      const max = numbers.length > 0 ? Math.max(...numbers) : 0;
      return max + 1;
    } catch {
      return 1;
    }
  }

  private async linkExtensionKeyOnChain(params: {
    accountId: string;
    publicKey: string;
  }) {
    const { router, shouldDispose } = await this.getWebWalletRouter();
    try {
      await router.init();
      const result = await router.executeAction({
        nearAccountId: params.accountId,
        receiverId: params.accountId,
        actionArgs: {
          type: ActionType.AddKey,
          publicKey: params.publicKey,
          accessKey: {
            nonce: 0,
            permission: 'FullAccess',
          },
        },
        options: {
          signerMode: this.context.configs.signerMode,
          // Migration is multi-step and can lose top-level user activation between awaits.
          // Force an explicit click inside the wallet iframe before WebAuthn starts.
          confirmationConfig: { uiMode: 'modal', behavior: 'requireClick', autoProceedDelay: 0 },
          confirmerText: {
            title: 'Link extension key',
            body: 'Approve adding your extension wallet key to this account.',
          },
          onEvent: (ev: ActionSSEEvent) => {
            this.emitEvent({
              step: Step.LINK_ON_CHAIN,
              status: ev.status,
              message: ev.message,
              data: { actionEvent: ev },
            });
          },
        },
      });
      if (!result?.success) {
        return result;
      }

      this.emitEvent({
        step: Step.LINK_ON_CHAIN,
        status: 'progress',
        message: 'Verifying the extension key on-chain.',
      });

      const verified = await this.verifyKeyOnChain({
        router,
        accountId: params.accountId,
        publicKey: params.publicKey,
      });
      if (!verified) {
        this.emitEvent({
          step: Step.LINK_ON_CHAIN,
          status: 'error',
          message: 'Extension key not found on-chain after AddKey.',
        });
        return {
          ...result,
          success: false,
          error: 'Failed to verify extension key on-chain after AddKey. The extension key was not removed automatically; you can retry migration or remove it manually if needed.',
        };
      }
      return result;
    } finally {
      if (shouldDispose) {
        try { router.dispose({ removeIframe: true }); } catch {}
      }
    }
  }

  private async getWebWalletRouter(): Promise<{ router: WalletIframeRouter; shouldDispose: boolean }> {
    if (this.deps.getWebWalletRouter) {
      const existing = await this.deps.getWebWalletRouter();
      if (existing) {
        return { router: existing, shouldDispose: false };
      }
    }
    const cfg = this.context.configs.iframeWallet;
    const webOrigin = cfg?.walletOrigin || '';
    if (!webOrigin) {
      throw new Error('Web wallet origin is not configured. Set iframeWallet.walletOrigin to add the extension key on-chain.');
    }
    const { WalletIframeRouter } = await import('../WalletIframe/client/router');
    const router = new WalletIframeRouter({
      walletOrigin: webOrigin,
      servicePath: cfg?.walletServicePath || '/wallet-service',
      connectTimeoutMs: 10_000,
      requestTimeoutMs: 60_000,
      signerMode: this.context.configs.signerMode,
      nearRpcUrl: this.context.configs.nearRpcUrl,
      nearNetwork: this.context.configs.nearNetwork,
      contractId: this.context.configs.contractId,
      nearExplorerUrl: this.context.configs.nearExplorerUrl,
      relayer: this.context.configs.relayer,
      vrfWorkerConfigs: this.context.configs.vrfWorkerConfigs,
      emailRecoveryContracts: this.context.configs.emailRecoveryContracts,
      sdkBasePath: cfg?.sdkBasePath,
    });
    return { router, shouldDispose: true };
  }

  private applyExtensionPreference(accountId: string): void {
    const prefs = this.context.webAuthnManager.getUserPreferences();
    prefs.setCurrentUser(toAccountId(accountId));
    prefs.setUseExtensionWallet(true);
  }

  private revertExtensionPreference(accountId: string): void {
    const prefs = this.context.webAuthnManager.getUserPreferences();
    prefs.setCurrentUser(toAccountId(accountId));
    prefs.setUseExtensionWallet(false);
  }

  private async performOptionalCleanup(args: { accountId: string; extensionPublicKey: string }): Promise<void> {
    const cleanup = this.options.cleanup;
    if (!cleanup || (!cleanup.removeOldKey && !cleanup.wipeWebWallet)) return;

    const { router, shouldDispose } = await this.getWebWalletRouter();
    try {
      await router.init();
      if (cleanup.removeOldKey) {
        const oldPublicKey = await this.resolveOldPublicKey({
          router,
          accountId: args.accountId,
          extensionPublicKey: args.extensionPublicKey,
          explicitOldKey: cleanup.oldPublicKey,
        });
        if (!oldPublicKey) {
          this.emitEvent({
            step: Step.CLEANUP,
            status: 'error',
            message: 'Old key cleanup skipped: unable to resolve the web-wallet public key.',
          });
        } else {
          const res = await this.deleteOldKey({
            router,
            accountId: args.accountId,
            publicKey: oldPublicKey,
          });
          if (!res.success) {
            this.emitEvent({
              step: Step.CLEANUP,
              status: 'error',
              message: res.error || 'Failed to remove the old web-wallet key.',
            });
          }
        }
      }

      if (cleanup.wipeWebWallet) {
        this.emitEvent({
          step: Step.CLEANUP,
          status: 'progress',
          message: 'Wiping web-wallet origin data.',
        });
        await router.clearUserData(args.accountId).catch((err) => {
          const msg = err instanceof Error ? err.message : String(err);
          this.emitEvent({
            step: Step.CLEANUP,
            status: 'error',
            message: `Failed to wipe web-wallet data: ${msg}`,
          });
        });
      }
    } finally {
      if (shouldDispose) {
        try { router.dispose({ removeIframe: true }); } catch {}
      }
    }
  }

  private async finalizeMigrationHealthCheck(args: {
    accountId: string;
    extensionOrigin: string;
    extensionPublicKey: string;
    router?: WalletIframeRouter;
  }): Promise<void> {
    this.emitEvent({
      step: Step.CLEANUP,
      status: 'progress',
      message: 'Running final extension health check.',
    });

    await this.checkExtensionReachability({
      router: args.router,
      extensionOrigin: args.extensionOrigin,
      step: Step.CLEANUP,
      successMessage: 'Extension wallet reachable after migration.',
    });

    const { router, shouldDispose } = await this.getWebWalletRouter();
    try {
      await router.init();
      const verified = await this.verifyKeyOnChain({
        router,
        accountId: args.accountId,
        publicKey: args.extensionPublicKey,
        attempts: 4,
        delayMs: 700,
      });
      if (!verified) {
        throw new Error('Extension key not found on-chain after migration.');
      }
    } finally {
      if (shouldDispose) {
        try { router.dispose({ removeIframe: true }); } catch {}
      }
    }

    this.emitEvent({
      step: Step.CLEANUP,
      status: 'success',
      message: 'Final extension health check passed.',
    });
  }

  private async verifyKeyOnChain(params: {
    router: WalletIframeRouter;
    accountId: string;
    publicKey: string;
    attempts?: number;
    delayMs?: number;
  }): Promise<boolean> {
    const expected = ensureEd25519Prefix(params.publicKey);
    if (!expected) return false;
    const attempts = Math.max(1, Math.floor(params.attempts ?? 5));
    const delayMs = Math.max(100, Math.floor(params.delayMs ?? 700));

    for (let i = 0; i < attempts; i++) {
      try {
        const accessKeyList = await params.router.viewAccessKeyList(params.accountId);
        const keys = accessKeyList.keys
          .map((k) => ensureEd25519Prefix(k.public_key))
          .filter(Boolean);
        if (keys.includes(expected)) return true;
      } catch {}
      if (i < attempts - 1) {
        await sleep(delayMs);
      }
    }
    return false;
  }

  private async resolveOldPublicKey(params: {
    router: WalletIframeRouter;
    accountId: string;
    extensionPublicKey: string;
    explicitOldKey?: string;
  }): Promise<string | null> {
    const normalizedExtension = ensureEd25519Prefix(params.extensionPublicKey);
    const explicit = params.explicitOldKey ? ensureEd25519Prefix(params.explicitOldKey) : null;
    if (explicit && explicit !== normalizedExtension) return explicit;
    if (explicit && explicit === normalizedExtension) return null;

    try {
      const session = await params.router.getLoginSession(params.accountId);
      const sessionKey = ensureEd25519Prefix(session?.login?.publicKey || '');
      if (sessionKey && sessionKey !== normalizedExtension) return sessionKey;
    } catch {}

    try {
      const accessKeyList = await params.router.viewAccessKeyList(params.accountId);
      const keys = accessKeyList.keys
        .map((k) => ensureEd25519Prefix(k.public_key))
        .filter(Boolean);
      const unique = Array.from(new Set(keys));
      if (unique.length === 2 && normalizedExtension) {
        const [a, b] = unique;
        if (a === normalizedExtension) return b || null;
        if (b === normalizedExtension) return a || null;
      }
    } catch {}

    return null;
  }

  private async deleteOldKey(params: {
    router: WalletIframeRouter;
    accountId: string;
    publicKey: string;
  }): Promise<{ success: boolean; error?: string }> {
    const normalized = ensureEd25519Prefix(params.publicKey);
    if (!normalized) {
      return { success: false, error: 'Invalid public key for cleanup.' };
    }
    this.emitEvent({
      step: Step.CLEANUP,
      status: 'progress',
      message: 'Removing the old web-wallet key.',
    });
    try {
      const res = await params.router.executeAction({
        nearAccountId: params.accountId,
        receiverId: params.accountId,
        actionArgs: {
          type: ActionType.DeleteKey,
          publicKey: normalized,
        },
        options: {
          signerMode: this.context.configs.signerMode,
          confirmerText: {
            title: 'Remove old key',
            body: 'Approve removing the old web-wallet key after migration.',
          },
          onEvent: (ev: ActionSSEEvent) => {
            this.emitEvent({
              step: Step.CLEANUP,
              status: ev.status,
              message: ev.message,
              data: { actionEvent: ev },
            });
          },
        },
      });
      return { success: !!res?.success, error: res?.error };
    } catch (error) {
      const err = toError(error);
      return { success: false, error: err.message };
    }
  }

  private async createExtensionRouter(params: {
    extensionOrigin: string;
    connectTimeoutMs: number;
    requestTimeoutMs: number;
  }) {
    const { WalletIframeRouter } = await import('../WalletIframe/client/router');
    const cfg = this.context.configs.iframeWallet;
    if (!cfg) {
      throw new Error('iframeWallet configs are required to reach the extension wallet.');
    }
    return new WalletIframeRouter({
      walletOrigin: params.extensionOrigin,
      servicePath: cfg.extensionWalletServicePath || '/wallet-service.html',
      connectTimeoutMs: params.connectTimeoutMs,
      requestTimeoutMs: params.requestTimeoutMs,
      signerMode: this.context.configs.signerMode,
      nearRpcUrl: this.context.configs.nearRpcUrl,
      nearNetwork: this.context.configs.nearNetwork,
      contractId: this.context.configs.contractId,
      nearExplorerUrl: this.context.configs.nearExplorerUrl,
      relayer: this.context.configs.relayer,
      vrfWorkerConfigs: this.context.configs.vrfWorkerConfigs,
      emailRecoveryContracts: this.context.configs.emailRecoveryContracts,
      sdkBasePath: cfg.sdkBasePath,
    });
  }
}
