import { usePasskeyContext } from "../../context/index.js";
import { useTheme } from "../theme/ThemeProvider.js";
import "./AccessKeysModal.js";
import React, { useEffect, useState } from "react";
import { jsx, jsxs } from "react/jsx-runtime";

//#region src/react/components/ProfileSettingsButton/AccessKeysModal.tsx
const AccessKeysModal = ({ nearAccountId, isOpen, onClose }) => {
	const { passkeyManager } = usePasskeyContext();
	const { theme } = useTheme();
	const [accessKeys, setAccessKeys] = useState([{
		public_key: "placeholder",
		access_key: {
			nonce: 0n,
			block_height: 0,
			block_hash: "placeholder",
			permission: { FunctionCall: {
				allowance: "1000000000000000000000000",
				receiver_id: "placeholder",
				method_names: ["placeholder"]
			} }
		}
	}]);
	const [isLoading, setIsLoading] = useState(false);
	const [error, setError] = useState(null);
	const [tooltipVisible, setTooltipVisible] = useState(null);
	const [copiedKeys, setCopiedKeys] = useState(/* @__PURE__ */ new Set());
	useEffect(() => {
		if (isOpen) loadAccessKeys();
	}, [isOpen]);
	const loadAccessKeys = async () => {
		if (!passkeyManager) return;
		setIsLoading(true);
		setError(null);
		try {
			const keys = await passkeyManager.viewAccessKeyList(nearAccountId);
			setTimeout(() => {
				setAccessKeys(keys.keys);
			}, 500);
		} catch (err) {
			setError(err.message || "Failed to load access keys");
		} finally {
			setIsLoading(false);
		}
	};
	const copyToClipboard = async (text, keyIndex) => {
		try {
			await navigator.clipboard.writeText(text);
			const copyEvent = new CustomEvent("accessKeyCopied", { detail: {
				publicKey: text,
				keyIndex,
				timestamp: Date.now()
			} });
			window.dispatchEvent(copyEvent);
			setTooltipVisible(keyIndex);
			setTimeout(() => setTooltipVisible(null), 2e3);
			setCopiedKeys((prev) => new Set(prev).add(keyIndex));
			setTimeout(() => {
				setCopiedKeys((prev) => {
					const newSet = new Set(prev);
					newSet.delete(keyIndex);
					return newSet;
				});
			}, 3e3);
		} catch (err) {
			console.error("Failed to copy to clipboard:", err);
		}
	};
	const getPermissionType = (permission) => {
		if (permission === "FullAccess") return "Full Access";
		if ("FunctionCall" in permission && "receiver_id" in permission?.FunctionCall && "method_names" in permission?.FunctionCall && permission?.FunctionCall?.method_names?.length > 0) return "Function Call";
		return "Unknown";
	};
	const getPermissionDetails = (permission) => {
		if (permission.FunctionCall) {
			const { allowance, receiver_id, method_names } = permission.FunctionCall;
			return {
				allowance: allowance || "0",
				receiverId: receiver_id,
				methodNames: method_names || []
			};
		}
		return null;
	};
	if (!isOpen) return null;
	const handleBackdropClick = (e) => {
		e.preventDefault();
		e.stopPropagation();
		onClose();
	};
	const handleModalContentClick = (e) => {
		e.preventDefault();
		e.stopPropagation();
	};
	return /* @__PURE__ */ jsx("div", {
		className: `w3a-access-keys-modal-backdrop theme-${theme}`,
		onClick: handleBackdropClick,
		onMouseDown: (e) => e.stopPropagation(),
		onMouseUp: (e) => e.stopPropagation(),
		children: /* @__PURE__ */ jsxs("div", {
			className: "w3a-access-keys-modal-content",
			onClick: handleModalContentClick,
			onMouseDown: (e) => e.stopPropagation(),
			onMouseUp: (e) => e.stopPropagation(),
			children: [
				/* @__PURE__ */ jsxs("div", {
					className: "w3a-access-keys-modal-header",
					children: [/* @__PURE__ */ jsx("h2", {
						className: "w3a-access-keys-modal-title",
						children: "Access Keys"
					}), /* @__PURE__ */ jsx("button", {
						className: "w3a-access-keys-modal-close",
						onClick: (e) => {
							e.preventDefault();
							e.stopPropagation();
							onClose();
						},
						children: "✕"
					})]
				}),
				error && /* @__PURE__ */ jsxs("div", {
					className: "w3a-access-keys-error",
					children: [/* @__PURE__ */ jsx("p", { children: error }), /* @__PURE__ */ jsx("button", {
						onClick: (e) => {
							e.preventDefault();
							e.stopPropagation();
							loadAccessKeys();
						},
						className: "w3a-btn w3a-btn-primary",
						children: "Try Again"
					})]
				}),
				!isLoading && !error && accessKeys.length === 0 && /* @__PURE__ */ jsx("div", {
					className: "w3a-access-keys-empty",
					children: /* @__PURE__ */ jsx("p", { children: "No access keys found." })
				}),
				!error && accessKeys.length > 0 && /* @__PURE__ */ jsx("div", {
					className: "w3a-keys-list",
					children: accessKeys.map((key, index) => {
						const permissionType = getPermissionType(key.access_key.permission);
						getPermissionDetails(key.access_key.permission);
						return /* @__PURE__ */ jsx("div", {
							className: "w3a-key-item",
							children: /* @__PURE__ */ jsxs("div", {
								className: "w3a-key-content",
								children: [/* @__PURE__ */ jsx("div", {
									className: "w3a-key-details",
									children: /* @__PURE__ */ jsx("div", {
										className: "w3a-key-header",
										children: key.public_key === "placeholder" ? /* @__PURE__ */ jsx("div", {
											className: "mono w3a-copyable-key",
											children: /* @__PURE__ */ jsx("span", {
												style: { opacity: 0 },
												children: "........................................................"
											})
										}) : /* @__PURE__ */ jsxs("div", {
											className: "mono w3a-copyable-key",
											onClick: (e) => {
												e.stopPropagation();
												copyToClipboard(key.public_key, index);
											},
											onMouseEnter: () => setTooltipVisible(index),
											onMouseLeave: () => setTooltipVisible(null),
											title: "Click to copy",
											children: [key.public_key, tooltipVisible === index && /* @__PURE__ */ jsx("div", {
												className: "w3a-copy-tooltip",
												children: "Click to copy"
											})]
										})
									})
								}), key.public_key !== "placeholder" && /* @__PURE__ */ jsx("div", {
									className: "w3a-key-status",
									children: /* @__PURE__ */ jsx("span", {
										className: `w3a-status-badge ${copiedKeys.has(index) ? "w3a-copied" : "w3a-" + permissionType.toLowerCase().replace(" ", "-")}`,
										children: copiedKeys.has(index) ? "Copied" : permissionType
									})
								})]
							})
						}, index);
					})
				})
			]
		})
	});
};

//#endregion
export { AccessKeysModal };
//# sourceMappingURL=AccessKeysModal2.js.map