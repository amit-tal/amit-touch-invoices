import React, { useState } from 'react';
import type { AppDocument } from '../../types/documents';
import { useDocuments } from '../../context/DocumentsContext';
import { getDocumentTypeTitle } from '../../utils/moneyUtils';
import { 
  X, 
  MessageSquare, 
  UserCheck, 
  Truck, 
  FileText, 
  AlertCircle
} from 'lucide-react';

interface ManualDeliveryModalProps {
  isOpen: boolean;
  onClose: () => void;
  document: AppDocument;
  onSavedSuccessfully?: (doc: AppDocument) => void;
}

export const ManualDeliveryModal: React.FC<ManualDeliveryModalProps> = ({
  isOpen,
  onClose,
  document,
  onSavedSuccessfully,
}) => {
  const { recordManualDelivery } = useDocuments();

  const [channel, setChannel] = useState<'whatsapp' | 'in_person' | 'courier' | 'other'>(
    (document.deliveryDetails?.manualMethod as any) || 'whatsapp'
  );
  const [recipient, setRecipient] = useState(document.deliveryDetails?.recipient || document.clientContactPerson || document.clientName || '');
  const [notes, setNotes] = useState(document.deliveryDetails?.notes || '');
  const [deliveryDate, setDeliveryDate] = useState(() => {
    if (document.deliveryDetails?.deliveredAt) {
      return document.deliveryDetails.deliveredAt.split('T')[0];
    }
    return new Date().toISOString().split('T')[0];
  });
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isSubmitting) return;

    setIsSubmitting(true);
    setErrorMsg('');

    try {
      const ok = await recordManualDelivery({
        documentId: document.id,
        manualMethod: channel,
        recipient: recipient.trim(),
        notes: notes.trim(),
        deliveredAt: new Date(deliveryDate).toISOString(),
      });

      if (ok) {
        if (onSavedSuccessfully) onSavedSuccessfully(document);
        onClose();
      } else {
        setErrorMsg('שגיאה בשמירת תיעוד המסירה הידני');
      }
    } catch (err: any) {
      setErrorMsg(err.message || 'שגיאה בלתי צפויה');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-5 bg-black/45 backdrop-blur-sm animate-fade-in font-heebo">
      <div 
        className="liquid-glass w-full max-w-lg rounded-3xl shadow-2xl border border-white/70 flex flex-col max-h-[92vh] overflow-hidden my-auto"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="px-6 py-4 border-b border-[#BC796F]/15 flex items-center justify-between bg-white/50 shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-gradient-to-tr from-warm-600 to-warm-400 flex items-center justify-center text-white shadow-sm">
              <MessageSquare className="w-4 h-4" />
            </div>
            <div>
              <h2 className="text-base font-bold text-warm-950">
                תיעוד מסירה ידני (לא בדוא״ל)
              </h2>
              <div className="text-xs text-[#7D5A56]">
                {getDocumentTypeTitle(document.type)} #{document.documentNumber || 'טיוטה'} • {document.clientName}
              </div>
            </div>
          </div>

          <button
            onClick={onClose}
            disabled={isSubmitting}
            className="p-1.5 rounded-xl text-warm-600 hover:text-warm-950 hover:bg-white/60 transition-colors"
            aria-label="סגור"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Form Body */}
        <form onSubmit={handleSubmit} className="p-6 flex flex-col gap-4 overflow-y-auto">
          {/* Explicit Notice */}
          <div className="p-3 rounded-2xl bg-warm-50/80 border border-warm-200/70 text-xs text-warm-800 leading-relaxed">
            <strong>לתשומת לבך:</strong> פעולה זו מתעדת מסירה ידנית שבוצעה מחוץ למערכת (כגון שליחת קובץ ב-WhatsApp או מסירה פיזית) ואינה שולחת דוא״ל. הסטטוס יסומן כ"נמסר ידנית".
          </div>

          {errorMsg && (
            <div className="p-3 rounded-xl bg-red-50 border border-red-200 text-xs text-red-800 flex items-center gap-2">
              <AlertCircle className="w-4 h-4 text-red-600 shrink-0" />
              <span>{errorMsg}</span>
            </div>
          )}

          {/* Channel Selector */}
          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-bold text-warm-900">אופן המסירה הידנית *</label>
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => setChannel('whatsapp')}
                className={`p-3 rounded-xl border text-xs font-bold flex items-center gap-2 transition-all ${
                  channel === 'whatsapp'
                    ? 'border-[#BC796F] bg-[#BC796F]/10 text-[#88463F]'
                    : 'border-warm-200 bg-white/70 text-warm-700 hover:bg-white'
                }`}
              >
                <MessageSquare className="w-4 h-4 text-emerald-600" />
                <span>וואטסאפ (WhatsApp)</span>
              </button>

              <button
                type="button"
                onClick={() => setChannel('in_person')}
                className={`p-3 rounded-xl border text-xs font-bold flex items-center gap-2 transition-all ${
                  channel === 'in_person'
                    ? 'border-[#BC796F] bg-[#BC796F]/10 text-[#88463F]'
                    : 'border-warm-200 bg-white/70 text-warm-700 hover:bg-white'
                }`}
              >
                <UserCheck className="w-4 h-4 text-blue-600" />
                <span>מסירה אישית / פגישה</span>
              </button>

              <button
                type="button"
                onClick={() => setChannel('courier')}
                className={`p-3 rounded-xl border text-xs font-bold flex items-center gap-2 transition-all ${
                  channel === 'courier'
                    ? 'border-[#BC796F] bg-[#BC796F]/10 text-[#88463F]'
                    : 'border-warm-200 bg-white/70 text-warm-700 hover:bg-white'
                }`}
              >
                <Truck className="w-4 h-4 text-amber-600" />
                <span>שליח / דואר רשום</span>
              </button>

              <button
                type="button"
                onClick={() => setChannel('other')}
                className={`p-3 rounded-xl border text-xs font-bold flex items-center gap-2 transition-all ${
                  channel === 'other'
                    ? 'border-[#BC796F] bg-[#BC796F]/10 text-[#88463F]'
                    : 'border-warm-200 bg-white/70 text-warm-700 hover:bg-white'
                }`}
              >
                <FileText className="w-4 h-4 text-purple-600" />
                <span>אופן מסירה אחר</span>
              </button>
            </div>
          </div>

          {/* Recipient */}
          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-bold text-warm-900">נמסר לידי (איש קשר / נמען)</label>
            <input
              type="text"
              value={recipient}
              onChange={e => setRecipient(e.target.value)}
              placeholder="למשל: דניאל מנהל החשבונות"
              className="h-10 px-3.5 rounded-xl text-xs bg-white/80 border border-warm-200 text-warm-900 focus:outline-none focus:ring-2 focus:ring-[#BC796F]/40"
            />
          </div>

          {/* Delivery Date */}
          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-bold text-warm-900">תאריך המסירה</label>
            <input
              type="date"
              value={deliveryDate}
              onChange={e => setDeliveryDate(e.target.value)}
              className="h-10 px-3.5 rounded-xl text-xs bg-white/80 border border-warm-200 text-warm-900 focus:outline-none focus:ring-2 focus:ring-[#BC796F]/40"
            />
          </div>

          {/* Notes */}
          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-bold text-warm-900">הערות מסירה</label>
            <textarea
              rows={3}
              value={notes}
              onChange={e => setNotes(e.target.value)}
              placeholder="לדוגמה: נשלח קובץ PDF ישירות לוואטסאפ של מנהלת הכספים לפי בקשתה"
              className="p-3 rounded-xl text-xs bg-white/80 border border-warm-200 text-warm-900 focus:outline-none focus:ring-2 focus:ring-[#BC796F]/40 leading-relaxed"
            />
          </div>

          {/* Actions */}
          <div className="flex items-center justify-end gap-2.5 pt-3 border-t border-[#BC796F]/15">
            <button
              type="button"
              onClick={onClose}
              disabled={isSubmitting}
              className="px-4 py-2 rounded-xl text-xs font-semibold text-warm-800 hover:bg-white/60 transition-all"
            >
              ביטול
            </button>

            <button
              type="submit"
              disabled={isSubmitting}
              className="flex items-center gap-2 px-5 py-2.5 rounded-xl text-xs font-bold text-white bg-warm-800 hover:bg-warm-900 disabled:opacity-50 shadow-md transition-all active:scale-95"
            >
              <span>{isSubmitting ? 'שומר תיעוד...' : 'שמור תיעוד מסירה ידני'}</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
