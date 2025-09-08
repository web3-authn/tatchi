import TouchIcon_default from "./TouchIcon2.js";
import { jsx, jsxs } from "react/jsx-runtime";

//#region src/react/components/ProfileSettingsButton/UserAccountButton.tsx
const UserAccountButton = ({ username, fullAccountId, isOpen, onClick, isHovered, onMouseEnter, onMouseLeave, nearExplorerBaseUrl, theme = "dark", menuId, triggerId }) => {
	const onKeyDown = (e) => {
		if (e.key === "Enter" || e.key === " ") {
			e.preventDefault();
			onClick();
		}
	};
	return /* @__PURE__ */ jsx("div", {
		className: `w3a-user-account-button-root ${theme}`,
		children: /* @__PURE__ */ jsx("div", {
			id: triggerId,
			className: `w3a-user-account-button-trigger ${isOpen ? "open" : "closed"}`,
			onClick,
			role: "button",
			tabIndex: 0,
			"aria-haspopup": "menu",
			"aria-expanded": isOpen,
			...menuId ? { "aria-controls": menuId } : {},
			onKeyDown,
			...onMouseEnter && { onMouseEnter },
			...onMouseLeave && { onMouseLeave },
			children: /* @__PURE__ */ jsxs("div", {
				className: "w3a-user-account--user-content",
				children: [/* @__PURE__ */ jsx("div", {
					className: `w3a-user-account--avatar ${isOpen ? "expanded" : "shrunk"}`,
					children: /* @__PURE__ */ jsx(TouchIcon_default, {
						className: `w3a-user-account--gear-icon ${isOpen ? "open" : "closed"}`,
						strokeWidth: 1.4
					})
				}), /* @__PURE__ */ jsx(UserAccountId, {
					username,
					fullAccountId,
					isOpen,
					nearExplorerBaseUrl,
					theme
				})]
			})
		})
	});
};
const UserAccountId = ({ username, fullAccountId, isOpen, nearExplorerBaseUrl, theme = "dark" }) => {
	const displayAccountId = fullAccountId || `${username}`;
	return /* @__PURE__ */ jsxs("div", {
		className: "w3a-user-account--user-details",
		children: [/* @__PURE__ */ jsx("p", {
			className: "w3a-user-account--username",
			children: username || "User"
		}), /* @__PURE__ */ jsx("a", {
			href: username ? `${nearExplorerBaseUrl}/address/${displayAccountId}` : "#",
			target: "_blank",
			rel: "noopener noreferrer",
			className: `w3a-user-account--account-id ${isOpen ? "visible" : "hidden"}`,
			onClick: (e) => e.stopPropagation(),
			children: displayAccountId || "user@example.com"
		})]
	});
};

//#endregion
export { UserAccountButton };
//# sourceMappingURL=UserAccountButton.js.map