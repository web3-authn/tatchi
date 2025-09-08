const require_base64 = require('../utils/base64.js');
const require_rpc = require('./types/rpc.js');

//#region src/core/NearClient.ts
let RpcCallType = /* @__PURE__ */ function(RpcCallType$1) {
	RpcCallType$1["Query"] = "query";
	RpcCallType$1["View"] = "view";
	RpcCallType$1["Send"] = "send_tx";
	RpcCallType$1["Block"] = "block";
	RpcCallType$1["Call"] = "call_function";
	return RpcCallType$1;
}({});
var SignedTransaction = class {
	transaction;
	signature;
	borsh_bytes;
	constructor(data) {
		this.transaction = data.transaction;
		this.signature = data.signature;
		this.borsh_bytes = data.borsh_bytes;
	}
	encode() {
		return new Uint8Array(this.borsh_bytes).buffer;
	}
	base64Encode() {
		return require_base64.base64Encode(this.encode());
	}
	static decode(bytes) {
		throw new Error("SignedTransaction.decode(): borsh deserialization not implemented");
	}
};
var MinimalNearClient = class {
	rpcUrl;
	constructor(rpcUrl) {
		this.rpcUrl = rpcUrl;
	}
	/**
	* Execute RPC call with proper error handling and result extraction
	*/
	async makeRpcCall(method, params, operationName) {
		const body = {
			jsonrpc: "2.0",
			id: crypto.randomUUID(),
			method,
			params
		};
		const response = await fetch(this.rpcUrl, {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify(body)
		}).catch((e) => {
			console.error(e);
			throw new Error(e);
		});
		if (!response.ok) throw new Error(`RPC request failed: ${response.status} ${response.statusText}`);
		const responseText = await response.text();
		if (!responseText?.trim()) throw new Error("Empty response from RPC server");
		const result = JSON.parse(responseText);
		if (result.error) throw result.error;
		if (result.result?.error) throw new Error(`${operationName} Error: ${result.result.error}`);
		return result.result;
	}
	async query(params) {
		return this.makeRpcCall(RpcCallType.Query, params, "Query");
	}
	async viewAccessKey(accountId, publicKey, finalityQuery) {
		const publicKeyStr = typeof publicKey === "string" ? publicKey : publicKey.toString();
		const finality = finalityQuery?.finality || "final";
		const params = {
			request_type: "view_access_key",
			finality,
			account_id: accountId,
			public_key: publicKeyStr
		};
		return this.makeRpcCall(RpcCallType.Query, params, "View Access Key");
	}
	async viewAccessKeyList(accountId, finalityQuery) {
		const finality = finalityQuery?.finality || "final";
		const params = {
			request_type: "view_access_key_list",
			finality,
			account_id: accountId
		};
		return this.makeRpcCall(RpcCallType.Query, params, "View Access Key List");
	}
	async viewAccount(accountId) {
		const params = {
			request_type: "view_account",
			finality: "final",
			account_id: accountId
		};
		return this.makeRpcCall(RpcCallType.Query, params, "View Account");
	}
	async viewBlock(params) {
		return this.makeRpcCall(RpcCallType.Block, params, "View Block");
	}
	async sendTransaction(signedTransaction, waitUntil = require_rpc.DEFAULT_WAIT_STATUS.executeAction) {
		return await this.makeRpcCall(RpcCallType.Send, {
			signed_tx_base64: signedTransaction.base64Encode(),
			wait_until: waitUntil
		}, "Send Transaction");
	}
	async callFunction(contractId, method, args, blockQuery) {
		const rpcParams = {
			request_type: "call_function",
			finality: "final",
			account_id: contractId,
			method_name: method,
			args_base64: require_base64.base64Encode(new TextEncoder().encode(JSON.stringify(args)).buffer)
		};
		const result = await this.makeRpcCall(RpcCallType.Query, rpcParams, "View Function");
		const resultBytes = result.result;
		if (!Array.isArray(resultBytes)) return result;
		const resultString = String.fromCharCode(...resultBytes);
		if (!resultString.trim()) return null;
		try {
			const parsed = JSON.parse(resultString);
			return parsed;
		} catch (parseError) {
			console.warn("Failed to parse result as JSON, returning as string:", parseError);
			console.warn("Raw result string:", resultString);
			const cleanString = resultString.replace(/^"|"$/g, "");
			return cleanString;
		}
	}
	async view(params) {
		return this.callFunction(params.account, params.method, params.args);
	}
	async getAccessKeys({ account, block_id }) {
		const params = {
			request_type: "view_access_key_list",
			account_id: account,
			finality: "final"
		};
		if (block_id) {
			params.block_id = block_id;
			delete params.finality;
		}
		const accessKeyList = await this.makeRpcCall(RpcCallType.Query, params, "View Access Key List");
		const fullAccessKeys = [];
		const functionCallAccessKeys = [];
		for (const key of accessKeyList.keys) if (key.access_key.permission === "FullAccess") fullAccessKeys.push(key);
		else if (key.access_key.permission && typeof key.access_key.permission === "object" && "FunctionCall" in key.access_key.permission) functionCallAccessKeys.push(key);
		return {
			fullAccessKeys,
			functionCallAccessKeys
		};
	}
};

//#endregion
exports.MinimalNearClient = MinimalNearClient;
exports.SignedTransaction = SignedTransaction;
//# sourceMappingURL=NearClient.js.map