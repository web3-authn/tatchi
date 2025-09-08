const require_rpc = require('./types/rpc.js');
const require_actions = require('./types/actions.js');
const require_passkeyManager = require('./types/passkeyManager.js');

//#region src/core/rpcCalls.ts
/**
* Query the contract to get the account linked to a device public key
* Used in device linking flow to check if a device key has been added
*
* NEAR does not provide a way to lookup the AccountID an access key has access to.
* So we store a temporary mapping in the contract to lookup pubkey -> account ID.
*/
async function getDeviceLinkingAccountContractCall(nearClient, contractId, devicePublicKey) {
	try {
		const result = await nearClient.callFunction(contractId, "get_device_linking_account", { device_public_key: devicePublicKey });
		if (result && Array.isArray(result) && result.length >= 2) {
			const [linkedAccountId, deviceNumber] = result;
			return {
				linkedAccountId,
				deviceNumber
			};
		}
		return null;
	} catch (error) {
		console.warn("Failed to get device linking account:", error.message);
		return null;
	}
}
/**
* Execute device1's linking transactions (AddKey + Contract mapping)
* This function signs and broadcasts both transactions required for device linking
*/
async function executeDeviceLinkingContractCalls({ context, device1AccountId, device2PublicKey, nextNonce, nextNextNonce, nextNextNextNonce, txBlockHash, vrfChallenge, onEvent }) {
	const signedTransactions = await context.webAuthnManager.signTransactionsWithActions({
		rpcCall: {
			contractId: context.webAuthnManager.passkeyManagerConfigs.contractId,
			nearRpcUrl: context.webAuthnManager.passkeyManagerConfigs.nearRpcUrl,
			nearAccountId: device1AccountId
		},
		transactions: [
			{
				receiverId: device1AccountId,
				actions: [{
					action_type: require_actions.ActionType.AddKey,
					public_key: device2PublicKey,
					access_key: JSON.stringify({ permission: { FullAccess: {} } })
				}],
				nonce: nextNonce
			},
			{
				receiverId: context.webAuthnManager.passkeyManagerConfigs.contractId,
				actions: [{
					action_type: require_actions.ActionType.FunctionCall,
					method_name: "store_device_linking_mapping",
					args: JSON.stringify({
						device_public_key: device2PublicKey,
						target_account_id: device1AccountId
					}),
					gas: "30000000000000",
					deposit: "0"
				}],
				nonce: nextNextNonce
			},
			{
				receiverId: device1AccountId,
				actions: [{
					action_type: require_actions.ActionType.DeleteKey,
					public_key: device2PublicKey
				}],
				nonce: nextNextNextNonce
			}
		],
		onEvent: (progress) => {
			if (progress.phase == require_passkeyManager.ActionPhase.STEP_7_TRANSACTION_SIGNING_COMPLETE) onEvent?.({
				step: 3,
				phase: require_passkeyManager.DeviceLinkingPhase.STEP_3_AUTHORIZATION,
				status: require_passkeyManager.DeviceLinkingStatus.SUCCESS,
				message: `Transactions signed`
			});
		}
	});
	if (!signedTransactions[0].signedTransaction) throw new Error("AddKey transaction signing failed");
	if (!signedTransactions[1].signedTransaction) throw new Error("Contract mapping transaction signing failed");
	if (!signedTransactions[2].signedTransaction) throw new Error("DeleteKey transaction signing failed");
	let addKeyTxResult;
	let storeDeviceLinkingTxResult;
	try {
		console.log("LinkDeviceFlow: Broadcasting AddKey transaction...");
		console.log("LinkDeviceFlow: AddKey transaction details:", {
			receiverId: signedTransactions[0].signedTransaction.transaction.receiverId,
			actions: JSON.parse(signedTransactions[0].signedTransaction.transaction.actionsJson || "[]"),
			transactionKeys: Object.keys(signedTransactions[0].signedTransaction.transaction)
		});
		addKeyTxResult = await context.nearClient.sendTransaction(signedTransactions[0].signedTransaction, require_rpc.DEFAULT_WAIT_STATUS.linkDeviceAddKey);
		console.log("LinkDeviceFlow: AddKey transaction result:", addKeyTxResult?.transaction?.hash);
		onEvent?.({
			step: 3,
			phase: require_passkeyManager.DeviceLinkingPhase.STEP_3_AUTHORIZATION,
			status: require_passkeyManager.DeviceLinkingStatus.SUCCESS,
			message: `AddKey transaction completed successfully!`
		});
		const contractTx = signedTransactions[1].signedTransaction;
		console.log("LinkDeviceFlow: Contract mapping transaction details:", {
			receiverId: contractTx.transaction.receiverId,
			actions: JSON.parse(contractTx.transaction.actionsJson || "[]").length
		});
		storeDeviceLinkingTxResult = await context.nearClient.sendTransaction(contractTx, require_rpc.DEFAULT_WAIT_STATUS.linkDeviceAccountMapping);
	} catch (txError) {
		console.error("LinkDeviceFlow: Transaction broadcasting failed:", txError);
		throw new Error(`Transaction broadcasting failed: ${txError.message}`);
	}
	console.log("LinkDeviceFlow: Sending final success event...");
	onEvent?.({
		step: 6,
		phase: require_passkeyManager.DeviceLinkingPhase.STEP_6_REGISTRATION,
		status: require_passkeyManager.DeviceLinkingStatus.SUCCESS,
		message: `Device linking completed successfully!`
	});
	return {
		addKeyTxResult,
		storeDeviceLinkingTxResult,
		signedDeleteKeyTransaction: signedTransactions[2].signedTransaction
	};
}
/**
* Get credential IDs associated with an account from the contract
* Used in account recovery to discover available credentials
*/
async function getCredentialIdsContractCall(nearClient, contractId, accountId) {
	try {
		const credentialIds = await nearClient.callFunction(contractId, "get_credential_ids_by_account", { account_id: accountId });
		return credentialIds || [];
	} catch (error) {
		console.warn("Failed to fetch credential IDs from contract:", error.message);
		return [];
	}
}
/**
* Get all authenticators stored for a user from the contract
* Used in account recovery to sync authenticator data
*/
async function getAuthenticatorsByUser(nearClient, contractId, accountId) {
	try {
		const authenticatorsResult = await nearClient.view({
			account: contractId,
			method: "get_authenticators_by_user",
			args: { user_id: accountId }
		});
		if (authenticatorsResult && Array.isArray(authenticatorsResult)) return authenticatorsResult;
		return [];
	} catch (error) {
		console.warn("Failed to fetch authenticators from contract:", error.message);
		return [];
	}
}
async function syncAuthenticatorsContractCall(nearClient, contractId, accountId) {
	try {
		const authenticatorsResult = await getAuthenticatorsByUser(nearClient, contractId, accountId);
		if (authenticatorsResult && Array.isArray(authenticatorsResult)) return authenticatorsResult.map(([credentialId, contractAuthenticator]) => {
			console.log(`Contract authenticator device_number for ${credentialId}:`, contractAuthenticator.device_number);
			return {
				credentialId,
				authenticator: {
					credentialId,
					credentialPublicKey: new Uint8Array(contractAuthenticator.credential_public_key),
					transports: contractAuthenticator.transports,
					userId: accountId,
					name: `Device ${contractAuthenticator.device_number} Authenticator`,
					registered: new Date(parseInt(contractAuthenticator.registered)),
					deviceNumber: contractAuthenticator.device_number,
					vrfPublicKeys: contractAuthenticator.vrf_public_keys
				}
			};
		});
		return [];
	} catch (error) {
		console.warn("Failed to fetch authenticators from contract:", error.message);
		return [];
	}
}

//#endregion
exports.executeDeviceLinkingContractCalls = executeDeviceLinkingContractCalls;
exports.getCredentialIdsContractCall = getCredentialIdsContractCall;
exports.getDeviceLinkingAccountContractCall = getDeviceLinkingAccountContractCall;
exports.syncAuthenticatorsContractCall = syncAuthenticatorsContractCall;
//# sourceMappingURL=rpcCalls.js.map