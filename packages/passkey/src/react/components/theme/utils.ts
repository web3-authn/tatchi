import type { DesignTokens } from './design-tokens';

export type PartialDeep<T> = {
  [K in keyof T]?: T[K] extends object ? PartialDeep<T[K]> : T[K];
};

export function deepMerge<T extends object, U extends object>(target: T, source: U): T & U {
  const out: any = Array.isArray(target) ? [...(target as any)] : { ...(target as any) };
  Object.entries(source as any).forEach(([key, value]) => {
    if (value && typeof value === 'object' && !Array.isArray(value)) {
      out[key] = deepMerge(out[key] || {}, value);
    } else if (value !== undefined) {
      out[key] = value;
    }
  });
  return out as T & U;
}

export function createCSSVariables(tokens: DesignTokens, prefix = '--w3a'): React.CSSProperties {
  const vars: Record<string, string> = {};

  Object.entries(tokens.colors).forEach(([k, v]) => {
    vars[`${prefix}-colors-${k}`] = String(v);
  });
  Object.entries(tokens.spacing).forEach(([k, v]) => {
    vars[`${prefix}-spacing-${k}`] = String(v);
  });
  Object.entries(tokens.borderRadius).forEach(([k, v]) => {
    vars[`${prefix}-border-radius-${k}`] = String(v);
  });
  Object.entries(tokens.shadows).forEach(([k, v]) => {
    vars[`${prefix}-shadows-${k}`] = String(v);
  });

  // React CSSProperties style: map to --custom-prop keys
  const style: React.CSSProperties = {} as any;
  Object.entries(vars).forEach(([k, v]) => {
    (style as any)[k] = v;
  });
  return style;
}

export function mergeTokens(base: DesignTokens, override?: PartialDeep<DesignTokens>): DesignTokens {
  if (!override) return base;
  return deepMerge(base, override);
}
