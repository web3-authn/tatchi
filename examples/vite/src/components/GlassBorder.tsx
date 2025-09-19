import React from 'react';
import './GlassBorder.css';

interface GlassBorderProps {
  children: React.ReactNode;
  className?: string;
  animated?: boolean;
  style?: React.CSSProperties;
}

export const GlassBorder: React.FC<GlassBorderProps> = ({
  children,
  className = '',
  animated = false,
  style = {}
}) => {
  return (
    <div
      className={`glass-border-root ${className}`}
      style={style}
    >
      <div className={`glass-border-inner${animated ? ' black-gradient-border' : ''}`}>
        {children}
      </div>
    </div>
  );
};
