
//#region src/server/core/verifyAuthenticationHandler.ts
/**
* Handle verify authentication response requests
*/
async function handleVerifyAuthenticationResponse(request, authService) {
	try {
		if (!request.body) return {
			status: 400,
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({ error: "Request body is required" })
		};
		const body = JSON.parse(request.body);
		if (!body.vrf_data || !body.webauthn_authentication) return {
			status: 400,
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({ error: "vrf_data and webauthn_authentication are required" })
		};
		const result = await authService.verifyAuthenticationResponse(body);
		return {
			status: result.success ? 200 : 400,
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify(result)
		};
	} catch (error) {
		console.error("Error in verify authentication handler:", error);
		return {
			status: 500,
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({
				success: false,
				error: "Internal server error",
				details: error.message
			})
		};
	}
}
/**
* Express.js middleware for verify authentication response
* Usage: app.post('/verify-authentication-response', verifyAuthenticationMiddleware(authService))
*/
function verifyAuthenticationMiddleware(authService) {
	return async (req, res) => {
		const serverRequest = {
			method: req.method,
			url: req.url,
			headers: req.headers,
			body: JSON.stringify(req.body)
		};
		const result = await authService.handleVerifyAuthenticationResponse(JSON.parse(serverRequest.body));
		res.status(result.success ? 200 : 400).json(result);
	};
}

//#endregion
exports.handleVerifyAuthenticationResponse = handleVerifyAuthenticationResponse;
exports.verifyAuthenticationMiddleware = verifyAuthenticationMiddleware;
//# sourceMappingURL=verifyAuthenticationHandler.js.map