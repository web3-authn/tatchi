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
      if (
        dropdownRef.current &&
        buttonRef.current &&
        !buttonRef.current.contains(event.target as Node)
      ) {
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
    // State
    isOpen,

    // Refs
    refs,

    // Handlers
    handleToggle,
    handleClose,
  };
};