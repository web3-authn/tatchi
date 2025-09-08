const require_rolldown_runtime = require('../../../_virtual/rolldown_runtime.js');
let react = require("react");
react = require_rolldown_runtime.__toESM(react);

//#region src/react/components/ProfileSettingsButton/hooks/useProfileState.ts
const useProfileState = () => {
	const [isOpen, setIsOpen] = (0, react.useState)(false);
	const buttonRef = (0, react.useRef)(null);
	const dropdownRef = (0, react.useRef)(null);
	const menuItemsRef = (0, react.useRef)([]);
	const refs = {
		buttonRef,
		dropdownRef,
		menuItemsRef
	};
	(0, react.useEffect)(() => {
		const handleClickOutside = (event) => {
			const target = event.target;
			if (dropdownRef.current && buttonRef.current && !buttonRef.current.contains(target) && !dropdownRef.current.contains(target)) {
				const accessKeysModal = document.querySelector(".w3a-access-keys-modal-outer");
				if (accessKeysModal && accessKeysModal.contains(target)) return;
				setIsOpen(false);
			}
		};
		document.addEventListener("mousedown", handleClickOutside);
		return () => document.removeEventListener("mousedown", handleClickOutside);
	}, []);
	const handleToggle = () => {
		setIsOpen(!isOpen);
	};
	const handleClose = () => {
		setIsOpen(false);
	};
	return {
		isOpen,
		refs,
		handleToggle,
		handleClose
	};
};

//#endregion
exports.useProfileState = useProfileState;
//# sourceMappingURL=useProfileState.js.map