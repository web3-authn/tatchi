import React from 'react';
import { useThemeContext } from './ThemeContext';

export interface ThemeScopeProps {
  as?: keyof JSX.IntrinsicElements;
  className?: string;
  style?: React.CSSProperties;
  dataAttr?: string; // attribute to mark theme on boundary
  children?: React.ReactNode;
}

export const ThemeScope: React.FC<ThemeScopeProps> = ({
  as = 'div',
  className,
  style,
  dataAttr = 'data-w3a-theme',
  children,
}) => {
  const { theme, vars } = useThemeContext();
  const Comp: any = as;

  const attrs: any = { [dataAttr]: theme };

  return (
    <Comp className={className} style={{ ...vars, ...style }} {...attrs}>
      {children}
    </Comp>
  );
};

