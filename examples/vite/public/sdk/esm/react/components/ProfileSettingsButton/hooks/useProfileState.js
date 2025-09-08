import { useEffect, useRef, useState } from "react";

//#region src/react/components/ProfileSettingsButton/hooks/useProfileState.ts
const useProfileState = () => {
	const [isOpen, setIsOpen] = useState(false);
	const buttonRef = useRef(null);
	const dropdownRef = useRef(null);
	const menuItemsRef = useRef([]);
	const refs = {
		buttonRef,
		dropdownRef,
		menuItemsRef
	};
	useEffect(() => {
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
export { useProfileState };
//# sourceMappingURL=useProfileState.js.map