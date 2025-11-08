import { useState, useRef, useEffect, useCallback } from 'react';
import type { ProfileStateRefs } from '../types';

interface UseProfileStateOptions {
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
}

export const useProfileState = (options?: UseProfileStateOptions) => {
  const [uncontrolledOpen, setUncontrolledOpen] = useState(false);
  const isControlled = typeof options?.open === 'boolean';
  const isOpen = isControlled ? (options?.open as boolean) : uncontrolledOpen;
  const onOpenChange = options?.onOpenChange;

  // Refs
  const buttonRef = useRef<HTMLDivElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const menuItemsRef = useRef<(HTMLElement | null)[]>([]);
  const refs: ProfileStateRefs = {
    buttonRef,
    dropdownRef,
    menuItemsRef,
  };

  // Handle click outside to close (account for Shadow DOM via composedPath)
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as Node;
      const path = typeof (event as any).composedPath === 'function'
        ? ((event as any).composedPath() as Node[])
        : [];

      const isInPath = (el: HTMLElement | null) => {
        if (!el) return false;
        if (el.contains(target)) return true;
        return path.includes(el);
      };

      const clickedInsideButton = isInPath(buttonRef.current as any);
      const clickedInsideDropdown = isInPath(dropdownRef.current as any);
      if (clickedInsideButton || clickedInsideDropdown) return;

      // Allow interactions with portaled overlays without closing the menu
      // Linked devices / access keys modal (match any class starting with prefix)
      const pathEls = path.filter((n): n is HTMLElement => n instanceof HTMLElement);
      const inAccessKeysModal = pathEls.some((el) =>
        Array.from(el.classList ?? []).some((c) => c.startsWith('w3a-access-keys-modal'))
      );
      if (inAccessKeysModal) return;

      // QR scanner overlay
      const inQRScanner = pathEls.some((el) =>
        el.classList?.contains('qr-scanner-modal') || el.classList?.contains('qr-scanner-panel')
      );
      if (inQRScanner) return;

      if (!isControlled) {
        setUncontrolledOpen(false);
      }
      onOpenChange?.(false);
    };

    // Attach the listener to the closest root (ShadowRoot or Document)
    const root: Document | ShadowRoot = (buttonRef.current?.getRootNode?.() as any) || document;
    root.addEventListener('click', handleClickOutside as any, true);
    return () => {
      try { root.removeEventListener('click', handleClickOutside as any, true); } catch {}
    };
  }, [isControlled, onOpenChange]);

  const setOpen = useCallback((next: boolean | ((prev: boolean) => boolean)) => {
    const resolved = typeof next === 'function' ? (next as (prev: boolean) => boolean)(isOpen) : next;
    if (!isControlled) {
      setUncontrolledOpen(resolved);
    }
    onOpenChange?.(resolved);
  }, [isControlled, isOpen, onOpenChange]);

  const handleToggle = () => {
    setOpen((prev) => !prev);
  };

  const handleClose = () => {
    setOpen(false);
  };

  return {
    isOpen,
    refs,
    handleToggle,
    handleClose,
  };
};
