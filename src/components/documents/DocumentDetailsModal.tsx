import React, { useState } from 'react';
import { useApp } from '../../context/AppContext';
import { useDocuments } from '../../context/DocumentsContext';
import type { AppDocument } from '../../types/documents';
import { DocumentPdfPrintView } from './DocumentPdfPrintView';
import { 
  formatCurrency, 
  getDocumentTypeTitle, 
  getStatusBadgeInfo,
  getDeliveryStatusBadge 
} from '../../utils/moneyUtils';
import { formatDeliveryTimestamp } from '../../utils/dateUtils';
import { 
  X, 
  Printer, 
  FileDown,
  CreditCard, 
  Trash2, 
  Edit3, 
  Ban, 
  Clock, 
  AlertTriangle, 
  FileCheck, 
  ArrowRight, 
  RefreshCw, 
  Mail, 
  MessageSquare, 
  BellRing,
  ShieldCheck,
  ShieldAlert,
  CheckCircle2
} from 'lucide-react';
import { downloadDocumentPdf } from '../../utils/pdfExportUtils';
import { EmailDeliveryModal } from './EmailDeliveryModal';
import { ManualDeliveryModal } from './ManualDeliveryModal';
import { PaymentReminderModal } from './PaymentReminderModal';

interface DocumentDetailsModalProps {
  isOpen: boolean;
  onClose: () => void;
  document: AppDocument | null;
  onEditDraft?: (doc: AppDocument) => void;
  onRecordPayment?: (doc: AppDocument) => void;
  onConvertQuote?: (doc: AppDocument) => void;
}

export const DocumentDetailsModal: React.FC<DocumentDetailsModalProps> = ({
  isOpen,
  onClose,
  document: propDoc,
  onEditDraft,
  onRecordPayment,
  onConvertQuote,
}) => {
  const { showToast, clients } = useApp();
  const { 
    cancelDocument, 
    deleteDraft, 
    updateDraftWithLatestBusiness,
    businessSettings,
    documents 
  } = useDocuments();

  // Always use the latest document data from context if available
  const document = documents.find(d => d.id === propDoc?.id) || propDoc;
  const clientObj = clients.find(c => c.id === document?.clientId);

  const [activeTab, setActiveTab] = useState<'view' | 'payments' | 'audit' | 'delivery'>('view');
  const [isCancelModalOpen, setIsCancelModalOpen] = useState(false);
  const [cancelReason, setCancelReason] = useState('');
  const [isEmailModalOpen, setIsEmailModalOpen] = useState(false);
  const [isManualModalOpen, setIsManualModalOpen] = useState(false);
  const [isPaymentReminderOpen, setIsPaymentReminderOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isExportingPdf, setIsExportingPdf] = useState(false);
  const [isVerifyingSig, setIsVerifyingSig] = useState(false);
  const [sigVerifyResult, setSigVerifyResult] = useState<any>(null);

  const handleVerifySignature = async () => {
    if (!document) return;
    setIsVerifyingSig(true);
    try {
      const res = await fetch('/api/documents/validate-signature', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ documentId: document.id }),
      });
      const data = await res.json();
      setSigVerifyResult(data);
      if (data.isValid) {
        showToast('אימות הצליח: חתימה אלקטרונית ושלמות המסמך תקינות');
      } else {
        showToast(data.details || 'אימות החתימה נכשל');
      }
    } catch {
      showToast('שגיאה בתקשורת עם שרת האימות');
    } finally {
      setIsVerifyingSig(false);
    }
  };

  // Close on Escape key
  React.useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen) {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen || !document) return null;

  const statusInfo = getStatusBadgeInfo(document.status, document.type);

  // Linked receipts (for payment request)
  const linkedReceipts = documents.filter(doc => 
    doc.type === 'receipt' && 
    doc.paymentAllocations?.some(a => a.paymentRequestId === document.id)
  );

  // Cancellation
  const handleConfirmCancel = async () => {
    if (!cancelReason.trim()) {
      showToast('חובה להזין סיבת ביטול');
      return;
    }
    setIsSubmitting(true);
    try {
      const ok = await cancelDocument(document.id, cancelReason.trim());
      if (ok) {
        showToast('המסמך בוטל בהצלחה ונרשם ביומן הביקורת');
        setIsCancelModalOpen(false);
        onClose();
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  // Refresh draft with latest business profile
  const handleRefreshDraftBusiness = async () => {
    if (!document || document.status !== 'draft') return;
    setIsSubmitting(true);
    try {
      await updateDraftWithLatestBusiness(document.id);
    } catch (err: any) {
      showToast(err.message || 'שגיאה בעדכון פרטי העסק בטיוטה');
    } finally {
      setIsSubmitting(false);
    }
  };

  // Delete draft
  const handleDeleteDraft = async () => {
    if (document.status !== 'draft') return;
    setIsSubmitting(true);
    try {
      const ok = await deleteDraft(document.id);
      if (ok) {
        showToast('טיוטת המסמך נמחקה בהצלחה');
        onClose();
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  const handlePrint = () => {
    window.print();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-5 overflow-y-auto bg-black/40 backdrop-blur-sm animate-fade-in font-heebo print:p-0 print:m-0 print:static print:bg-transparent print:backdrop-blur-none print:overflow-visible print:block print:z-auto">
      <div 
        className="liquid-glass w-full max-w-5xl rounded-3xl shadow-2xl border border-white/60 flex flex-col max-h-[92vh] overflow-hidden my-auto print:border-none print:shadow-none print:bg-transparent print:backdrop-blur-none print:max-h-none print:overflow-visible print:w-full print:max-w-none print:p-0 print:m-0"
        onClick={e => e.stopPropagation()}
      >
        {/* Modal Top Bar */}
        <div className="px-6 py-4 border-b border-[#BC796F]/15 flex items-center justify-between bg-white/40 shrink-0 print-hide print:hidden">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-gradient-to-tr from-[#BC796F] to-[#E4AEA3] flex items-center justify-center text-white shadow-md shadow-[#BC796F]/20">
              <FileCheck className="w-5 h-5" />
            </div>

            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-xl font-bold text-warm-950">
                  {getDocumentTypeTitle(document.type)}
                </h2>
                {document.documentNumber ? (
                  <span className="text-sm font-bold text-[#88463F] tabular-nums" dir="ltr">
                    #{document.documentNumber}
                  </span>
                ) : (
                  <span className="inline-flex items-center whitespace-nowrap shrink-0 text-xs font-bold font-heebo px-3 py-0.5 rounded-full bg-[#BC796F]/15 text-[#88463F] border border-[#BC796F]/30 shadow-xs">
                    טיוטה — לא מסמך רשמי
                  </span>
                )}
                {document.isTestMode && (
                  <span className="inline-flex items-center whitespace-nowrap shrink-0 text-xs font-bold font-heebo px-2.5 py-0.5 rounded-full bg-amber-100 text-amber-900 border border-amber-300">
                    מצב בדיקה
                  </span>
                )}
              </div>

              <div className="flex items-center gap-2 mt-0.5 text-xs text-[#7D5A56]">
                <span>{document.clientName}</span>
                <span>•</span>
                <span>תאריך: {document.date}</span>
                <span>•</span>
                <span className={`px-2 py-0.5 rounded-full text-[11px] font-semibold ${statusInfo.bgClass} ${statusInfo.textClass}`}>
                  {statusInfo.label}
                </span>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {/* Nav Tabs */}
            <div className="flex items-center p-1 rounded-xl bg-white/50 border border-white/70">
              <button
                type="button"
                onClick={() => setActiveTab('view')}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                  activeTab === 'view' ? 'bg-[#BC796F] text-white shadow-sm' : 'text-warm-800'
                }`}
              >
                תצוגת מסמך
              </button>

              {document.type === 'payment_request' && (
                <button
                  type="button"
                  onClick={() => setActiveTab('payments')}
                  className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                    activeTab === 'payments' ? 'bg-[#BC796F] text-white shadow-sm' : 'text-warm-800'
                  }`}
                >
                  תשלומים ({linkedReceipts.length})
                </button>
              )}

              <button
                type="button"
                onClick={() => setActiveTab('audit')}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                  activeTab === 'audit' ? 'bg-[#BC796F] text-white shadow-sm' : 'text-warm-800'
                }`}
              >
                יומן בקרה ({document.auditTrail?.length || 0})
              </button>

              <button
                type="button"
                onClick={() => setActiveTab('delivery')}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                  activeTab === 'delivery' ? 'bg-[#BC796F] text-white shadow-sm' : 'text-warm-800'
                }`}
              >
                מסירה
              </button>
            </div>

            <button
              onClick={onClose}
              className="p-2 rounded-xl text-warm-600 hover:text-warm-900 hover:bg-white/60 transition-colors"
              aria-label="סגור"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Content Area */}
        <div className="flex-1 overflow-y-auto p-6 scrollbar-none print:p-0 print:m-0 print:overflow-visible print:block">
          {activeTab === 'view' && (
            <div className="max-w-4xl mx-auto flex flex-col gap-4 print:max-w-none print:w-full print:p-0 print:m-0">
              {/* Compliance & Electronic Signature Status Banner (print-hidden) */}
              <div className="print:hidden p-4 rounded-2xl bg-white/75 backdrop-blur-md border border-white/80 shadow-xs flex flex-col gap-3 text-xs">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div className="flex items-center gap-2.5">
                    {document.digitalSignature?.isSigned ? (
                      <div className="w-8 h-8 rounded-xl bg-emerald-500/15 border border-emerald-500/30 flex items-center justify-center text-emerald-800">
                        <ShieldCheck className="w-4 h-4" />
                      </div>
                    ) : (
                      <div className="w-8 h-8 rounded-xl bg-amber-500/15 border border-amber-500/30 flex items-center justify-center text-amber-800">
                        <ShieldAlert className="w-4 h-4" />
                      </div>
                    )}
                    <div>
                      <div className="font-bold text-warm-950 flex items-center gap-2">
                        <span>
                          {document.digitalSignature?.isSigned
                            ? `מסמך ממוחשב — נחתם בחתימה אלקטרונית ${document.digitalSignature.signatureCategory === 'certified' ? 'מאושרת' : 'מאובטחת'}`
                            : 'חתימה גרפית בלבד — ללא חתימה אלקטרונית מאושרת/מאובטחת (סעיף 18ב)'}
                        </span>
                        {document.signedPdfFilename && (
                          <span className="text-[10px] px-2 py-0.5 rounded-full bg-warm-100 text-warm-700 font-mono">
                            שמור בארכיון מסמכים
                          </span>
                        )}
                      </div>
                      <div className="text-[11px] text-[#7D5A56] mt-0.5">
                        {document.digitalSignature?.isSigned ? (
                          <span>
                            נחתם על ידי {document.digitalSignature.signerName} • אלגוריתם: {document.digitalSignature.algorithm}
                          </span>
                        ) : (
                          <span>
                            המסמך מכיל תמונת חתימה בלבד. בהתאם לסעיף 18ב להוראות מס הכנסה, משלוח דיגיטלי תקף מחייב חתימה מאובטחת/מאושרת.
                          </span>
                        )}
                      </div>
                    </div>
                  </div>

                  {document.signedPdfFilename && (
                    <button
                      type="button"
                      onClick={handleVerifySignature}
                      disabled={isVerifyingSig}
                      className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold text-[#88463F] bg-[#BC796F]/10 hover:bg-[#BC796F]/20 border border-[#BC796F]/30 transition-all shadow-xs disabled:opacity-50"
                    >
                      <RefreshCw className={`w-3.5 h-3.5 ${isVerifyingSig ? 'animate-spin' : ''}`} />
                      <span>{isVerifyingSig ? 'מאמת...' : 'בדיקת שלמות וחתימה אלקטרונית'}</span>
                    </button>
                  )}
                </div>

                {/* Signature Verification Details */}
                {sigVerifyResult && (
                  <div className={`p-3 rounded-xl border text-xs flex flex-col gap-1.5 animate-in fade-in ${
                    sigVerifyResult.isValid
                      ? 'bg-emerald-500/10 border-emerald-500/25 text-emerald-950'
                      : 'bg-rose-500/10 border-rose-500/25 text-rose-950'
                  }`}>
                    <div className="flex items-center gap-2 font-bold">
                      {sigVerifyResult.isValid ? (
                        <>
                          <CheckCircle2 className="w-4 h-4 text-emerald-700" />
                          <span>שלמות המסמך מאומתת: התוכן לא שונה מעת החתימה</span>
                        </>
                      ) : (
                        <>
                          <AlertTriangle className="w-4 h-4 text-rose-700" />
                          <span>אימות נכשל: {sigVerifyResult.details || 'חתימה לא תקינה'}</span>
                        </>
                      )}
                    </div>
                    {sigVerifyResult.signerCommonName && (
                      <div className="text-[11px] text-warm-700">
                        חותם מאומת: <strong>{sigVerifyResult.signerCommonName}</strong> {sigVerifyResult.signatureTime && `(${sigVerifyResult.signatureTime})`}
                      </div>
                    )}
                    {sigVerifyResult.details && (
                      <div className="text-[11px] font-mono text-warm-600">
                        {sigVerifyResult.details}
                      </div>
                    )}
                  </div>
                )}

                {/* Client electronic consent status & Assessing Officer notification advisory */}
                <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-[#BC796F]/10 text-[11px] text-[#7D5A56]">
                  <div className="flex items-center gap-1.5">
                    <span className="font-semibold text-warm-900">הסכמת לקוח למשלוח ממוחשב:</span>
                    {clientObj?.electronicConsent?.status === 'consented' ? (
                      <span className="text-emerald-800 font-bold">
                        ✓ אושרה מיום {clientObj.electronicConsent.consentedAt || ''} ({clientObj.electronicConsent.sourceReference || 'הסכמה בכתב'})
                      </span>
                    ) : (
                      <span className="text-amber-800 font-bold">
                        טרם אושר בכתב לפי סעיף 18ב
                      </span>
                    )}
                  </div>
                  <div>
                    <span>תזכורת: חוזר 24/2004 מחייב מתן הודעה לפקיד השומה על הפצת מסמכים ממוחשבים.</span>
                  </div>
                </div>
              </div>

              <DocumentPdfPrintView document={document} business={businessSettings} />
            </div>
          )}

          {activeTab === 'payments' && (
            <div className="flex flex-col gap-5 max-w-3xl mx-auto">
              {/* Payment Summary Header */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 p-4 rounded-2xl bg-white/50 border border-white/70">
                <div className="flex flex-col">
                  <span className="text-xs text-warm-600 font-medium">סך המסמך לתשלום:</span>
                  <span className="text-base font-bold text-warm-950 tabular-nums">
                    {formatCurrency(document.totalAmount, document.currency)}
                  </span>
                </div>

                <div className="flex flex-col">
                  <span className="text-xs text-emerald-700 font-medium">סך ששולם עד כה:</span>
                  <span className="text-base font-bold text-emerald-800 tabular-nums">
                    {formatCurrency(document.paidAmount, document.currency)}
                  </span>
                </div>

                <div className="flex flex-col">
                  <span className="text-xs text-rose-700 font-medium">יתרה לתשלום:</span>
                  <span className="text-base font-bold text-rose-800 tabular-nums">
                    {formatCurrency(document.remainingBalance, document.currency)}
                  </span>
                </div>
              </div>

              {/* Linked Receipts List */}
              <div className="flex flex-col gap-3">
                <h3 className="text-sm font-bold text-warm-950">קבלות המשויכות למסמך זה</h3>

                {linkedReceipts.length === 0 ? (
                  <div className="p-8 text-center rounded-2xl bg-white/40 border border-white/60 text-warm-600 text-xs">
                    טרם נרשמו קבלות או תשלומים עבור חשבון עסקה זה.
                  </div>
                ) : (
                  <div className="flex flex-col gap-2">
                    {linkedReceipts.map(rec => {
                      const alloc = rec.paymentAllocations?.find(a => a.paymentRequestId === document.id);
                      return (
                        <div 
                          key={rec.id}
                          className="p-4 rounded-xl bg-white/60 border border-white/80 flex items-center justify-between text-xs"
                        >
                          <div className="flex flex-col">
                            <span className="font-bold text-warm-900">
                              קבלה מס׳ {rec.documentNumber || rec.id}
                            </span>
                            <span className="text-[11px] text-warm-600">
                              תאריך: {rec.paymentReceivedDate || rec.date}
                            </span>
                          </div>

                          <div className="flex items-center gap-3">
                            <span className="text-xs text-warm-600">סכום שיוך:</span>
                            <span className="text-sm font-bold text-emerald-800 tabular-nums">
                              {formatCurrency(alloc?.allocatedAmount || rec.totalAmount, rec.currency)}
                            </span>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>
          )}

          {activeTab === 'audit' && (
            <div className="flex flex-col gap-3 max-w-3xl mx-auto">
              <h3 className="text-sm font-bold text-warm-950">יומן ביקורת ובקרת שינויים (Audit Trail)</h3>
              <p className="text-xs text-[#7D5A56]">
                תיעוד היסטורי מפורט של כל הפעולות, ההנפקות, התשלומים והשינויים שבוצעו במסמך.
              </p>

              <div className="flex flex-col gap-2 mt-2">
                {document.auditTrail && document.auditTrail.length > 0 ? (
                  document.auditTrail.map((log) => (
                    <div 
                      key={log.id}
                      className="p-3.5 rounded-xl bg-white/60 border border-white/70 flex items-start justify-between gap-4 text-xs"
                    >
                      <div className="flex items-start gap-2.5">
                        <Clock className="w-4 h-4 text-[#BC796F] shrink-0 mt-0.5" />
                        <div>
                          <div className="font-bold text-warm-950">{log.details}</div>
                          <div className="text-[11px] text-warm-600 mt-0.5">
                            בוצע ע״י: {log.performedBy}
                          </div>
                        </div>
                      </div>

                      <span className="text-[11px] text-warm-500 shrink-0 tabular-nums" dir="ltr">
                        {new Date(log.timestamp).toLocaleString('he-IL')}
                      </span>
                    </div>
                  ))
                ) : (
                  <div className="p-6 text-center rounded-xl bg-white/40 text-warm-600 text-xs">
                    אין רשומות ביקורת זמינות.
                  </div>
                )}
              </div>
            </div>
          )}

          {activeTab === 'delivery' && (
            <div className="flex flex-col gap-5 max-w-2xl mx-auto p-4 sm:p-6 rounded-2xl bg-white/50 border border-white/70">
              <div className="flex items-center justify-between pb-2 border-b border-warm-200/60">
                <div>
                  <h3 className="text-sm font-bold text-warm-950">סטטוס מסירה</h3>
                </div>
                {(() => {
                  const b = getDeliveryStatusBadge(document);
                  return (
                    <span className={`px-3 py-1 rounded-full text-xs font-bold ${b.bgClass} ${b.textClass}`} title={b.tooltip}>
                      {b.label}
                    </span>
                  );
                })()}
              </div>

              {/* Concise Record */}
              <div className="p-4 rounded-2xl bg-white/70 border border-white/90 flex flex-col gap-3">
                {document.deliveryStatus === 'sent' && (
                  <div className="text-xs text-warm-900 leading-relaxed font-medium">
                    <span>נשלח אל </span>
                    <span dir="ltr" className="font-bold text-warm-950">{document.deliveryDetails?.recipient}</span>
                    <span> {formatDeliveryTimestamp(document.deliveryDetails?.sentAt)}</span>
                  </div>
                )}

                {document.deliveryStatus === 'failed' && (
                  <div className="text-xs text-red-900 leading-relaxed">
                    <span className="font-bold">השליחה נכשלה</span>
                    {document.deliveryDetails?.recipient && (
                      <>
                        <span> (נמען: </span>
                        <span dir="ltr">{document.deliveryDetails.recipient}</span>
                        <span>)</span>
                      </>
                    )}
                    {document.deliveryDetails?.sendAttempts?.[0]?.error && (
                      <span className="text-red-700"> — {document.deliveryDetails.sendAttempts[0].error}</span>
                    )}
                  </div>
                )}

                {document.deliveryStatus === 'bounced' && (
                  <div className="text-xs text-red-900 leading-relaxed">
                    <span>לא נמסר אל </span>
                    <span dir="ltr" className="font-bold text-red-950">{document.deliveryDetails?.recipient}</span>
                    <span> {formatDeliveryTimestamp(document.deliveryDetails?.sentAt)}</span>
                  </div>
                )}

                {document.deliveryStatus === 'manual_delivery' && (
                  <div className="text-xs text-warm-900 leading-relaxed">
                    <span>נמסר ידנית ({document.deliveryDetails?.manualMethod === 'whatsapp' ? 'וואטסאפ' : 'שליח'}) לידי </span>
                    <span className="font-bold text-warm-950">{document.deliveryDetails?.recipient || document.clientName}</span>
                    {document.deliveryDetails?.deliveredAt && (
                      <span> {formatDeliveryTimestamp(document.deliveryDetails.deliveredAt)}</span>
                    )}
                    {document.deliveryDetails?.notes && (
                      <div className="text-[11px] text-[#7D5A56] mt-1">הערה: {document.deliveryDetails.notes}</div>
                    )}
                  </div>
                )}

                {document.deliveryStatus === 'not_sent' && (
                  <div className="text-xs text-[#7D5A56]">
                    טרם נשלח
                  </div>
                )}

                {/* Action buttons */}
                <div className="flex flex-wrap items-center gap-2.5 pt-3 border-t border-warm-200/50">
                  <button
                    type="button"
                    onClick={() => setIsEmailModalOpen(true)}
                    className="flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold text-white bg-[#88463F] hover:bg-[#723832] shadow-sm transition-all"
                  >
                    <Mail className="w-3.5 h-3.5" />
                    <span>שליחה בדוא״ל</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setIsManualModalOpen(true)}
                    className="flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-bold text-warm-800 bg-white hover:bg-warm-50 border border-warm-300 transition-all"
                  >
                    <MessageSquare className="w-3.5 h-3.5 text-warm-600" />
                    <span>תיעוד מסירה ידני</span>
                  </button>
                </div>
              </div>

              {/* Concise Sending History */}
              {document.deliveryDetails?.sendAttempts && document.deliveryDetails.sendAttempts.length > 0 && (
                <div className="flex flex-col gap-2 pt-1">
                  <h4 className="text-xs font-bold text-warm-900 flex items-center gap-1.5">
                    <Clock className="w-3.5 h-3.5 text-[#BC796F]" />
                    <span>היסטוריית שליחות</span>
                  </h4>
                  <div className="flex flex-col gap-2">
                    {document.deliveryDetails.sendAttempts.map((attempt) => {
                      const isTest = attempt.status === 'test_only' || attempt.isTestOnly;
                      const isSent = attempt.status === 'sent';
                      const isFailed = attempt.status === 'failed';
                      const isBounced = attempt.status === 'bounced';

                      const badgeText = isTest
                        ? 'בדיקה בלבד — לא נשלח'
                        : isSent
                        ? 'נשלח'
                        : isFailed
                        ? 'השליחה נכשלה'
                        : isBounced
                        ? 'לא נמסר'
                        : 'טרם נשלח';

                      const badgeClass = isTest
                        ? 'bg-warm-100/80 text-[#7D5A56] border border-warm-200'
                        : isSent
                        ? 'bg-[#BC796F]/15 text-[#88463F] border border-[#BC796F]/30'
                        : 'bg-red-50 text-red-800 border border-red-200';

                      return (
                        <div
                          key={attempt.id}
                          className="p-3 rounded-xl bg-white/70 border border-warm-200/60 text-xs flex items-center justify-between gap-3"
                        >
                          <div className="flex items-center gap-2.5 min-w-0">
                            <span className={`px-2.5 py-0.5 rounded-full text-[10px] font-bold shrink-0 ${badgeClass}`}>
                              {badgeText}
                            </span>
                            <span className="text-warm-900 truncate">
                              {isTest ? (
                                <>בדיקה בלבד — לא נשלח אל <span dir="ltr" className="font-semibold">{attempt.recipient}</span></>
                              ) : isSent ? (
                                <>נשלח אל <span dir="ltr" className="font-semibold">{attempt.recipient}</span></>
                              ) : isFailed ? (
                                <>השליחה נכשלה אל <span dir="ltr" className="font-semibold">{attempt.recipient}</span>{attempt.error ? ` (${attempt.error})` : ''}</>
                              ) : isBounced ? (
                                <>לא נמסר אל <span dir="ltr" className="font-semibold">{attempt.recipient}</span></>
                              ) : (
                                <span dir="ltr">{attempt.recipient}</span>
                              )}
                            </span>
                          </div>
                          <span className="text-[11px] text-[#7D5A56] shrink-0 font-medium tabular-nums">
                            {formatDeliveryTimestamp(attempt.timestamp)}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Modal Bottom Action Bar */}
        <div className="px-6 py-4 border-t border-[#BC796F]/15 bg-white/40 flex items-center justify-between shrink-0 print-hide print:hidden">
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => downloadDocumentPdf(document, businessSettings, setIsExportingPdf, showToast)}
              disabled={isExportingPdf}
              className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-bold text-white bg-[#88463F] hover:bg-[#723832] shadow-sm transition-all disabled:opacity-60"
              title="הורדת קובץ PDF ישירות ללא תפריטי הדפסה של הדפדפן"
            >
              <FileDown className={`w-4 h-4 ${isExportingPdf ? 'animate-bounce' : ''}`} />
              <span>{isExportingPdf ? 'מייצא PDF...' : 'שמירת PDF'}</span>
            </button>

            <button
              type="button"
              onClick={handlePrint}
              className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-bold text-warm-800 bg-white/80 hover:bg-white border border-warm-200 transition-all"
              title="הדפסה במדפסת (תבנית מסמך נקייה ללא סרגלי האפליקציה)"
            >
              <Printer className="w-4 h-4 text-[#BC796F]" />
              <span>הדפסה</span>
            </button>

            {document.status !== 'draft' && document.status !== 'canceled' && (
              <button
                type="button"
                onClick={() => setIsEmailModalOpen(true)}
                className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-bold text-white bg-[#88463F] hover:bg-[#723832] shadow-sm transition-all"
                title="שליחת המסמך בדוא״ל ללקוח עם קובץ PDF מצורף"
              >
                <Mail className="w-4 h-4" />
                <span>שליחה בדוא״ל</span>
              </button>
            )}

            {document.status === 'draft' && (
              <button
                type="button"
                onClick={handleDeleteDraft}
                disabled={isSubmitting}
                className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-bold text-red-700 bg-red-50 hover:bg-red-100 border border-red-200 transition-all"
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span>מחק טיוטה</span>
              </button>
            )}

            {document.status !== 'draft' && document.status !== 'canceled' && (
              <button
                type="button"
                onClick={() => setIsCancelModalOpen(true)}
                disabled={isSubmitting}
                className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-bold text-red-700 bg-red-50 hover:bg-red-100 border border-red-200 transition-all"
              >
                <Ban className="w-3.5 h-3.5" />
                <span>ביטול מסמך</span>
              </button>
            )}
          </div>

          <div className="flex items-center gap-2">
            {document.status === 'draft' && (
              <button
                type="button"
                onClick={handleRefreshDraftBusiness}
                disabled={isSubmitting}
                className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-bold text-[#88463F] bg-[#BC796F]/15 hover:bg-[#BC796F]/25 border border-[#BC796F]/30 transition-all shadow-xs disabled:opacity-50"
                title="עדכון פרטי העסק בטיוטה לפי הפרופיל העדכני ביותר"
              >
                <RefreshCw className={`w-3.5 h-3.5 text-[#BC796F] ${isSubmitting ? 'animate-spin' : ''}`} />
                <span>עדכון פרטי העסק</span>
              </button>
            )}

            {document.status === 'draft' && onEditDraft && (
              <button
                type="button"
                onClick={() => {
                  onClose();
                  onEditDraft(document);
                }}
                className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-bold text-white bg-[#BC796F] hover:bg-[#A46A69] transition-all"
              >
                <Edit3 className="w-3.5 h-3.5" />
                <span>עריכת טיוטה</span>
              </button>
            )}

            {document.type === 'payment_request' && 
             document.status !== 'draft' && 
             document.status !== 'canceled' && 
             document.remainingBalance > 0 && (
              <button
                type="button"
                onClick={() => setIsPaymentReminderOpen(true)}
                className="flex items-center gap-1.5 px-3.5 py-2.5 rounded-xl text-xs font-bold text-amber-900 bg-amber-50 hover:bg-amber-100 border border-amber-300 shadow-sm transition-all active:scale-95"
                title="שליחת תזכורת תשלום ללקוח בדוא״ל"
              >
                <BellRing className="w-4 h-4 text-amber-700" />
                <span>שליחת תזכורת</span>
              </button>
            )}

            {document.type === 'payment_request' && 
             document.status !== 'draft' && 
             document.status !== 'canceled' && 
             document.remainingBalance > 0 && 
             onRecordPayment && (
              <button
                type="button"
                onClick={() => {
                  onClose();
                  onRecordPayment(document);
                }}
                className="flex items-center gap-1.5 px-4 py-2.5 rounded-xl text-xs font-bold text-white bg-emerald-600 hover:bg-emerald-700 shadow-md transition-all active:scale-95"
              >
                <CreditCard className="w-4 h-4" />
                <span>רשום קבלה לתשלום</span>
              </button>
            )}

            {document.type === 'quote' && 
             document.status !== 'canceled' && 
             onConvertQuote && (
              <button
                type="button"
                onClick={() => {
                  onClose();
                  onConvertQuote(document);
                }}
                className="flex items-center gap-1.5 px-4 py-2.5 rounded-xl text-xs font-bold text-white bg-[#BC796F] hover:bg-[#A46A69] shadow-md transition-all active:scale-95"
              >
                <ArrowRight className="w-4 h-4" />
                <span>המר לחשבון עסקה</span>
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Cancellation Reason Modal */}
      {isCancelModalOpen && (
        <div className="fixed inset-0 z-60 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm animate-fade-in">
          <div className="bg-white rounded-2xl p-6 max-w-md w-full shadow-2xl border border-red-200 flex flex-col gap-4">
            <div className="flex items-center gap-2.5 text-red-700">
              <AlertTriangle className="w-5 h-5 shrink-0" />
              <h3 className="font-bold text-base">ביטול מסמך רשמי</h3>
            </div>

            <p className="text-xs text-warm-700 leading-relaxed">
              מסמך רשמי שהונפק אינו נמחק ממאגר הנתונים כדי לשמור על רצף חשבונאי תקין. הביטול יסומן במערכת ויירשם ביומן הבקרה עם סיבת הביטול.
            </p>

            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-bold text-warm-900">סיבת הביטול (חובה) *</label>
              <textarea
                rows={3}
                value={cancelReason}
                onChange={e => setCancelReason(e.target.value)}
                placeholder="הסבר קצר על סיבת ביטול המסמך (למשל: שגיאה בסכום, ביטול עסקה על ידי לקוח...)"
                className="w-full p-2.5 rounded-xl text-xs border border-warm-200 text-warm-900 focus:border-red-400 focus:ring-1 focus:ring-red-400"
              />
            </div>

            <div className="flex items-center justify-end gap-2 pt-2 border-t border-warm-100">
              <button
                type="button"
                onClick={() => setIsCancelModalOpen(false)}
                className="px-3.5 py-1.5 rounded-xl text-xs font-semibold text-warm-800 hover:bg-warm-100"
              >
                חזרה
              </button>

              <button
                type="button"
                onClick={handleConfirmCancel}
                disabled={isSubmitting || !cancelReason.trim()}
                className="px-4 py-1.5 rounded-xl text-xs font-bold text-white bg-red-600 hover:bg-red-700 transition-colors disabled:opacity-50"
              >
                אישור ביטול המסמך
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Real Email Delivery Modal */}
      {isEmailModalOpen && (
        <EmailDeliveryModal
          isOpen={isEmailModalOpen}
          onClose={() => setIsEmailModalOpen(false)}
          document={document}
          business={businessSettings}
          onSentSuccessfully={() => {
            showToast('המסמך נשלח בהצלחה לספק הדוא״ל');
          }}
        />
      )}

      {/* Manual Delivery Modal */}
      {isManualModalOpen && (
        <ManualDeliveryModal
          isOpen={isManualModalOpen}
          onClose={() => setIsManualModalOpen(false)}
          document={document}
          onSavedSuccessfully={() => {
            showToast('תיעוד המסירה הידני נשמר בהצלחה');
          }}
        />
      )}

      {/* Payment Reminder Modal */}
      {isPaymentReminderOpen && (
        <PaymentReminderModal
          isOpen={isPaymentReminderOpen}
          onClose={() => setIsPaymentReminderOpen(false)}
          document={document}
        />
      )}
    </div>
  );
};
