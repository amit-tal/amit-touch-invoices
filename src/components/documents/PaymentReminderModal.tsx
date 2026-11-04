import React, { useState } from 'react';
import type { AppDocument } from '../../types/documents';
import { useDocuments } from '../../context/DocumentsContext';
import { useApp } from '../../context/AppContext';
import { formatCurrency, formatIsoDateSlash } from '../../utils/moneyUtils';
import { 
  Bell, 
  Send, 
  X, 
  AlertTriangle, 
  Clock, 
  Paperclip,
  ShieldAlert
} from 'lucide-react';

interface PaymentReminderModalProps {
  isOpen: boolean;
  onClose: () => void;
  document: AppDocument;
}

export const PaymentReminderModal: React.FC<PaymentReminderModalProps> = ({
  isOpen,
  onClose,
  document: doc,
}) => {
  const { businessSettings, sendPaymentReminder } = useDocuments();
  const { showToast } = useApp();

  const savedSenderName = businessSettings.legalName || 'עמית טל';
  const customerName = doc.clientName || 'לקוח';
  const docNum = doc.documentNumber || 'טיוטה';
  const formattedDueDate = doc.dueDate ? formatIsoDateSlash(doc.dueDate) : 'מועד הפירעון שנקבע';
  const remainingBal = doc.remainingBalance !== undefined ? doc.remainingBalance : doc.totalAmount;
  const formattedOutstandingAmount = formatCurrency(remainingBal, doc.currency || businessSettings.currency || '₪');

  // Find most recent reminder sent if any
  const previousReminders = (doc.deliveryDetails?.sendAttempts || []).filter(a => a.isReminder);
  const latestReminder = previousReminders.length > 0 ? previousReminders[0] : null;

  const defaultRecipient = doc.clientEmail || '';
  const defaultSubject = `AMIT TOUCH | תזכורת תשלום - חשבון עסקה מס׳ ${docNum}`;
  const defaultMessageBody = `שלום ${customerName},

תזכורת בנוגע לחשבון עסקה מס׳ ${docNum}, שמועד פירעונו היה ${formattedDueDate}.
היתרה לתשלום היא ${formattedOutstandingAmount}.

אם התשלום כבר בוצע, אשמח לעדכון.

תודה,
${savedSenderName}
AMIT TOUCH`;

  const [recipient, setRecipient] = useState(defaultRecipient);
  const [subject, setSubject] = useState(defaultSubject);
  const [messageBody, setMessageBody] = useState(defaultMessageBody);
  const [isSending, setIsSending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!isOpen) return null;

  // Immediate check of outstanding balance
  const isPaidOrCanceled = doc.status === 'paid' || doc.status === 'canceled' || remainingBal <= 0;

  const handleSendReminder = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (isPaidOrCanceled) {
      setError('לא ניתן לשלוח תזכורת: חשבון העסקה כבר שולם במלואו או בוטל.');
      return;
    }

    if (!recipient.trim() || !recipient.includes('@')) {
      setError('יש להזין כתובת דוא״ל תקינה של הנמען.');
      return;
    }

    setIsSending(true);
    try {
      const res = await sendPaymentReminder({
        documentId: doc.id,
        recipient: recipient.trim(),
        subject: subject.trim(),
        messageBody: messageBody.trim(),
      });

      if (res.success) {
        showToast('תזכורת התשלום נשלחה בהצלחה באישור!');
        onClose();
      } else {
        setError(res.error || 'שגיאה בשליחת תזכורת התשלום');
      }
    } catch (err: any) {
      setError(err.message || 'שגיאה בשליחת תזכורת התשלום');
    } finally {
      setIsSending(false);
    }
  };

  const formatAttemptTime = (isoStr: string) => {
    try {
      const d = new Date(isoStr);
      return `${d.toLocaleDateString('he-IL')} בשעה ${d.toLocaleTimeString('he-IL', { hour: '2-digit', minute: '2-digit' })}`;
    } catch {
      return isoStr;
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-5">
      <div onClick={onClose} className="fixed inset-0 bg-warm-950/40 backdrop-blur-md" />

      <div
        role="dialog"
        aria-modal="true"
        dir="rtl"
        className="relative w-full max-w-xl liquid-glass rounded-3xl shadow-2xl p-6 sm:p-8 z-10 border border-white/90 max-h-[92vh] overflow-y-auto"
      >
        {/* Header */}
        <div className="flex items-center justify-between pb-3 border-b border-[#BC796F]/15 mb-5">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-[#BC796F]/15 flex items-center justify-center text-[#88463F] border border-[#BC796F]/30 shadow-xs">
              <Bell className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-bold text-warm-950 text-lg">שליחת תזכורת תשלום באישור</h3>
              <p className="text-xs text-[#7D5A56]">חשבון עסקה מס׳ {docNum} | {customerName}</p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-1.5 rounded-xl text-warm-700 hover:text-warm-950 hover:bg-white/50 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Immediate Block if paid or canceled */}
        {isPaidOrCanceled ? (
          <div className="p-4 rounded-2xl bg-amber-500/10 border border-amber-500/25 text-amber-950 text-xs flex items-start gap-2.5 mb-5">
            <ShieldAlert className="w-5 h-5 text-amber-700 shrink-0 mt-0.5" />
            <div>
              <strong className="text-sm">שליחת התזכורת חסומה</strong>
              <p className="mt-1 leading-relaxed">
                חשבון עסקה זה {doc.status === 'canceled' ? 'בוטל' : 'סומן כשולם במלואו'}. אין יתרת חוב פתוחה לגבייה, ולכן לא ניתן להוציא תזכורת תשלום.
              </p>
            </div>
          </div>
        ) : null}

        {/* Error notification */}
        {error && (
          <div className="p-3.5 rounded-xl bg-red-500/10 border border-red-500/25 text-red-700 text-xs mb-4 flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        {/* Previous Reminder Notice to prevent accidental duplicates */}
        {latestReminder && (
          <div className="p-3 rounded-2xl bg-[#BC796F]/10 border border-[#BC796F]/20 text-xs text-[#88463F] mb-4 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Clock className="w-4 h-4 text-[#BC796F]" />
              <span>
                תזכורת קודמת נשלחה אל <bdi dir="ltr" className="font-bold">{latestReminder.recipient}</bdi> בתאריך {formatAttemptTime(latestReminder.timestamp)}
              </span>
            </div>
            <span className="text-[10px] px-2 py-0.5 rounded-md bg-white/60 border border-[#BC796F]/20 font-bold">
              נשלח בעבר
            </span>
          </div>
        )}

        {/* Balance & Due Date Highlight Card */}
        <div className="p-4 rounded-2xl bg-white/60 border border-white/90 shadow-xs mb-5 flex flex-wrap items-center justify-between gap-3 text-xs">
          <div>
            <span className="text-[#7D5A56]">יתרה פתוחה לתשלום:</span>
            <div className="text-xl font-black text-red-700 tabular-nums mt-0.5">
              {formattedOutstandingAmount}
            </div>
          </div>
          <div>
            <span className="text-[#7D5A56]">מועד פירעון שחלף:</span>
            <div className="text-sm font-bold text-warm-950 mt-0.5" dir="ltr">
              {formattedDueDate}
            </div>
          </div>
          <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-white text-[#7D5A56] border border-black/5 text-[11px]">
            <Paperclip className="w-3.5 h-3.5 text-[#BC796F]" />
            <span>קובץ PDF של המסמך יצורף למייל</span>
          </div>
        </div>

        {/* Email Edit Form */}
        <form onSubmit={handleSendReminder} className="flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-bold text-warm-900">
              כתובת דוא״ל של הלקוח (נמען):
            </label>
            <input
              type="email"
              dir="ltr"
              value={recipient}
              onChange={e => setRecipient(e.target.value)}
              placeholder="customer@example.com"
              required
              disabled={isPaidOrCanceled || isSending}
              className="w-full h-11 px-3.5 rounded-xl text-sm font-medium text-warm-950 bg-white/80 border border-white/90 focus:border-[#BC796F] focus:ring-2 focus:ring-[#BC796F]/20 text-left"
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-bold text-warm-900">נושא המייל:</label>
            <input
              type="text"
              value={subject}
              onChange={e => setSubject(e.target.value)}
              required
              disabled={isPaidOrCanceled || isSending}
              className="w-full h-11 px-3.5 rounded-xl text-sm font-medium text-warm-950 bg-white/80 border border-white/90 focus:border-[#BC796F] focus:ring-2 focus:ring-[#BC796F]/20 text-right"
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-bold text-warm-900">גוף הודעת התזכורת:</label>
            <textarea
              rows={6}
              value={messageBody}
              onChange={e => setMessageBody(e.target.value)}
              required
              disabled={isPaidOrCanceled || isSending}
              className="w-full p-3.5 rounded-xl text-sm font-medium text-warm-950 bg-white/80 border border-white/90 focus:border-[#BC796F] focus:ring-2 focus:ring-[#BC796F]/20 text-right leading-relaxed resize-none font-heebo"
            />
          </div>

          <div className="text-[11px] text-[#7D5A56] bg-white/40 p-3 rounded-xl border border-white/60 leading-relaxed">
            המייל יישלח באמצעות תבנית AMIT TOUCH הרשמית הממותגת, כולל לוגו מוטמע, פוטר מבודד כיווניות וקובץ PDF מקורי מצורף. תזכורות לעולם אינן נשלחות אוטומטית ללא אישורך המפורש.
          </div>

          <div className="flex items-center justify-end gap-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              disabled={isSending}
              className="px-4 py-2.5 rounded-xl text-xs font-semibold text-warm-800 hover:bg-white/50 transition-all"
            >
              ביטול
            </button>

            <button
              type="submit"
              disabled={isPaidOrCanceled || isSending}
              className="flex items-center gap-2 px-6 py-2.5 rounded-xl text-xs font-bold text-white bg-gradient-to-r from-[#88463F] to-[#BC796F] hover:from-[#6E352F] hover:to-[#A46A69] shadow-md transition-all active:scale-98 disabled:opacity-50 disabled:pointer-events-none"
            >
              <Send className="w-3.5 h-3.5" />
              <span>{isSending ? 'שולח תזכורת...' : 'אישור ושליחת תזכורת'}</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
