import React from 'react';

interface GlassBorderProps {
  children: React.ReactNode;
  className?: string;
  style?: React.CSSProperties;
}

export const GlassBorder: React.FC<GlassBorderProps> = ({
  children,
  style,
  className = '',
}) => {
  return (
    <div className={`glass-border-root ${className}`} style={style}>
      {children}
    </div>
  );
};
