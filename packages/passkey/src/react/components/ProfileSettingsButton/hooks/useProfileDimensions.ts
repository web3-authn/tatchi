import { useMemo } from 'react';
import type { ProfileDimensions, ProfileCalculationParams } from '../types';

// Constants for calculations
const PROFILE_CONSTANTS = {
  BASE_WIDTH: 24,
  CHAR_WIDTH: 8,
  REM_BUFFER: 32, // 2rem: 32px, one 1rem each side (left/right)
  CLOSED_HEIGHT: 40,
  OPEN_WIDTH: 300,
} as const;

export const useProfileDimensions = (params: ProfileCalculationParams) => {
  const {
    accountName,
    numMenuItems,
    profileButtonHeight,
    menuItemHeight,
    toggleSectionHeight,
    logoutSectionHeight,
    bottomBuffer,
  } = params;

  const closedDimensions = useMemo((): ProfileDimensions => {
    const width = PROFILE_CONSTANTS.BASE_WIDTH +
                  (accountName.length * PROFILE_CONSTANTS.CHAR_WIDTH) +
                  PROFILE_CONSTANTS.REM_BUFFER;

    return {
      width,
      height: PROFILE_CONSTANTS.CLOSED_HEIGHT,
    };
  }, [accountName]);

  const openDimensions = useMemo((): ProfileDimensions => {
    const height = profileButtonHeight +
                   (numMenuItems * menuItemHeight) +
                   toggleSectionHeight +
                   logoutSectionHeight +
                   bottomBuffer;

    return {
      width: PROFILE_CONSTANTS.OPEN_WIDTH,
      height,
    };
  }, [numMenuItems, profileButtonHeight, menuItemHeight, toggleSectionHeight, logoutSectionHeight, bottomBuffer]);

  return {
    closedDimensions,
    openDimensions,
    constants: PROFILE_CONSTANTS,
  };
};