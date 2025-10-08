export enum AuthMenuMode {
  Register = 0,
  Login = 1,
  Recover = 2,
}

export const AuthMenuModeMap = {
  [AuthMenuMode.Register]: 'register',
  [AuthMenuMode.Login]: 'login',
  [AuthMenuMode.Recover]: 'recover',
} as const;

export type AuthMenuModeLabel = typeof AuthMenuModeMap[keyof typeof AuthMenuModeMap];

export interface AuthMenuTitle {
  title: string;
  subtitle: string;
}
