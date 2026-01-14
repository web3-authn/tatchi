export enum AuthMenuMode {
  Register = 0,
  Login = 1,
  Sync = 2,
}

export const AuthMenuModeMap = {
  [AuthMenuMode.Register]: 'register',
  [AuthMenuMode.Login]: 'login',
  [AuthMenuMode.Sync]: 'sync',
} as const;

export type AuthMenuModeLabel = typeof AuthMenuModeMap[keyof typeof AuthMenuModeMap];

export interface AuthMenuTitle {
  title: string;
  subtitle: string;
}

/** Optional custom headings per mode */
export interface AuthMenuHeadings {
  /** Headings for the Register mode */
  registration?: AuthMenuTitle;
  /** Headings for the Login mode */
  login?: AuthMenuTitle;
  /** Headings for the Sync Account mode */
  syncAccount?: AuthMenuTitle;
}
