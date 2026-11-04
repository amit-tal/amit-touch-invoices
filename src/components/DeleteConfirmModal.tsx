import React, { useEffect, useRef } from 'react';
import { AlertTriangle, X } from 'lucide-react';

interface DeleteConfirmModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void;
  title: string;
  itemName: string;
  warningDetails?: string;
  isBlocked?: boolean;
  blockedMessage?: string;
  confirmButtonText?: string;
}

export const DeleteConfirmModal: React.FC<DeleteConfirmModalProps> = ({
  isOpen,
  onClose,
  onConfirm,
  title,
  itemName,
  warningDetails,
  isBlocked = false,
  blockedMessage,
  confirmButtonText = 'מחיקה לצמיתות',
}) => {
  const cancelButtonRef = useRef<HTMLButtonElement>(null);

  // Focus cancel button on open & handle Escape
  useEffect(() => {
    if (isOpen) {
      setTimeout(() => {
        cancelButtonRef.current?.focus();
      }, 50);

      const handleKeyDown = (e: KeyboardEvent) => {
        if (e.key === 'Escape') {
          onClose();
        }
      };
      window.addEventListener('keydown', handleKeyDown);
      return () => window.removeEventListener('keydown', handleKeyDown);
    }
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      {/* Backdrop */}
      <div 
        onClick={onClose}
        className="fixed inset-0 bg-warm-950/30 backdrop-blur-md transition-opacity"
        aria-hidden="true"
      />

      {/* Modal Card */}
      <div 
        role="dialog"
        aria-modal="true"
        dir="rtl"
        aria-labelledby="delete-dialog-title"
        className="relative w-full max-w-md liquid-glass rounded-3xl p-6 sm:p-7 z-10 shadow-2xl border border-white/80 animate-in fade-in zoom-in-95 duration-200"
      >
        <div className="flex items-start justify-between pb-3 mb-3 border-b border-[#BC796F]/15">
          <div className="flex items-center gap-3">
            <div className={`w-10 h-10 rounded-2xl flex items-center justify-center ${
              isBlocked ? 'bg-amber-500/15 text-amber-700' : 'bg-red-500/15 text-red-700'
            }`}>
              <AlertTriangle className="w-5 h-5" />
            </div>
            <div>
              <h3 id="delete-dialog-title" className="font-bold text-warm-900 text-lg">
                {title}
              </h3>
              <span className="text-xs text-[#7D5A56]">
                פעולה זו אינה ניתנת לביטול
              </span>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded-lg text-warm-700 hover:text-warm-950 hover:bg-white/40 transition-colors"
            aria-label="סגירה"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content Body */}
        <div className="py-2 text-sm text-warm-900 flex flex-col gap-3">
          <p>
            האם אתה בטוח שברצונך למחוק את <strong className="font-semibold text-warm-950">"{itemName}"</strong>?
          </p>

          {isBlocked ? (
            <div className="p-3.5 rounded-xl bg-amber-500/15 border border-amber-500/30 text-amber-900 text-xs leading-relaxed">
              <strong>פעולה חסומה:</strong> {blockedMessage || 'לא ניתן לבצע מחיקה כאשר הטיימר פועל עבור פריט זה. יש לעצור את הטיימר תחילה.'}
            </div>
          ) : warningDetails ? (
            <div className="p-3.5 rounded-xl bg-red-500/10 border border-red-500/25 text-red-900 text-xs leading-relaxed">
              {warningDetails}
            </div>
          ) : null}
        </div>

        {/* Footer Actions */}
        <div className="flex items-center justify-end gap-3 pt-4 border-t border-[#BC796F]/15 mt-4">
          <button
            ref={cancelButtonRef}
            type="button"
            onClick={onClose}
            className="px-5 py-2.5 rounded-xl text-sm font-medium text-warm-800 liquid-glass-btn-secondary hover:bg-white/70 transition-all focus:ring-2 focus:ring-[#BC796F]"
          >
            ביטול
          </button>
          
          {!isBlocked && (
            <button
              type="button"
              onClick={() => {
                onConfirm();
                onClose();
              }}
              className="px-5 py-2.5 rounded-xl text-sm font-semibold text-white liquid-glass-btn-danger shadow-md active:scale-[0.98] transition-all"
            >
              {confirmButtonText}
            </button>
          )}
        </div>
      </div>
    </div>
  );
};
