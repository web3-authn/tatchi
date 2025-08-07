import { useEffect, useRef, useState } from 'react';
import type { ProfileStateRefs, ProfileDimensions } from '../types';

const ANIMATION_CONFIGS = {
  container: {
    open: { duration: 100, easing: 'cubic-bezier(0.50, -0.45, 0.2, 1.2)' }, // outElastic approximation
    close: { duration: 100, delay: 0, easing: 'cubic-bezier(0.50, -0.45, 0.2, 1.2)' }, // inOutBack approximation
  },
  dropdown: {
    show: { duration: 100, delay: 0 },
    hide: { duration: 100, delay: 0 },
  },
  menuItems: {
    in: { duration: 150, easing: 'cubic-bezier(0.50, -0.45, 0.2, 1.2)', staggerDelay: 25 }, // outBack approximation
    out: { duration: 150, easing: 'cubic-bezier(0.50, -0.45, 0.2, 1.2)', staggerDelay: 25 }, // inBack approximation
  },
} as const;

interface UseProfileAnimationsProps {
  isOpen: boolean;
  refs: ProfileStateRefs;
  openDimensions: ProfileDimensions;
  closedDimensions: ProfileDimensions;
}

interface AnimationState {
  containerAnimationClass: string;
  dropdownAnimationClass: string;
  menuItemAnimationClass: string;
}

interface AnimationStyles {
  containerStyle: React.CSSProperties;
  dropdownStyle: React.CSSProperties;
  getMenuItemStyle: (index: number, totalItems?: number) => React.CSSProperties;
}

export const useProfileAnimations = ({
  isOpen,
  refs,
  openDimensions,
  closedDimensions,
}: UseProfileAnimationsProps) => {
  // Store latest dimensions in refs to avoid re-triggering animations
  const dimensionsRef = useRef({ openDimensions, closedDimensions });
  dimensionsRef.current = { openDimensions, closedDimensions };

  // Track the current animation state to prevent re-applying on re-renders
  const animationStateRef = useRef<boolean | null>(null);

  // Animation state for React components
  const [animationState, setAnimationState] = useState<AnimationState>({
    containerAnimationClass: '',
    dropdownAnimationClass: '',
    menuItemAnimationClass: '',
  });

  // Animation styles for React components
  const [animationStyles, setAnimationStyles] = useState<AnimationStyles>({
    containerStyle: {},
    dropdownStyle: {},
    getMenuItemStyle: () => ({}),
  });

  useEffect(() => {
    // Only animate if isOpen state has actually changed
    if (animationStateRef.current === isOpen) {
      return;
    }

    animationStateRef.current = isOpen;

    const { buttonRef } = refs;
    if (!buttonRef.current) return;

    // Get current dimensions from ref to avoid stale closures
    const { openDimensions: currentOpenDimensions, closedDimensions: currentClosedDimensions } = dimensionsRef.current;

    if (isOpen) {
      // Opening animation sequence
      requestAnimationFrame(() => {
        if (!buttonRef.current) return;

        const containerStyle: React.CSSProperties = {
          '--start-width': `${buttonRef.current.offsetWidth}px`,
          '--start-height': `${buttonRef.current.offsetHeight}px`,
          '--end-width': `${currentOpenDimensions.width}px`,
          '--end-height': `${currentOpenDimensions.height}px`,
          '--container-duration': `${ANIMATION_CONFIGS.container.open.duration}ms`,
          '--container-easing': ANIMATION_CONFIGS.container.open.easing,
        } as any;

        const dropdownStyle: React.CSSProperties = {
          '--dropdown-duration': `${ANIMATION_CONFIGS.dropdown.show.duration}ms`,
        } as any;

        const getMenuItemStyle = (index: number, totalItems?: number): React.CSSProperties => {
          const delay = index * ANIMATION_CONFIGS.menuItems.in.staggerDelay;
          return {
            '--menu-duration': `${ANIMATION_CONFIGS.menuItems.in.duration}ms`,
            '--menu-delay': `${delay}ms`,
            '--menu-easing': ANIMATION_CONFIGS.menuItems.in.easing,
          } as any;
        };

        setAnimationStyles({
          containerStyle,
          dropdownStyle,
          getMenuItemStyle,
        });

        setAnimationState({
          containerAnimationClass: 'web3authn-profile-container-opening',
          dropdownAnimationClass: 'web3authn-profile-dropdown-showing',
          menuItemAnimationClass: 'web3authn-profile-menu-item-entering',
        });
      });
    } else {
      // Closing animation sequence
      if (!buttonRef.current) return;

      const containerStyle: React.CSSProperties = {
        '--start-width': `${buttonRef.current.offsetWidth}px`,
        '--start-height': `${buttonRef.current.offsetHeight}px`,
        '--end-width': `${currentClosedDimensions.width}px`,
        '--end-height': `${currentClosedDimensions.height}px`,
        '--container-duration': `${ANIMATION_CONFIGS.container.close.duration}ms`,
        '--container-easing': ANIMATION_CONFIGS.container.close.easing,
      } as any;

      const dropdownStyle: React.CSSProperties = {
        '--dropdown-duration': `${ANIMATION_CONFIGS.dropdown.hide.duration}ms`,
      } as any;

      const getMenuItemStyle = (index: number, totalItems?: number): React.CSSProperties => {
        const delay = totalItems ? (totalItems - 1 - index) * ANIMATION_CONFIGS.menuItems.out.staggerDelay : 0;
        return {
          '--menu-duration': `${ANIMATION_CONFIGS.menuItems.out.duration}ms`,
          '--menu-delay': `${delay}ms`,
          '--menu-easing': ANIMATION_CONFIGS.menuItems.out.easing,
        } as any;
      };

      setAnimationStyles({
        containerStyle,
        dropdownStyle,
        getMenuItemStyle,
      });

      setAnimationState({
        containerAnimationClass: 'web3authn-profile-container-closing',
        dropdownAnimationClass: 'web3authn-profile-dropdown-hiding',
        menuItemAnimationClass: 'web3authn-profile-menu-item-exiting',
      });
    }
  }, [isOpen, refs]); // Only trigger on isOpen or refs changes, not dimensions

  return {
    animationConfigs: ANIMATION_CONFIGS,
    animationState,
    animationStyles,
  };
};