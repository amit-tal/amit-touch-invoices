import React, { useState } from 'react';
import { useDocuments } from '../../context/DocumentsContext';
import { ShieldAlert, CheckCircle2, X } from 'lucide-react';

interface SequenceConfirmationModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const SequenceConfirmationModal: React.FC<SequenceConfirmationModalProps> = ({
  isOpen,
  onClose,
}) => {
  const { sequences, confirmProductionSequences } = useDocuments();
  const [quoteStart, setQuoteStart] = useState<string>(
    sequences.quoteNext ? String(sequences.quoteNext) : '1001'
  );
  const [hasConfirmedNoOverlap, setHasConfirmedNoOverlap] = useState(false);
  const [error, setError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  if (!isOpen) return null;

  const handleConfirm = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!hasConfirmedNoOverlap) {
      setError('יש לאשר כי המספרים אינם חופפים למסמכים שכבר הופקו בעבר');
      return;
    }

    const qNum = parseInt(quoteStart, 10);
    if (isNaN(qNum) || qNum <= 0) {
      setError('יש להזין מספר התחלתי חיובי עבור הצעות מחיר');
      return;
    }

    setIsSubmitting(true);
    try {
      await confirmProductionSequences({ quoteNextStarting: qNum });
      onClose();
    } catch (err: any) {
      setError(err.message || 'שגיאה בהפעלת סדרת המספרים');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div onClick={onClose} className="fixed inset-0 bg-warm-950/40 backdrop-blur-md" />

      <div
        role="dialog"
        aria-modal="true"
        dir="rtl"
        className="relative w-full max-w-lg liquid-glass rounded-3xl shadow-2xl p-6 sm:p-8 z-10 border border-white/80 animate-in fade-in zoom-in-95 duration-200"
      >
        <div className="flex items-center justify-between pb-3 border-b border-[#BC796F]/15 mb-5">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-2xl bg-[#BC796F]/20 flex items-center justify-center text-[#BC796F]">
              <ShieldAlert className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-bold text-warm-950 text-lg">אישור והפעלת סדרות מסמכים רשמיות</h3>
              <p className="text-xs text-[#7D5A56]">הגדרה חד-פעמית לפני הפקת מסמכים רשמיים</p>
            </div>
          </div>
          <button onClick={onClose} className="p-1 rounded-lg text-warm-700 hover:text-warm-950">
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleConfirm} className="flex flex-col gap-5 text-right">
          {error && (
            <div className="p-3 rounded-xl bg-red-500/10 border border-red-500/25 text-red-800 text-xs font-medium">
              {error}
            </div>
          )}

          <div className="text-xs text-[#7D5A56] leading-relaxed">
            שים לב: מספרי המסמכים הבאים הוגדרו כמספרים הבאים להפקה רשמית. לאחר הפקת המסמך הראשון, לא ניתן יהיה לאפס או לשנות סדרות אלו.
          </div>

          {/* Sequences Grid */}
          <div className="space-y-3">
            {/* Payment Requests */}
            <div className="p-3.5 rounded-2xl bg-white/60 border border-white/80 flex items-center justify-between">
              <div>
                <span className="font-bold text-warm-900 text-sm block">חשבונות עסקה / דרישות תשלום</span>
                <span className="text-[11px] text-[#7D5A56]">המספר הרשמי הבא שיוקצה</span>
              </div>
              <span dir="ltr" className="font-black text-warm-950 text-lg tabular-nums px-3 py-1 rounded-xl bg-[#BC796F]/15 border border-[#BC796F]/30">
                40016
              </span>
            </div>

            {/* Receipts */}
            <div className="p-3.5 rounded-2xl bg-white/60 border border-white/80 flex items-center justify-between">
              <div>
                <span className="font-bold text-warm-900 text-sm block">קבלות</span>
                <span className="text-[11px] text-[#7D5A56]">המספר הרשמי הבא שיוקצה</span>
              </div>
              <span dir="ltr" className="font-black text-warm-950 text-lg tabular-nums px-3 py-1 rounded-xl bg-[#BC796F]/15 border border-[#BC796F]/30">
                250016
              </span>
            </div>

            {/* Quotes Config */}
            <div className="p-3.5 rounded-2xl bg-white/60 border border-white/80 flex items-center justify-between gap-4">
              <div className="min-w-0">
                <span className="font-bold text-warm-900 text-sm block">הצעות מחיר</span>
                <span className="text-[11px] text-[#7D5A56]">קביעת מספר התחלה רשמי</span>
              </div>
              <div className="w-28 shrink-0">
                <input
                  type="number"
                  min="1"
                  step="1"
                  dir="ltr"
                  value={quoteStart}
                  onChange={e => setQuoteStart(e.target.value)}
                  placeholder="1001"
                  className="w-full h-9 px-3 rounded-xl text-sm font-bold text-warm-950 liquid-glass-input text-right tabular-nums"
                />
              </div>
            </div>
          </div>

          {/* Checkbox confirmation */}
          <label className="flex items-start gap-2.5 p-3 rounded-2xl bg-amber-500/10 border border-amber-600/25 cursor-pointer">
            <input
              type="checkbox"
              checked={hasConfirmedNoOverlap}
              onChange={e => {
                setHasConfirmedNoOverlap(e.target.checked);
                if (e.target.checked) setError('');
              }}
              className="mt-0.5 rounded text-[#BC796F] focus:ring-[#BC796F]"
            />
            <span className="text-xs text-amber-950 font-medium leading-relaxed">
              אני מאשר/ת שמספרים אלו נבדקו ואומתו כרציפים, וכי אינם חופפים למסמכים שכבר הופקו במערכת הקודמת.
            </span>
          </label>

          <div className="flex items-center justify-end gap-3 pt-4 border-t border-[#BC796F]/15">
            <button
              type="button"
              onClick={onClose}
              disabled={isSubmitting}
              className="px-4 py-2.5 rounded-xl text-sm font-medium text-warm-800 liquid-glass-btn-secondary"
            >
              ביטול
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              className="flex items-center gap-2 px-6 py-2.5 rounded-xl text-sm font-semibold text-white liquid-glass-btn-primary shadow-md active:scale-98 transition-all"
            >
              <CheckCircle2 className="w-4 h-4" />
              <span>{isSubmitting ? 'מפעיל...' : 'אישור והפעלת סדרות רשמיות'}</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
