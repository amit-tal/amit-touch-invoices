import React from 'react';

export const GlassRibbonsBackground: React.FC = () => {
  return (
    <div
      className="fixed inset-0 pointer-events-none z-0 select-none bg-cover bg-center bg-no-repeat"
      style={{
        backgroundImage: "url('/rose-liquid-glass-background.png')",
        backgroundColor: '#F5E7E4',
      }}
      aria-hidden="true"
    />
  );
};
