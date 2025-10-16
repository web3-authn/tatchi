import { defineProfileSettings, TATCHI_PROFILE_SETTINGS_TAG, TatchiProfileSettingsElement } from './profile-settings';
export { TATCHI_PROFILE_SETTINGS_TAG, TatchiProfileSettingsElement, defineProfileSettings };

// Friendly named export so consumers can:
// import { ProfileSettingsButton } from '@tatchi/sdk/web-components';
// ProfileSettingsButton.define();
export const ProfileSettingsButton = {
  tag: TATCHI_PROFILE_SETTINGS_TAG,
  define: (tag?: string) => defineProfileSettings(tag),
  elementClass: TatchiProfileSettingsElement,
};

export function defineAll() {
  defineProfileSettings();
  // Future: definePasskeyAuthMenu();
}
