import React from 'react';
import './GlassBorder.css';

interface GlassBorderProps {
  children: React.ReactNode;
  className?: string;
  animated?: boolean;
  style?: React.CSSProperties;
  theme?: 'dark' | 'light';
}

export const GlassBorder: React.FC<GlassBorderProps> = ({
  children,
  className = '',
  animated = false,
  style = {},
  theme = 'light'
}) => {
  return (
    <div
      className={`w3a-glass-border-root ${theme} ${className}`}
      style={style}
    >
      <div className={`w3a-glass-border-inner${animated ? ' w3a-black-gradient-border' : ''}`}>
        {children}
      </div>
    </div>
  );
};
