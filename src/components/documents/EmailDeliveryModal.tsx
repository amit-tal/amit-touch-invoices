import React, { useState, useEffect } from 'react';
import type { AppDocument, BusinessSettings } from '../../types/documents';
import { useDocuments } from '../../context/DocumentsContext';
import { useApp } from '../../context/AppContext';
import { getDocumentTypeTitle, getDefaultEmailContent } from '../../utils/moneyUtils';
import { 
  X, 
  Mail, 
  Send, 
  AlertTriangle, 
  AlertCircle, 
  CheckCircle2, 
  RefreshCw,
  Settings
} from 'lucide-react';

interface EmailDeliveryModalProps {
  isOpen: boolean;
  onClose: () => void;
  document: AppDocument;
  business: BusinessSettings;
  onSentSuccessfully?: (doc: AppDocument) => void;
}

export const EmailDeliveryModal: React.FC<EmailDeliveryModalProps> = ({
  isOpen,
  onClose,
  document,
  business,
  onSentSuccessfully,
}) => {
  const { clients, showToast } = useApp();
  const { checkEmailProviderStatus, sendDocumentEmail } = useDocuments();

  // Find saved client email address
  const clientObj = clients.find(c => c.id === document.clientId);
  const defaultRecipient = document.clientEmail || clientObj?.email || document.deliveryDetails?.recipient || '';

  const [recipient, setRecipient] = useState(defaultRecipient);
  const [subject, setSubject] = useState('');
  const [messageBody, setMessageBody] = useState('');
  const [isSending, setIsSending] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [isCheckingProvider, setIsCheckingProvider] = useState(false);
  const [providerStatus, setProviderStatus] = useState<{
    isConfigured: boolean;
    provider: string;
    fromEmail?: string;
    fromName?: string;
    missingRequirements: string[];
  }>({
    isConfigured: false,
    provider: 'none',
    missingRequirements: [],
  });

  // Server SMTP config form state
  const [showConfigForm, setShowConfigForm] = useState(false);
  const [smtpHost, setSmtpHost] = useState('');
  const [smtpPort, setSmtpPort] = useState('587');
  const [smtpSecure, setSmtpSecure] = useState(false);
  const [smtpUser, setSmtpUser] = useState('');
  const [smtpPass, setSmtpPass] = useState('');
  const [fromEmail, setFromEmail] = useState(business.email || '');
  const [fromName, setFromName] = useState(business.tradingName || business.legalName || 'AMIT TOUCH');
  const [isSavingConfig, setIsSavingConfig] = useState(false);
  const [configSuccessMsg, setConfigSuccessMsg] = useState('');

  // Initialize subject and message when document changes or modal opens
  useEffect(() => {
    if (!isOpen) return;

    setRecipient(document.clientEmail || clientObj?.email || document.deliveryDetails?.recipient || '');
    setErrorMsg('');
    setConfigSuccessMsg('');

    const { subject: defaultSubj, messageBody: defaultBody } = getDefaultEmailContent(document, business);
    setSubject(defaultSubj);
    setMessageBody(defaultBody);

    // Check provider status from server
    checkStatus();
  }, [isOpen, document.id]);

  const checkStatus = async () => {
    setIsCheckingProvider(true);
    try {
      const status = await checkEmailProviderStatus();
      setProviderStatus(status);
      if (status.fromEmail) setFromEmail(status.fromEmail);
      if (status.fromName) setFromName(status.fromName);
      if (status.smtpHost) setSmtpHost(status.smtpHost);
    } finally {
      setIsCheckingProvider(false);
    }
  };

  const handleSaveSmtpConfig = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSavingConfig(true);
    setErrorMsg('');
    setConfigSuccessMsg('');

    try {
      const res = await fetch('/api/documents/email-config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          provider: 'smtp',
          fromEmail: fromEmail.trim(),
          fromName: fromName.trim(),
          smtp: {
            host: smtpHost.trim(),
            port: parseInt(smtpPort, 10) || 587,
            secure: smtpSecure,
            user: smtpUser.trim(),
            pass: smtpPass,
          },
        }),
      });

      if (!res.ok) {
        throw new Error('שגיאה בשמירת הגדרות שרת הדוא״ל');
      }

      const newStatus = await res.json();
      setProviderStatus(newStatus);
      if (newStatus.isConfigured) {
        setConfigSuccessMsg('הגדרות שרת SMTP נשמרו בהצלחה בשרת.');
        setShowConfigForm(false);
        showToast('הגדרות שרת הדוא״ל נשמרו בהצלחה');
      } else {
        setErrorMsg('נשמר, אך עדיין חסרים שדות: ' + newStatus.missingRequirements.join(', '));
      }
    } catch (err: any) {
      setErrorMsg(err.message || 'שגיאה בשמירת ההגדרות');
    } finally {
      setIsSavingConfig(false);
    }
  };

  if (!isOpen) return null;

  const safeTypeStr = document.type === 'payment_request' ? 'חשבון_עסקה' : document.type === 'receipt' ? 'קבלה' : 'הצעת_מחיר';
  const pdfFilename = `${safeTypeStr}_${document.documentNumber || 'טיוטה'}.pdf`;

  const handleSend = async (e: React.FormEvent) => {
    e.preventDefault();

    // Prevent duplicate sends from repeated clicks
    if (isSending) return;

    if (!recipient.trim()) {
      setErrorMsg('חובה להזין כתובת דוא״ל של הנמען');
      return;
    }
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(recipient.trim())) {
      setErrorMsg(`כתובת הדוא״ל "${recipient}" אינה בפורמט תקין`);
      return;
    }

    if (!providerStatus.isConfigured) {
      setErrorMsg('לא הוגדר ספק דוא״ל בשרת. יש להגדיר שרת SMTP או מפתח ספק בטרם שליחה.');
      return;
    }

    setIsSending(true);
    setErrorMsg('');

    try {
      const result = await sendDocumentEmail({
        documentId: document.id,
        recipient: recipient.trim(),
        subject: subject.trim(),
        messageBody: messageBody.trim(),
      });

      if (result.success && result.document) {
        onSentSuccessfully?.(result.document);
        onClose();
      } else {
        setErrorMsg(result.error || 'שגיאה בשליחת הדוא״ל');
      }
    } catch (err: any) {
      setErrorMsg(err.message || 'שגיאה בלתי צפויה בשליחת הדוא״ל');
    } finally {
      setIsSending(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-5 bg-black/45 backdrop-blur-sm animate-fade-in font-heebo">
      <div 
        className="liquid-glass w-full max-w-2xl rounded-3xl shadow-2xl border border-white/70 flex flex-col max-h-[92vh] overflow-hidden my-auto"
        onClick={e => e.stopPropagation()}
      >
        {/* Top Header */}
        <div className="px-6 py-4 border-b border-[#BC796F]/15 flex items-center justify-between bg-white/50 shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-gradient-to-tr from-[#BC796F] to-[#E4AEA3] flex items-center justify-center text-white shadow-sm shadow-[#BC796F]/20">
              <Mail className="w-4 h-4" />
            </div>
            <div>
              <h2 className="text-base font-bold text-warm-950">
                שליחת {getDocumentTypeTitle(document.type)} בדוא״ל
              </h2>
              <div className="text-xs text-[#7D5A56] flex items-center gap-2">
                <span>מסמך {document.documentNumber ? `#${document.documentNumber}` : 'טיוטה'}</span>
                <span>•</span>
                <span>{document.clientName}</span>
              </div>
            </div>
          </div>

          <button
            onClick={onClose}
            disabled={isSending}
            className="p-1.5 rounded-xl text-warm-600 hover:text-warm-950 hover:bg-white/60 transition-colors disabled:opacity-50"
            aria-label="סגור"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Form Body */}
        <form onSubmit={handleSend} className="flex-1 overflow-y-auto p-6 flex flex-col gap-5">
          {/* Provider Status Alert Card */}
          {!providerStatus.isConfigured ? (
            <div className="p-4 rounded-2xl bg-warm-100/80 border border-warm-200 text-xs text-warm-900 flex flex-col gap-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2 font-bold text-[#88463F] text-sm">
                  <AlertTriangle className="w-4 h-4 text-[#88463F] shrink-0" />
                  <span>נדרשת הגדרת שרת דוא״ל מאומת (SMTP)</span>
                </div>
                <button
                  type="button"
                  onClick={checkStatus}
                  disabled={isCheckingProvider}
                  className="p-1 rounded-lg text-warm-700 hover:bg-white/60"
                  title="רענן בדיקת חיבור"
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${isCheckingProvider ? 'animate-spin' : ''}`} />
                </button>
              </div>

              <p className="leading-relaxed text-[#7D5A56]">
                המערכת שולחת דוא״ל אמיתי ומחייבת חיבור SMTP מאומת. איננו מדמים שליחה או מציגים הצלחה ללא שליחה בפועל.
              </p>

              {providerStatus.missingRequirements.length > 0 && (
                <div className="bg-white/80 p-2.5 rounded-xl border border-warm-200 font-medium text-warm-900">
                  <span className="font-bold text-[#88463F]">הגדרות חסרות בשרת: </span>
                  {providerStatus.missingRequirements.join(', ')}
                </div>
              )}

              <div className="pt-1">
                <button
                  type="button"
                  onClick={() => setShowConfigForm(!showConfigForm)}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold text-[#88463F] bg-white hover:bg-warm-50 border border-[#BC796F]/30 transition-all shadow-xs"
                >
                  <Settings className="w-3.5 h-3.5" />
                  <span>{showConfigForm ? 'סגור טופס הגדרת שרת' : 'הגדרת חיבור SMTP בשרת'}</span>
                </button>
              </div>

              {/* Collapsible SMTP Configuration Form */}
              {showConfigForm && (
                <div className="p-3.5 rounded-2xl bg-white/95 border border-[#BC796F]/25 flex flex-col gap-3 mt-1 shadow-xs">
                  <div className="font-bold text-warm-950 text-xs">הזנת פרטי שרת דואר יוצא (SMTP)</div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                    <div>
                      <label className="text-[11px] font-semibold text-warm-800">שרת SMTP (Host) *</label>
                      <input
                        type="text"
                        placeholder="smtp.gmail.com"
                        value={smtpHost}
                        onChange={e => setSmtpHost(e.target.value)}
                        className="w-full h-8 px-2.5 rounded-lg text-xs bg-warm-50/70 border border-warm-200 focus:outline-none focus:ring-1 focus:ring-[#BC796F]"
                        dir="ltr"
                      />
                    </div>
                    <div>
                      <label className="text-[11px] font-semibold text-warm-800">פורט (Port) *</label>
                      <input
                        type="number"
                        placeholder="587"
                        value={smtpPort}
                        onChange={e => setSmtpPort(e.target.value)}
                        className="w-full h-8 px-2.5 rounded-lg text-xs bg-warm-50/70 border border-warm-200 focus:outline-none focus:ring-1 focus:ring-[#BC796F]"
                        dir="ltr"
                      />
                    </div>
                    <div>
                      <label className="text-[11px] font-semibold text-warm-800">שם משתמש / דוא״ל שולח *</label>
                      <input
                        type="text"
                        placeholder="user@example.com"
                        value={smtpUser}
                        onChange={e => setSmtpUser(e.target.value)}
                        className="w-full h-8 px-2.5 rounded-lg text-xs bg-warm-50/70 border border-warm-200 focus:outline-none focus:ring-1 focus:ring-[#BC796F]"
                        dir="ltr"
                      />
                    </div>
                    <div>
                      <label className="text-[11px] font-semibold text-warm-800">סיסמה / App Password *</label>
                      <input
                        type="password"
                        placeholder="••••••••••••"
                        value={smtpPass}
                        onChange={e => setSmtpPass(e.target.value)}
                        className="w-full h-8 px-2.5 rounded-lg text-xs bg-warm-50/70 border border-warm-200 focus:outline-none focus:ring-1 focus:ring-[#BC796F]"
                        dir="ltr"
                      />
                    </div>
                    <div>
                      <label className="text-[11px] font-semibold text-warm-800">כתובת שולח מאומתת *</label>
                      <input
                        type="email"
                        placeholder="sender@amittouch.co.il"
                        value={fromEmail}
                        onChange={e => setFromEmail(e.target.value)}
                        className="w-full h-8 px-2.5 rounded-lg text-xs bg-warm-50/70 border border-warm-200 focus:outline-none focus:ring-1 focus:ring-[#BC796F]"
                        dir="ltr"
                      />
                    </div>
                    <div>
                      <label className="text-[11px] font-semibold text-warm-800">שם שולח</label>
                      <input
                        type="text"
                        placeholder="AMIT TOUCH Studio"
                        value={fromName}
                        onChange={e => setFromName(e.target.value)}
                        className="w-full h-8 px-2.5 rounded-lg text-xs bg-warm-50/70 border border-warm-200 focus:outline-none focus:ring-1 focus:ring-[#BC796F]"
                      />
                    </div>
                  </div>

                  <div className="flex items-center justify-between pt-1">
                    <label className="flex items-center gap-1.5 text-[11px] text-warm-800 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={smtpSecure}
                        onChange={e => setSmtpSecure(e.target.checked)}
                        className="rounded text-[#88463F]"
                      />
                      <span>חיבור מוצפן (SSL/TLS - עבור פורט 465)</span>
                    </label>

                    <button
                      type="button"
                      onClick={handleSaveSmtpConfig}
                      disabled={isSavingConfig || !smtpHost.trim() || !smtpUser.trim() || !smtpPass.trim()}
                      className="px-3.5 py-1.5 rounded-xl text-xs font-bold text-white bg-[#88463F] hover:bg-[#723832] disabled:opacity-50 transition-all shadow-xs"
                    >
                      {isSavingConfig ? 'שומר...' : 'שמור הגדרות שרת'}
                    </button>
                  </div>
                </div>
              )}
            </div>
          ) : (
            <div className="p-3 rounded-2xl bg-[#BC796F]/10 border border-[#BC796F]/25 flex items-center justify-between text-xs text-[#88463F]">
              <div className="flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 text-[#88463F] shrink-0" />
                <div>
                  <span className="font-bold">שרת דוא״ל מאומת פעיל </span>
                  <span className="text-[11px] mr-1">
                    (שולח: {providerStatus.fromName} &lt;{providerStatus.fromEmail}&gt;)
                  </span>
                </div>
              </div>
              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  onClick={() => setShowConfigForm(!showConfigForm)}
                  className="p-1 rounded-lg text-[#88463F] hover:bg-white/60 text-[11px] font-medium"
                  title="ערוך הגדרות שרת"
                >
                  עריכה
                </button>
                <button
                  type="button"
                  onClick={checkStatus}
                  disabled={isCheckingProvider}
                  className="p-1 text-[#88463F] hover:bg-white/60 rounded-lg"
                  title="בדוק מצב שרת"
                >
                  <RefreshCw className={`w-3 h-3 ${isCheckingProvider ? 'animate-spin' : ''}`} />
                </button>
              </div>
            </div>
          )}

          {configSuccessMsg && (
            <div className="p-3 rounded-2xl bg-[#BC796F]/10 border border-[#BC796F]/30 text-xs text-[#88463F] animate-fade-in font-medium">
              {configSuccessMsg}
            </div>
          )}

          {/* Error Message Alert */}
          {errorMsg && (
            <div className="p-3.5 rounded-2xl bg-red-50 border border-red-200 flex items-start gap-2.5 text-xs text-red-900 animate-fade-in">
              <AlertCircle className="w-4 h-4 text-red-600 shrink-0 mt-0.5" />
              <div className="flex-1 leading-relaxed">{errorMsg}</div>
            </div>
          )}

          {/* Recipient Input */}
          <div className="flex flex-col gap-1.5">
            <div className="flex items-center justify-between">
              <label className="text-xs font-bold text-warm-900">כתובת דוא״ל של הנמען *</label>
              {clientObj?.email && clientObj.email !== recipient && (
                <button
                  type="button"
                  onClick={() => setRecipient(clientObj.email || '')}
                  className="text-[11px] text-[#88463F] hover:underline"
                >
                  החזר לכתובת השמורה של הלקוח ({clientObj.email})
                </button>
              )}
            </div>
            <input
              type="email"
              required
              value={recipient}
              onChange={e => setRecipient(e.target.value)}
              placeholder="client@company.co.il"
              className="h-10 px-3.5 rounded-xl text-xs bg-white/80 border border-warm-200 text-warm-900 focus:outline-none focus:ring-2 focus:ring-[#BC796F]/40 transition-all"
              dir="ltr"
            />
          </div>

          {/* Subject Input */}
          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-bold text-warm-900">נושא ההודעה *</label>
            <input
              type="text"
              required
              value={subject}
              onChange={e => setSubject(e.target.value)}
              placeholder="נושא ההודעה"
              className="h-10 px-3.5 rounded-xl text-xs bg-white/80 border border-warm-200 text-warm-900 focus:outline-none focus:ring-2 focus:ring-[#BC796F]/40 transition-all"
            />
          </div>

          {/* Message Body Textarea */}
          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-bold text-warm-900">תוכן ההודעה</label>
            <textarea
              rows={5}
              value={messageBody}
              onChange={e => setMessageBody(e.target.value)}
              placeholder="תוכן ההודעה ללקוח..."
              className="p-3 rounded-xl text-xs bg-white/80 border border-warm-200 text-warm-900 focus:outline-none focus:ring-2 focus:ring-[#BC796F]/40 transition-all leading-relaxed"
            />
          </div>

          {/* Attached Document Card & Legal Compliance Status */}
          <div className="flex flex-col gap-2">
            <div className="p-3.5 rounded-2xl bg-white/60 border border-[#BC796F]/20 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-xl bg-[#88463F] text-white flex items-center justify-center font-bold text-[11px] shadow-xs">
                  PDF
                </div>
                <div>
                  <div className="text-xs font-bold text-warm-950" dir="ltr">
                    {pdfFilename}
                  </div>
                  <div className="text-[11px] text-[#7D5A56]">
                    {document.digitalSignature?.isSigned ? (
                      <span className="text-emerald-800 font-semibold">
                        ✓ קובץ חתום אלקטרונית בחתימה {document.digitalSignature.signatureCategory === 'certified' ? 'מאושרת' : 'מאובטחת'} לפי סעיף 18ב
                      </span>
                    ) : (
                      <span>קובץ מסמך מקור שמור יצורף לשליחה</span>
                    )}
                  </div>
                </div>
              </div>
              <span className="text-[11px] font-bold text-[#88463F] bg-[#BC796F]/10 px-2.5 py-1 rounded-lg">
                מצורף
              </span>
            </div>

            {/* Electronic Delivery Consent Warning (Section 18ב(ג)) */}
            {clientObj && clientObj.electronicConsent?.status !== 'consented' && (
              <div className="p-3 rounded-xl bg-amber-500/10 border border-amber-500/25 flex items-start gap-2 text-xs text-amber-900">
                <AlertTriangle className="w-4 h-4 text-amber-700 shrink-0 mt-0.5" />
                <div className="leading-relaxed">
                  <strong>לתשומת לבך:</strong> הלקוח ״{clientObj.name}״ {clientObj.electronicConsent?.status === 'withdrawn' ? 'ביטל את הסכמתו לקבלת מסמכים ממוחשבים' : 'טרם אישר בכתב קבלת מסמכים ממוחשבים בדוא״ל'}. סעיף 18ב(ג) להוראות מס הכנסה (ניהול פנקסי חשבונות) מחייב קבלת הסכמה מראש ובכתב לפני הפצה דיגיטלית.
                </div>
              </div>
            )}

            {/* Cryptographic Signature Notice */}
            {!document.digitalSignature?.isSigned && (
              <div className="p-3 rounded-xl bg-warm-100/70 border border-warm-200/80 flex items-start gap-2 text-xs text-warm-800">
                <AlertCircle className="w-4 h-4 text-[#88463F] shrink-0 mt-0.5" />
                <div className="leading-relaxed text-[11px]">
                  <strong>סטטוס חתימה:</strong> המסמך כולל חתימה חזותית בלבד ואינו חתום דיגיטלית בחתימה מאובטחת/מאושרת. משלוח אלקטרוני מחייב חתימה דיגיטלית מאובטחת או מאושרת בהתאם לחוזר 24/2004.
                </div>
              </div>
            )}
          </div>

          {/* Bottom Actions */}
          <div className="flex items-center justify-end gap-2.5 pt-3 border-t border-[#BC796F]/15">
            <button
              type="button"
              onClick={onClose}
              disabled={isSending}
              className="px-4 py-2 rounded-xl text-xs font-semibold text-warm-800 hover:bg-white/60 transition-all"
            >
              ביטול
            </button>

            <button
              type="submit"
              disabled={isSending || !providerStatus.isConfigured}
              className="flex items-center gap-2 px-5 py-2.5 rounded-xl text-xs font-bold text-white bg-[#88463F] hover:bg-[#723832] disabled:opacity-50 disabled:cursor-not-allowed shadow-md transition-all active:scale-95"
            >
              {isSending ? (
                <>
                  <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                  <span>שולח...</span>
                </>
              ) : (
                <>
                  <Send className="w-3.5 h-3.5" />
                  <span>שלח מסמך בדוא״ל</span>
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
