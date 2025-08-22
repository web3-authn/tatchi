# SignerWorkerManager Refactoring Plan

## Current State Analysis

The `SignerWorkerManager` class has grown to **1,375 lines** and handles multiple distinct responsibilities, making it difficult to maintain and test. The current module contains:

### Current Responsibilities
1. **Worker Management**: Creating and managing Web Workers
2. **User Settings Management**: Loading/saving confirmation preferences to IndexedDB
3. **Secure Confirmation UI**: Handling transaction confirmation flows
4. **PRF Operations**: Dual PRF key derivation and encryption
5. **Transaction Signing**: Multiple transaction signing methods
6. **Registration Operations**: User registration and verification
7. **Key Recovery**: Account recovery operations
8. **NEP-413 Signing**: Message signing operations
9. **COSE Operations**: Public key extraction
10. **Message Handling**: Worker communication and response processing

### Current Issues
- **Single Responsibility Principle Violation**: One class handles 10+ distinct concerns
- **High Coupling**: All operations are tightly coupled within one class
- **Difficult Testing**: Large class makes unit testing complex
- **Maintenance Overhead**: Changes to one feature affect the entire module
- **Code Duplication**: Similar patterns repeated across different operations
- **Complex Dependencies**: Many imports and dependencies in one file

## Proposed Refactoring Strategy

### 1. Core Architecture: Service-Based Pattern


```
src/core/WebAuthnManager/
├── SignerWorkerManager/           # Main orchestrator (simplified)
│   ├── index.ts                  # Main class (orchestrates services)
│   ├── types.ts                  # Shared types and interfaces
│   └── constants.ts              # Configuration constants
├── services/                     # Core service modules
│   ├── WorkerService/            # Worker lifecycle & communication
│   ├── UserSettingsService/      # User preferences & IndexedDB
│   └── ConfirmationService/      # Transaction confirmation UI
└── utils/                        # Shared utilities
    ├── responseHandlers.ts       # Worker response processing
    ├── validation.ts             # Input validation
    └── serialization.ts          # Data serialization helpers
```

### 2. Service Decomposition

#### A. WorkerService
**Responsibility**: Worker lifecycle and communication
```typescript
class WorkerService {
  createWorker(): Worker
  sendMessage<T>(message: WorkerMessage<T>): Promise<WorkerResponse<T>>
  handleWorkerError(error: Error): void
  terminateWorker(worker: Worker): void
}
```

#### B. UserSettingsService
**Responsibility**: User preferences management
```typescript
class UserSettingsService {
  loadSettings(accountId: string): Promise<UserSettings>
  saveSettings(accountId: string, settings: Partial<UserSettings>): Promise<void>
  getDefaultSettings(): UserSettings
}
```

#### C. ConfirmationService
**Responsibility**: Transaction confirmation UI and flow
```typescript
class ConfirmationService {
  handleSecureConfirmRequest(message: SecureConfirmMessage): Promise<SecureConfirmDecision>
  renderConfirmationUI(summary: TransactionSummary): Promise<boolean>
  parseTransactionSummary(data: any): TransactionSummary
}
```

### 2. Service Responsibilities

#### A. WorkerService
**Responsibility**: Worker lifecycle, communication, and message handling
```typescript
class WorkerService {
  createWorker(): Worker
  sendMessage<T>(message: WorkerMessage<T>): Promise<WorkerResponse<T>>
  handleWorkerError(error: Error): void
  terminateWorker(worker: Worker): void
  processWorkerResponse<T>(response: WorkerResponse<T>): ProcessedResponse<T>
  handleProgressUpdates(response: WorkerProgressResponse): void
  handleErrorResponse(response: WorkerErrorResponse): Error
}
```

#### B. UserSettingsService
**Responsibility**: User preferences management and IndexedDB operations
```typescript
class UserSettingsService {
  loadSettings(accountId: string): Promise<UserSettings>
  saveSettings(accountId: string, settings: Partial<UserSettings>): Promise<void>
  getDefaultSettings(): UserSettings
  getAuthenticatorsByUser(accountId: string): Promise<Authenticator[]>
}
```

#### C. ConfirmationService
**Responsibility**: Transaction confirmation UI, PRF operations, and credential handling
```typescript
class ConfirmationService {
  handleSecureConfirmRequest(message: SecureConfirmMessage): Promise<SecureConfirmDecision>
  renderConfirmationUI(summary: TransactionSummary): Promise<boolean>
  parseTransactionSummary(data: any): TransactionSummary
  extractPrfOutputs(credential: PublicKeyCredential): DualPrfOutputs
  deriveNearKeypairAndEncrypt(credential: PublicKeyCredential, accountId: string): Promise<EncryptionResult>
  decryptPrivateKeyWithPrf(credential: PublicKeyCredential, accountId: string): Promise<DecryptionResult>
}
```

### 3. Main SignerWorkerManager (Simplified)

The main class becomes a lightweight orchestrator with just 3 core services:

```typescript
export class SignerWorkerManager {
  private workerService: WorkerService;
  private userSettingsService: UserSettingsService;
  private confirmationService: ConfirmationService;

  constructor() {
    this.workerService = new WorkerService();
    this.userSettingsService = new UserSettingsService();
    this.confirmationService = new ConfirmationService(this.workerService, this.userSettingsService);
    this.messageService = new MessageService();
  }

  // Public API methods delegate to appropriate services
  async deriveNearKeypairAndEncrypt(...args) {
    return this.prfService.deriveNearKeypairAndEncrypt(...args);
  }

  async signTransactionsWithActions(...args) {
    return this.transactionService.signTransactionsWithActions(...args);
  }

  setPreConfirmFlow(enabled: boolean) {
    this.userSettingsService.saveSettings(this.currentUser, { usePreConfirmFlow: enabled });
  }
}
```

### 7. Configuration Management

```typescript
// services/config.ts
export interface ServiceConfig {
  worker: {
    url: string;
    type: 'module' | 'classic';
    timeout: number;
  };
  confirmation: {
    defaultMode: 'shadow' | 'native' | 'iframe';
    autoProceedDelay: number;
  };
  prf: {
    defaultAlgorithm: 'chacha20' | 'ed25519';
  };
}
```
