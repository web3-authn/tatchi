import { useState, useRef, useEffect } from 'react';
import type { ProfileStateRefs } from '../types';

export const useProfileState = () => {
  const [isOpen, setIsOpen] = useState(false);

  // Refs
  const buttonRef = useRef<HTMLDivElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const menuItemsRef = useRef<(HTMLElement | null)[]>([]);
  const refs: ProfileStateRefs = {
    buttonRef,
    dropdownRef,
    menuItemsRef,
  };

  // Handle click outside to close
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as Node;

      // Don't close if clicking inside the button or dropdown
      if (
        dropdownRef.current &&
        buttonRef.current &&
        !buttonRef.current.contains(target) &&
        !dropdownRef.current.contains(target)
      ) {
        // Don't close if clicking on the AccessKeysModal
        const accessKeysModal = document.querySelector('.w3a-access-keys-modal-outer');
        if (accessKeysModal && accessKeysModal.contains(target)) {
          return;
        }

        setIsOpen(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
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
    handleClose,
  };
};