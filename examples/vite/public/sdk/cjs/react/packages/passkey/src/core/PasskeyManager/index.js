const require_accountIds = require('../types/accountIds.js');
const require_authenticatorOptions = require('../types/authenticatorOptions.js');
const require_deviceDetection = require('../../../../../deviceDetection.js');
const require_NearClient = require('../NearClient.js');
const require_actions = require('../types/actions.js');
const require_index = require('../WebAuthnManager/index.js');
const require_passkeyManager = require('../types/passkeyManager.js');
const require_registration = require('./registration.js');
const require_login = require('./login.js');
const require_actions$1 = require('./actions.js');
const require_recoverAccount = require('./recoverAccount.js');
const require_linkDevice = require('../types/linkDevice.js');
const require_linkDevice$1 = require('./linkDevice.js');
const require_scanDevice = require('./scanDevice.js');
const require_qrScanner = require('../../utils/qrScanner.js');
const require_signNEP413 = require('./signNEP413.js');
const require_client = require('../ServiceIframe/client.js');

//#region src/core/PasskeyManager/index.ts
/**
* Main PasskeyManager class that provides framework-agnostic passkey operations
* with flexible event-based callbacks for custom UX implementation
*/
var PasskeyManager = class {
	webAuthnManager;
	nearClient;
	configs;
	serviceClient = null;
	constructor(configs, nearClient) {
		this.configs = configs;
		this.nearClient = nearClient || new require_NearClient.MinimalNearClient(configs.nearRpcUrl);
		this.webAuthnManager = new require_index.WebAuthnManager(configs, this.nearClient);
	}
	/**
	* Direct access to user preferences manager for convenience
	* Example: passkeyManager.userPreferences.onThemeChange(cb)
	*/
	get userPreferences() {
		return this.webAuthnManager.getUserPreferences();
	}
	/**
	* Initialize the hidden wallet service iframe client (optional).
	* If `walletOrigin` is not provided in configs, this is a no‑op.
	*/
	async initServiceIframe() {
		if (!this.configs.walletOrigin) return;
		if (this.serviceClient) return;
		this.serviceClient = new require_client.ServiceIframeClient({
			walletOrigin: this.configs.walletOrigin,
			servicePath: this.configs.walletServicePath || "/service",
			theme: this.configs.walletTheme,
			nearRpcUrl: this.configs.nearRpcUrl,
			nearNetwork: this.configs.nearNetwork,
			contractId: this.configs.contractId,
			relayer: this.configs.relayer,
			vrfWorkerConfigs: this.configs.vrfWorkerConfigs
		});
		await this.serviceClient.init();
	}
	/** Get the service iframe client if initialized. */
	getServiceClient() {
		return this.serviceClient;
	}
	getContext() {
		return {
			webAuthnManager: this.webAuthnManager,
			nearClient: this.nearClient,
			configs: this.configs
		};
	}
	getNearClient() {
		return this.nearClient;
	}
	/**
	* View all access keys for a given account
	* @param accountId - NEAR account ID to view access keys for
	* @returns Promise resolving to access key list
	*/
	async viewAccessKeyList(accountId) {
		return this.nearClient.viewAccessKeyList(accountId);
	}
	/**
	* Register a new passkey for the given NEAR account ID
	* Uses AccountId for on-chain operations and PRF salt derivation
	*/
	async registerPasskey(nearAccountId, options) {
		return require_registration.registerPasskey(this.getContext(), require_accountIds.toAccountId(nearAccountId), options, this.configs.authenticatorOptions || require_authenticatorOptions.DEFAULT_AUTHENTICATOR_OPTIONS);
	}
	/**
	* Login with an existing passkey
	* Uses AccountId for on-chain operations and VRF operations
	*/
	async loginPasskey(nearAccountId, options) {
		await this.webAuthnManager.setCurrentUser(require_accountIds.toAccountId(nearAccountId));
		await this.webAuthnManager.setLastUser(require_accountIds.toAccountId(nearAccountId));
		return require_login.loginPasskey(this.getContext(), require_accountIds.toAccountId(nearAccountId), options);
	}
	/**
	* Logout: Clear VRF session (clear VRF keypair in worker)
	*/
	async logoutAndClearVrfSession() {
		return require_login.logoutAndClearVrfSession(this.getContext());
	}
	/**
	* Get comprehensive login state information
	* Uses AccountId for core account login state
	*/
	async getLoginState(nearAccountId) {
		return require_login.getLoginState(this.getContext(), nearAccountId ? require_accountIds.toAccountId(nearAccountId) : void 0);
	}
	/**
	* Get check if accountId has a passkey from IndexedDB
	*/
	async hasPasskeyCredential(nearAccountId) {
		const baseAccountId = require_accountIds.toAccountId(nearAccountId);
		return await this.webAuthnManager.hasPasskeyCredential(baseAccountId);
	}
	/**
	* Set confirmation behavior setting for the current user
	*/
	setConfirmBehavior(behavior) {
		this.webAuthnManager.getUserPreferences().setConfirmBehavior(behavior);
	}
	/**
	* Set the unified confirmation configuration
	*/
	setConfirmationConfig(config) {
		this.webAuthnManager.getUserPreferences().setConfirmationConfig(config);
	}
	setUserTheme(theme) {
		this.webAuthnManager.getUserPreferences().setUserTheme(theme);
	}
	/**
	* Get the current confirmation configuration
	*/
	getConfirmationConfig() {
		return this.webAuthnManager.getUserPreferences().getConfirmationConfig();
	}
	/**
	* Prefetch latest block height/hash (and nonce if context missing) to reduce
	* perceived latency when the user initiates a signing flow.
	*/
	async prefetchBlockheight() {
		try {
			await this.webAuthnManager.getNonceManager().prefetchBlockheight(this.nearClient);
		} catch {}
	}
	async getRecentLogins() {
		return require_login.getRecentLogins(this.getContext());
	}
	/**
	* Execute a NEAR blockchain action using passkey-derived credentials
	* Supports all NEAR action types: Transfer, FunctionCall, AddKey, etc.
	*
	* @param nearAccountId - NEAR account ID to execute action with
	* @param actionArgs - Action to execute (single action or array for batched transactions)
	* @param options - Action options for event handling
	* - onEvent: EventCallback<ActionSSEEvent> - Optional event callback
	* - onError: (error: Error) => void - Optional error callback
	* - hooks: OperationHooks - Optional operation hooks
	* - waitUntil: TxExecutionStatus - Optional waitUntil status
	* @returns Promise resolving to action result
	*
	* @example
	* ```typescript
	* // Basic transfer
	* const result = await passkeyManager.executeAction('alice.near', {
	*   type: ActionType.Transfer,
	*   receiverId: 'bob.near',
	*   amount: '1000000000000000000000000' // 1 NEAR
	* });
	*
	* // Function call with gas and deposit (already available in ActionArgs)
	* const result = await passkeyManager.executeAction('alice.near', {
	*   type: ActionType.FunctionCall,
	*   receiverId: 'contract.near',
	*   methodName: 'set_value',
	*   args: { value: 42 },
	*   gas: '50000000000000', // 50 TGas
	*   deposit: '100000000000000000000000' // 0.1 NEAR
	* });
	*
	* // Batched transaction
	* const result = await passkeyManager.executeAction('alice.near', [
	*   {
	*     type: ActionType.Transfer,
	*     receiverId: 'bob.near',
	*     amount: '1000000000000000000000000'
	*   },
	*   {
	*     type: ActionType.FunctionCall,
	*     receiverId: 'contract.near',
	*     methodName: 'log_transfer',
	*     args: { recipient: 'bob.near' }
	*   }
	* ], {
	*   onEvent: (event) => console.log('Action progress:', event)
	* });
	* ```
	*/
	async executeAction(args) {
		return require_actions$1.executeAction({
			context: this.getContext(),
			nearAccountId: require_accountIds.toAccountId(args.nearAccountId),
			receiverId: require_accountIds.toAccountId(args.receiverId),
			actionArgs: args.actionArgs,
			options: args.options
		});
	}
	/**
	* Sign and send multiple transactions with actions
	* This method signs transactions with actions and sends them to the network
	*
	* @param nearAccountId - NEAR account ID to sign and send transactions with
	* @param transactionInputs - Transaction inputs to sign and send
	* @param options - Sign and send transaction options
	* - onEvent: EventCallback<ActionSSEEvent> - Optional event callback
	* - onError: (error: Error) => void - Optional error callback
	* - hooks: OperationHooks - Optional operation hooks
	* - waitUntil: TxExecutionStatus - Optional waitUntil status
	* - executeSequentially: boolean - Wait for each transaction to finish before sending the next (default: true)
	* @returns Promise resolving to action results
	*
	* @example
	* ```typescript
	* // Sign and send multiple transactions in a batch
	* const results = await passkeyManager.signAndSendTransactions('alice.near', {
	*   transactions: [
	*     {
	*       receiverId: 'bob.near',
	*       actions: [{
	*         action_type: ActionType.Transfer,
	*         deposit: '1000000000000000000000000'
	*       }],
	*     },
	*     {
	*       receiverId: 'contract.near',
	*       actions: [{
	*         action_type: ActionType.FunctionCall,
	*         method_name: 'log_transfer',
	*         args: JSON.stringify({ recipient: 'bob.near' }),
	*         gas: '30000000000000',
	*         deposit: '0'
	*       }],
	*     }
	*   ],
	*   options: {
	*     onEvent: (event) => console.log('Signing and sending progress:', event)
	*     executeSequentially: true
	*   }
	* });
	* ```
	*/
	async signAndSendTransactions({ nearAccountId, transactions, options = { executeSequentially: true } }) {
		return require_actions$1.signAndSendTransactions({
			context: this.getContext(),
			nearAccountId: require_accountIds.toAccountId(nearAccountId),
			transactionInputs: transactions,
			options
		}).then((txResults) => {
			const txIds = txResults.map((txResult) => txResult.transactionId).join(", ");
			options?.onEvent?.({
				step: 9,
				phase: require_passkeyManager.ActionPhase.STEP_9_ACTION_COMPLETE,
				status: require_passkeyManager.ActionStatus.SUCCESS,
				message: `All transactions sent: ${txIds}`
			});
			return txResults;
		});
	}
	/**
	* Batch sign transactions (with actions), allows you to sign transactions
	* to different receivers with a single TouchID prompt.
	* This method does not broadcast transactions, use sendTransaction() to do that.
	*
	* This method fetches the current nonce and increments it for the next N transactions,
	* so you do not need to manually increment the nonce for each transaction.
	*
	* @param nearAccountId - NEAR account ID to sign transactions with
	* @param params - Transaction signing parameters
	* - @param params.transactions: Array of transaction objects with nearAccountId, receiverId, actions, and nonce
	* - @param params.onEvent: Optional progress event callback
	* @returns Promise resolving to signed transaction results
	*
	* @example
	* ```typescript
	* // Sign a single transaction
	* const signedTransactions = await passkeyManager.signTransactionsWithActions('alice.near', {
	*   transactions: [{
	*     receiverId: 'bob.near',
	*     actions: [{
	*       action_type: ActionType.Transfer,
	*       deposit: '1000000000000000000000000'
	*     }],
	*   }],
	*   onEvent: (event) => console.log('Signing progress:', event)
	* });
	*
	* // Sign multiple transactions in a batch
	* const signedTransactions = await passkeyManager.signTransactionsWithActions('alice.near', {
	*   transactions: [
	*     {
	*       receiverId: 'bob.near',
	*       actions: [{
	*         action_type: ActionType.Transfer,
	*         deposit: '1000000000000000000000000'
	*       }],
	*     },
	*     {
	*       receiverId: 'contract.near',
	*       actions: [{
	*         action_type: ActionType.FunctionCall,
	*         method_name: 'log_transfer',
	*         args: JSON.stringify({ recipient: 'bob.near' }),
	*         gas: '30000000000000',
	*         deposit: '0'
	*       }],
	*     }
	*   ]
	* });
	* ```
	*/
	async signTransactionsWithActions({ nearAccountId, transactions, options }) {
		if (this.serviceClient) {
			const txs = transactions.map((t) => ({
				receiverId: t.receiverId,
				actions: t.actions
			}));
			const result = await this.serviceClient.signTransactionsWithActions({
				nearAccountId,
				txSigningRequests: txs
			});
			return result?.signedTransactions || result || [];
		}
		return require_actions$1.signTransactionsWithActions({
			context: this.getContext(),
			nearAccountId: require_accountIds.toAccountId(nearAccountId),
			transactionInputs: transactions,
			options
		});
	}
	/**
	* Send a signed transaction to the NEAR network
	* This method broadcasts a previously signed transaction and waits for execution
	*
	* @param signedTransaction - The signed transaction to broadcast
	* @param waitUntil - The execution status to wait for (defaults to FINAL)
	* @returns Promise resolving to the transaction execution outcome
	*
	* @example
	* ```typescript
	* // Sign a transaction first
	* const signedTransactions = await passkeyManager.signTransactionsWithActions('alice.near', {
	*   transactions: [{
	*     receiverId: 'bob.near',
	*     actions: [{
	*       action_type: ActionType.Transfer,
	*       deposit: '1000000000000000000000000'
	*     }],
	*   }]
	* });
	*
	* // Then broadcast it
	* const result = await passkeyManager.sendTransaction(
	*   signedTransactions[0].signedTransaction,
	*   TxExecutionStatus.FINAL
	* );
	* console.log('Transaction ID:', result.transaction_outcome?.id);
	* ```
	*/
	async sendTransaction({ signedTransaction, options }) {
		return require_actions$1.sendTransaction({
			context: this.getContext(),
			signedTransaction,
			options
		}).then((txResult) => {
			options?.onEvent?.({
				step: 9,
				phase: require_passkeyManager.ActionPhase.STEP_9_ACTION_COMPLETE,
				status: require_passkeyManager.ActionStatus.SUCCESS,
				message: `Transaction ${txResult.transactionId} broadcasted`
			});
			return txResult;
		});
	}
	/**
	* Sign a NEP-413 message using the user's passkey-derived private key
	*
	* This function implements the NEP-413 standard for off-chain message signing:
	* - Creates a payload with message, recipient, nonce, and state
	* - Serializes using Borsh
	* - Adds NEP-413 prefix (2^31 + 413)
	* - Hashes with SHA-256
	* - Signs with Ed25519
	* - Returns base64-encoded signature
	*
	* @param nearAccountId - NEAR account ID to sign with
	* @param params - NEP-413 signing parameters
	* - message: string - The message to sign
	* - recipient: string - The recipient of the message
	* - state: string - Optional state parameter
	* @param options - Action options for event handling
	* - onEvent: EventCallback<ActionSSEEvent> - Optional event callback
	* - onError: (error: Error) => void - Optional error callback
	* - hooks: OperationHooks - Optional operation hooks
	* - waitUntil: TxExecutionStatus - Optional waitUntil status
	* @returns Promise resolving to signing result
	*
	* @example
	* ```typescript
	* const result = await passkeyManager.signNEP413Message('alice.near', {
	*   message: 'Hello World',
	*   recipient: 'app.example.com',
	*   state: 'optional-state'
	* });
	*
	* if (result.success) {
	*   console.log('Signature:', result.signature);
	*   console.log('Public key:', result.publicKey);
	* }
	* ```
	*/
	async signNEP413Message(args) {
		if (this.serviceClient) {
			const payload = {
				nearAccountId: args.nearAccountId,
				message: args.params.message,
				recipient: args.params.recipient,
				state: args.params.state
			};
			const result = await this.serviceClient.signNep413Message(payload);
			return result;
		}
		return require_signNEP413.signNEP413Message({
			context: this.getContext(),
			nearAccountId: require_accountIds.toAccountId(args.nearAccountId),
			params: args.params,
			options: args.options
		});
	}
	/**
	* Export key pair (both private and public keys)
	* Uses AccountId for consistent PRF salt derivation
	*/
	async exportNearKeypairWithTouchId(nearAccountId) {
		return await this.webAuthnManager.exportNearKeypairWithTouchId(require_accountIds.toAccountId(nearAccountId));
	}
	/**
	* Creates an AccountRecoveryFlow instance, for step-by-step account recovery UX
	*
	* @example
	* ```typescript
	* const flow = passkeyManager.startAccountRecoveryFlow();
	*
	* // Phase 1: Discover available accounts
	* const options = await flow.discover(); // Returns PasskeyOptionWithoutCredential[]
	*
	* // Phase 2: User selects account in UI
	* const selectedOption = await waitForUserSelection(options);
	*
	* // Phase 3: Execute recovery with secure credential lookup
	* const result = await flow.recover({
	*   credentialId: selectedOption.credentialId,
	*   accountId: selectedOption.accountId
	* });
	* console.log('Recovery state:', flow.getState());
	* ```
	*/
	startAccountRecoveryFlow(options) {
		return new require_recoverAccount.AccountRecoveryFlow(this.getContext(), options);
	}
	/**
	* Creates a LinkDeviceFlow instance for step-by-step device linking UX
	* for Device2 (the companion device is the one that generates the QR code)
	* Device1 (the original device) scans the QR code and executes the AddKey
	* and `store_device_linking_mapping` contract calls.
	*
	* @example
	* ```typescript
	*
	* // Device2: First generates a QR code and start polling
	* const device2Flow = passkeyManager.startDeviceLinkingFlow({ onEvent: ... });
	* const { qrData, qrCodeDataURL } = await device2Flow.generateQR('alice.near');
	*
	* // Device1: Scan QR and automatically link device
	* const device1Flow = passkeyManager.createScanQRCodeFlow({
	*   deviceLinkingOptions: {
	*     fundingAmount: '5000000000000000000000',
	*     onEvent: (event) => console.log('Device linking:', event)
	*   }
	* });
	* device1Flow.attachVideoElement(videoRef.current);
	* await device1Flow.start(); // Automatically links when QR is detected
	*
	* // Device2: Flow automatically completes when AddKey is detected
	* // it polls the chain for `store_device_linking_mapping` contract events
	* const state = device2Flow.getState();
	* ```
	*/
	startDeviceLinkingFlow(options) {
		return new require_linkDevice$1.LinkDeviceFlow(this.getContext(), options);
	}
	/**
	* Device1: Create a ScanQRCodeFlow for QR scanning with custom QR detection handling
	* Provides a flexible flow that scans for QR codes and calls your custom handler when detected
	*
	* @param options Configuration for device linking and QR scanning
	* @param options.deviceLinkingOptions Options for the device linking process (funding, callbacks)
	* @param options.scanQRCodeFlowOptions Optional QR scanning configuration (camera, timeout)
	* @param options.scanQRCodeFlowEvents Optional event handlers for scanning progress and QR detection
	*
	* @example
	* ```typescript
	* const flow = passkeyManager.createScanQRCodeFlow({
	*   deviceLinkingOptions: {
	*     fundingAmount: '5000000000000000000000', // 0.005 NEAR
	*     onEvent: (event) => console.log('Device linking event:', event),
	*     onError: (error) => console.error('Device linking error:', error)
	*   },
	*   scanQRCodeFlowOptions: {
	*     cameraId: 'camera1',
	*     timeout: 30000
	*   },
	*   scanQRCodeFlowEvents: {
	*     onQRDetected: async (qrData) => {
	*       // Handle QR detection - automatically link the device
	*       console.log('QR detected:', qrData);
	*       const result = await passkeyManager.linkDeviceWithQRCode(qrData, {
	*         fundingAmount: '5000000000000000000000',
	*         onEvent: (event) => console.log('Device linking:', event),
	*         onError: (error) => console.error('Linking error:', error)
	*       });
	*       console.log('Device linked successfully:', result);
	*     },
	*     onScanProgress: (duration) => console.log('Scanning for', duration, 'ms'),
	*     onCameraReady: (stream) => console.log('Camera ready')
	*   }
	* });
	*
	* // Attach to video element and start scanning
	* flow.attachVideoElement(videoRef.current);
	* await flow.start();
	*
	* // QR detection and device linking is handled by your onQRDetected callback
	* ```
	*/
	createScanQRCodeFlow(options) {
		return new require_qrScanner.ScanQRCodeFlow({
			cameraId: options?.scanQRCodeFlowOptions?.cameraId,
			cameraConfigs: {
				facingMode: require_deviceDetection.getOptimalCameraFacingMode(),
				...options?.cameraConfigs
			},
			timeout: 2e4
		}, {
			onQRDetected: (qrData) => {
				options?.scanQRCodeFlowEvents?.onQRDetected?.(qrData);
			},
			onError: (err) => {
				console.error("useQRCamera: QR scan error -", err);
				options?.scanQRCodeFlowEvents?.onError?.(err);
			},
			onCameraReady: (stream) => {
				options?.scanQRCodeFlowEvents?.onCameraReady?.(stream);
			},
			onScanProgress: (duration) => {
				options?.scanQRCodeFlowEvents?.onScanProgress?.(duration);
			}
		});
	}
	/**
	* Device1: Link device using pre-scanned QR data.
	* Either use a QR scanning library, or call this function in
	* the onQRDetected(qrData) => {} callback of createScanQRCodeFlow.
	*
	* @param qrData The QR data obtained from scanning Device2's QR code
	* @param options Device linking options including funding amount and event callbacks
	* @returns Promise that resolves to the linking result
	*
	* @example
	* ```typescript
	* // If you have QR data from somewhere else (not from createScanQRCodeFlow)
	* const qrData = await passkeyManager.scanQRCodeWithCamera();
	* const result = await passkeyManager.linkDeviceWithQRCode(qrData, {
	*   fundingAmount: '5000000000000000000000', // 0.005 NEAR
	*   onEvent: (event) => console.log('Device linking event:', event),
	*   onError: (error) => console.error('Device linking error:', error)
	* });
	* console.log('Device linked:', result);
	* ```
	*
	* Or with createScanQRCodeFlow:
	*
	* @example
	* ```typescript
	* const flow = passkeyManager.createScanQRCodeFlow({
	*   ...
	*   scanQRCodeFlowEvents: {
	*     onQRDetected: async (qrData) => {
	*       const result = await passkeyManager.linkDeviceWithQRCode(qrData, {
	*         fundingAmount: '5000000000000000000000',
	*         onEvent: (event) => console.log('Device linking:', event),
	*         onError: (error) => console.error('Linking error:', error)
	*       });
	*     },
	*     ...
	*   }
	* });
	* ```
	*/
	async linkDeviceWithQRCode(qrData, options) {
		return require_scanDevice.linkDeviceWithQRCode(this.getContext(), qrData, options);
	}
	/**
	* Delete a device key from an account
	*/
	async deleteDeviceKey(accountId, publicKeyToDelete, options) {
		const keysView = await this.nearClient.viewAccessKeyList(require_accountIds.toAccountId(accountId));
		if (keysView.keys.length <= 1) throw new Error("Cannot delete the last access key from an account");
		const keyToDelete = keysView.keys.find((k) => k.public_key === publicKeyToDelete);
		if (!keyToDelete) throw new Error(`Access key ${publicKeyToDelete} not found on account ${accountId}`);
		return this.executeAction({
			nearAccountId: accountId,
			receiverId: accountId,
			actionArgs: {
				type: require_actions.ActionType.DeleteKey,
				publicKey: publicKeyToDelete
			},
			options
		});
	}
};

//#endregion
exports.PasskeyManager = PasskeyManager;
//# sourceMappingURL=index.js.map