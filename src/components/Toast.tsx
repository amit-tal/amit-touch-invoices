import React from 'react';
import { useApp } from '../context/AppContext';
import { CheckCircle2 } from 'lucide-react';

export const Toast: React.FC = () => {
  const { toastMessage } = useApp();

  if (!toastMessage) return null;

  return (
    <div className="fixed bottom-6 left-6 z-50 animate-in fade-in slide-in-from-bottom-5 duration-300 pointer-events-none font-heebo">
      <div className="liquid-glass rounded-2xl px-5 py-3.5 shadow-[0_12px_35px_-8px_rgba(109,64,61,0.22)] border border-[#BC796F]/25 flex items-center gap-3 text-sm font-bold text-warm-950 bg-white/95 backdrop-blur-xl">
        <div className="w-6 h-6 rounded-full bg-[#BC796F]/15 flex items-center justify-center text-[#BC796F] shrink-0 border border-[#BC796F]/20">
          <CheckCircle2 className="w-4 h-4 text-[#BC796F]" />
        </div>
        <span>{toastMessage}</span>
      </div>
    </div>
  );
};
