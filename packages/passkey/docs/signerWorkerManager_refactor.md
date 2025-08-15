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
├── services/                     # Individual service modules
│   ├── WorkerService/            # Worker lifecycle management
│   ├── UserSettingsService/      # User preferences management
│   ├── ConfirmationService/      # Transaction confirmation UI
│   ├── PrfService/              # PRF operations
│   ├── TransactionService/       # Transaction signing operations
│   ├── RegistrationService/      # User registration operations
│   ├── RecoveryService/          # Account recovery operations
│   └── MessageService/           # Worker communication
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

#### D. PrfService
**Responsibility**: PRF operations and key derivation
```typescript
class PrfService {
  deriveNearKeypairAndEncrypt(credential: PublicKeyCredential, accountId: string): Promise<EncryptionResult>
  decryptPrivateKeyWithPrf(credential: PublicKeyCredential, accountId: string): Promise<DecryptionResult>
  extractPrfOutputs(credential: PublicKeyCredential): DualPrfOutputs
}
```

#### E. TransactionService
**Responsibility**: Transaction signing operations
```typescript
class TransactionService {
  signTransactionsWithActions(params: SignTransactionsParams): Promise<SignedTransaction[]>
  signTransactionWithKeyPair(params: SignWithKeyPairParams): Promise<SignedTransaction>
  signNep413Message(params: NEP413Params): Promise<NEP413Result>
}
```

#### F. RegistrationService
**Responsibility**: User registration operations
```typescript
class RegistrationService {
  checkCanRegisterUser(params: RegistrationCheckParams): Promise<RegistrationCheckResult>
  signVerifyAndRegisterUser(params: RegistrationParams): Promise<RegistrationResult>
}
```

#### G. RecoveryService
**Responsibility**: Account recovery operations
```typescript
class RecoveryService {
  recoverKeypairFromPasskey(credential: PublicKeyCredential): Promise<RecoveryResult>
}
```

#### H. MessageService
**Responsibility**: Worker message handling and response processing
```typescript
class MessageService {
  processWorkerResponse<T>(response: WorkerResponse<T>): ProcessedResponse<T>
  handleProgressUpdates(response: WorkerProgressResponse): void
  handleErrorResponse(response: WorkerErrorResponse): Error
}
```

### 3. Main SignerWorkerManager (Simplified)

The main class becomes a lightweight orchestrator:

```typescript
export class SignerWorkerManager {
  private workerService: WorkerService;
  private userSettingsService: UserSettingsService;
  private confirmationService: ConfirmationService;
  private prfService: PrfService;
  private transactionService: TransactionService;
  private registrationService: RegistrationService;
  private recoveryService: RecoveryService;
  private messageService: MessageService;

  constructor() {
    this.workerService = new WorkerService();
    this.userSettingsService = new UserSettingsService();
    this.confirmationService = new ConfirmationService();
    this.prfService = new PrfService(this.workerService, this.messageService);
    this.transactionService = new TransactionService(this.workerService, this.messageService);
    this.registrationService = new RegistrationService(this.workerService, this.messageService);
    this.recoveryService = new RecoveryService(this.workerService, this.messageService);
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

### 4. Benefits of This Refactoring

#### A. Maintainability
- **Single Responsibility**: Each service has one clear purpose
- **Easier Testing**: Services can be unit tested independently
- **Reduced Complexity**: Smaller, focused modules
- **Better Error Handling**: Service-specific error handling

#### B. Extensibility
- **Plugin Architecture**: New services can be added easily
- **Configuration**: Services can be configured independently
- **Feature Flags**: Services can be enabled/disabled per feature

#### C. Performance
- **Lazy Loading**: Services can be loaded on-demand
- **Memory Management**: Better resource cleanup
- **Parallel Processing**: Services can operate independently

#### D. Developer Experience
- **Clear API**: Each service has a well-defined interface
- **Better Documentation**: Smaller modules are easier to document
- **Code Reuse**: Services can be reused across different contexts



### 6. Testing Strategy

#### Unit Tests
- Each service has its own test suite
- Mock dependencies for isolated testing
- Test error conditions and edge cases

#### Integration Tests
- Test service interactions
- Test end-to-end workflows
- Test with real worker communication

#### Performance Tests
- Measure service initialization time
- Test memory usage patterns
- Benchmark critical operations

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

### 8. Error Handling Strategy

#### Service-Level Errors
- Each service defines its own error types
- Consistent error handling patterns
- Proper error propagation

#### Global Error Handling
- Centralized error logging
- User-friendly error messages
- Graceful degradation

### 9. Future Considerations

#### A. Plugin System
- Services can be dynamically loaded
- Third-party service extensions
- Feature-based service composition

#### B. Microservice Architecture
- Services could run in separate workers
- Distributed processing capabilities
- Better resource isolation

#### C. Performance Monitoring
- Service-level metrics
- Performance profiling
- Resource usage tracking

## Conclusion

This refactoring will transform the monolithic `SignerWorkerManager` into a well-structured, maintainable, and extensible system. The service-based architecture provides clear separation of concerns, better testability, and improved developer experience while maintaining the same public API for existing consumers.

The refactoring can be done incrementally, reducing risk and allowing for validation at each step. The end result will be a more robust, scalable, and maintainable codebase that can easily accommodate future requirements and improvements.