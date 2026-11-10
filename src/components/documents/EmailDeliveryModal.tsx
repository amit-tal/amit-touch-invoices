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
  Settings,
  SendHorizontal
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

  // Server email config form state
  const [showConfigForm, setShowConfigForm] = useState(false);
  const [selectedProviderTab, setSelectedProviderTab] = useState<'resend' | 'smtp' | 'brevo'>('resend');
  const [resendApiKey, setResendApiKey] = useState('');
  const [brevoApiKey, setBrevoApiKey] = useState('');
  const [smtpHost, setSmtpHost] = useState('smtp.gmail.com');
  const [smtpPort, setSmtpPort] = useState('587');
  const [smtpSecure, setSmtpSecure] = useState(false);
  const [smtpUser, setSmtpUser] = useState('');
  const [smtpPass, setSmtpPass] = useState('');
  const [fromEmail, setFromEmail] = useState(business.email || '');
  const [fromName, setFromName] = useState(business.tradingName || business.legalName || 'AMIT TOUCH');
  const [isSavingConfig, setIsSavingConfig] = useState(false);
  const [configSuccessMsg, setConfigSuccessMsg] = useState('');

  // Test email state
  const [testRecipient, setTestRecipient] = useState('');
  const [isSendingTest, setIsSendingTest] = useState(false);
  const [testSuccessMsg, setTestSuccessMsg] = useState('');

  // Initialize subject and message when document changes or modal opens
  useEffect(() => {
    if (!isOpen) return;

    setRecipient(document.clientEmail || clientObj?.email || document.deliveryDetails?.recipient || '');
    setErrorMsg('');
    setConfigSuccessMsg('');
    setTestSuccessMsg('');

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
      if (status.fromEmail) {
        setFromEmail(status.fromEmail);
        if (!testRecipient) setTestRecipient(status.fromEmail);
      }
      if (status.fromName) setFromName(status.fromName);
      if (status.provider === 'smtp') {
        setSelectedProviderTab('smtp');
      } else if (status.provider === 'brevo') {
        setSelectedProviderTab('brevo');
      } else if (status.provider === 'resend') {
        setSelectedProviderTab('resend');
      }
    } finally {
      setIsCheckingProvider(false);
    }
  };

  const handleSaveConfig = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSavingConfig(true);
    setErrorMsg('');
    setConfigSuccessMsg('');

    try {
      const payload: any = {
        provider: selectedProviderTab,
        fromEmail: fromEmail.trim(),
        fromName: fromName.trim(),
      };

      if (selectedProviderTab === 'resend') {
        payload.resendApiKey = resendApiKey.trim();
      } else if (selectedProviderTab === 'brevo') {
        payload.brevoApiKey = brevoApiKey.trim();
      } else if (selectedProviderTab === 'smtp') {
        payload.smtp = {
          host: smtpHost.trim(),
          port: parseInt(smtpPort, 10) || 587,
          secure: smtpSecure,
          user: smtpUser.trim(),
          pass: smtpPass,
        };
      }

      const res = await fetch('/api/documents/email-config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        throw new Error('שגיאה בשמירת הגדרות שרת הדוא״ל');
      }

      const newStatus = await res.json();
      setProviderStatus(newStatus);
      if (newStatus.isConfigured) {
        setConfigSuccessMsg('הגדרות ספק הדוא״ל נשמרו בהצלחה בשרת.');
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

  const handleSendTestEmail = async () => {
    if (!testRecipient.trim()) {
      setErrorMsg('יש להזין כתובת דוא״ל לשליחת בדיקה');
      return;
    }
    setIsSendingTest(true);
    setErrorMsg('');
    setTestSuccessMsg('');

    try {
      const res = await fetch('/api/documents/send-test-email', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          recipient: testRecipient.trim(),
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'שגיאה בשליחת מייל בדיקה');
      }

      setTestSuccessMsg(`מייל בדיקה עם קובץ PDF לדוגמה נשלח בהצלחה דרך ${data.result?.provider}!`);
      showToast('מייל בדיקה נשלח בהצלחה');
    } catch (err: any) {
      setErrorMsg(err.message || 'שגיאה בשליחת מייל בדיקה');
    } finally {
      setIsSendingTest(false);
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
      setErrorMsg('לא הוגדר ספק דוא״ל בשרת. יש להגדיר חיבור Resend HTTPS API או שרת SMTP בטרם שליחה.');
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
                  <span>נדרשת הגדרת ספק דוא״ל מאומת (HTTPS API או SMTP)</span>
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
                המערכת שולחת דוא״ל אמיתי עם צירוף מסמך ה-PDF. בשרת Render Free חסומים פורטים של SMTP (465, 587), ולכן מומלץ להשתמש ב-<strong>Resend HTTPS API</strong> (פורט 443 חופשי לחלוטין וללא עלות).
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
                  <span>{showConfigForm ? 'סגור טופס הגדרת ספק' : 'הגדרת ספק דוא״ל בשרת'}</span>
                </button>
              </div>

              {/* Collapsible Configuration Form */}
              {showConfigForm && (
                <div className="p-3.5 rounded-2xl bg-white/95 border border-[#BC796F]/25 flex flex-col gap-3.5 mt-1 shadow-xs">
                  {/* Provider Tabs */}
                  <div className="flex border-b border-warm-200 gap-1 pb-1">
                    <button
                      type="button"
                      onClick={() => setSelectedProviderTab('resend')}
                      className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
                        selectedProviderTab === 'resend'
                          ? 'bg-[#88463F] text-white shadow-xs'
                          : 'text-warm-700 hover:bg-warm-100'
                      }`}
                    >
                      Resend HTTPS API (מומלץ ל-Render)
                    </button>
                    <button
                      type="button"
                      onClick={() => setSelectedProviderTab('smtp')}
                      className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
                        selectedProviderTab === 'smtp'
                          ? 'bg-[#88463F] text-white shadow-xs'
                          : 'text-warm-700 hover:bg-warm-100'
                      }`}
                    >
                      Gmail SMTP (לוקאלי)
                    </button>
                    <button
                      type="button"
                      onClick={() => setSelectedProviderTab('brevo')}
                      className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
                        selectedProviderTab === 'brevo'
                          ? 'bg-[#88463F] text-white shadow-xs'
                          : 'text-warm-700 hover:bg-warm-100'
                      }`}
                    >
                      Brevo HTTPS API
                    </button>
                  </div>

                  {/* Resend Fields */}
                  {selectedProviderTab === 'resend' && (
                    <div className="flex flex-col gap-2.5">
                      <div className="text-[11px] text-[#7D5A56] bg-warm-50 p-2 rounded-lg border border-warm-200/60 leading-relaxed">
                        פועל דרך HTTPS פורט 443 — עוקף את חסימת ה-SMTP של Render Free. מסלול חינמי: 3,000 מיילים בחודש / 100 ביום ללא עלות.
                      </div>
                      <div>
                        <label className="text-[11px] font-semibold text-warm-800">מפתח API של Resend (RESEND_API_KEY) *</label>
                        <input
                          type="password"
                          placeholder="re_1234567890abcdef..."
                          value={resendApiKey}
                          onChange={e => setResendApiKey(e.target.value)}
                          className="w-full h-8 px-2.5 rounded-lg text-xs bg-warm-50/70 border border-warm-200 focus:outline-none focus:ring-1 focus:ring-[#BC796F]"
                          dir="ltr"
                        />
                      </div>
                    </div>
                  )}

                  {/* Brevo Fields */}
                  {selectedProviderTab === 'brevo' && (
                    <div className="flex flex-col gap-2.5">
                      <div className="text-[11px] text-[#7D5A56] bg-warm-50 p-2 rounded-lg border border-warm-200/60 leading-relaxed">
                        פועל דרך HTTPS פורט 443. מסלול חינמי: 300 מיילים ביום (9,000 בחודש). מאפשר אימות כתובת מייל בודדת (Single Sender) ללא צורך בדומיין DNS.
                      </div>
                      <div>
                        <label className="text-[11px] font-semibold text-warm-800">מפתח API של Brevo (BREVO_API_KEY) *</label>
                        <input
                          type="password"
                          placeholder="xkeysib-..."
                          value={brevoApiKey}
                          onChange={e => setBrevoApiKey(e.target.value)}
                          className="w-full h-8 px-2.5 rounded-lg text-xs bg-warm-50/70 border border-warm-200 focus:outline-none focus:ring-1 focus:ring-[#BC796F]"
                          dir="ltr"
                        />
                      </div>
                    </div>
                  )}

                  {/* SMTP Fields */}
                  {selectedProviderTab === 'smtp' && (
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                      <div className="sm:col-span-2 text-[11px] text-[#7D5A56] bg-warm-50 p-2 rounded-lg border border-warm-200/60 leading-relaxed">
                        מתאים לסביבת פיתוח מקומית (Localhost). ב-Render Free פורטים אלה חסומים.
                      </div>
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
                          placeholder="amit2001tal@gmail.com"
                          value={smtpUser}
                          onChange={e => setSmtpUser(e.target.value)}
                          className="w-full h-8 px-2.5 rounded-lg text-xs bg-warm-50/70 border border-warm-200 focus:outline-none focus:ring-1 focus:ring-[#BC796F]"
                          dir="ltr"
                        />
                      </div>
                      <div>
                        <label className="text-[11px] font-semibold text-warm-800">סיסמת אפליקציה של גוגל *</label>
                        <input
                          type="password"
                          placeholder="••••••••••••"
                          value={smtpPass}
                          onChange={e => setSmtpPass(e.target.value)}
                          className="w-full h-8 px-2.5 rounded-lg text-xs bg-warm-50/70 border border-warm-200 focus:outline-none focus:ring-1 focus:ring-[#BC796F]"
                          dir="ltr"
                        />
                      </div>
                      <div className="sm:col-span-2">
                        <label className="flex items-center gap-1.5 text-[11px] text-warm-800 cursor-pointer">
                          <input
                            type="checkbox"
                            checked={smtpSecure}
                            onChange={e => setSmtpSecure(e.target.checked)}
                            className="rounded text-[#88463F]"
                          />
                          <span>חיבור SSL/TLS (פעיל אוטומטית עבור פורט 465)</span>
                        </label>
                      </div>
                    </div>
                  )}

                  {/* Common Sender Fields */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 pt-1 border-t border-warm-200/60">
                    <div>
                      <label className="text-[11px] font-semibold text-warm-800">כתובת שולח מאומתת (EMAIL_FROM) *</label>
                      <input
                        type="email"
                        placeholder="billing@amittouch.com"
                        value={fromEmail}
                        onChange={e => setFromEmail(e.target.value)}
                        className="w-full h-8 px-2.5 rounded-lg text-xs bg-warm-50/70 border border-warm-200 focus:outline-none focus:ring-1 focus:ring-[#BC796F]"
                        dir="ltr"
                      />
                    </div>
                    <div>
                      <label className="text-[11px] font-semibold text-warm-800">שם שולח (EMAIL_FROM_NAME)</label>
                      <input
                        type="text"
                        placeholder="AMIT TOUCH Studio"
                        value={fromName}
                        onChange={e => setFromName(e.target.value)}
                        className="w-full h-8 px-2.5 rounded-lg text-xs bg-warm-50/70 border border-warm-200 focus:outline-none focus:ring-1 focus:ring-[#BC796F]"
                      />
                    </div>
                  </div>

                  <div className="flex items-center justify-end pt-1">
                    <button
                      type="button"
                      onClick={handleSaveConfig}
                      disabled={isSavingConfig}
                      className="px-3.5 py-1.5 rounded-xl text-xs font-bold text-white bg-[#88463F] hover:bg-[#723832] disabled:opacity-50 transition-all shadow-xs"
                    >
                      {isSavingConfig ? 'שומר...' : 'שמור הגדרות ספק בשרת'}
                    </button>
                  </div>
                </div>
              )}
            </div>
          ) : (
            <div className="p-3.5 rounded-2xl bg-[#BC796F]/10 border border-[#BC796F]/25 flex flex-col gap-2.5 text-xs text-[#88463F]">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4 text-[#88463F] shrink-0" />
                  <div>
                    <span className="font-bold">ספק דוא״ל מאומת פעיל ({providerStatus.provider.toUpperCase()}) </span>
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

              {/* Delivery Verification Mini-Tool */}
              <div className="flex items-center gap-2 pt-1 border-t border-[#BC796F]/20">
                <input
                  type="email"
                  placeholder="כתובת דוא״ל לבדיקת מסירה..."
                  value={testRecipient}
                  onChange={e => setTestRecipient(e.target.value)}
                  className="flex-1 h-7 px-2.5 rounded-lg text-[11px] bg-white/80 border border-[#BC796F]/30 focus:outline-none focus:ring-1 focus:ring-[#BC796F]"
                  dir="ltr"
                />
                <button
                  type="button"
                  onClick={handleSendTestEmail}
                  disabled={isSendingTest || !testRecipient.trim()}
                  className="px-2.5 h-7 rounded-lg text-[11px] font-bold text-white bg-[#88463F] hover:bg-[#723832] disabled:opacity-50 flex items-center gap-1 shrink-0 shadow-xs"
                >
                  <SendHorizontal className="w-3 h-3" />
                  <span>{isSendingTest ? 'שולח...' : 'בדיקת מסירה עם PDF'}</span>
                </button>
              </div>

              {testSuccessMsg && (
                <div className="p-2 rounded-lg bg-green-50 text-green-900 border border-green-200 text-[11px]">
                  {testSuccessMsg}
                </div>
              )}
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
              className="w-full h-10 px-3.5 rounded-xl text-sm bg-white/70 border border-[#BC796F]/25 focus:outline-none focus:ring-2 focus:ring-[#BC796F]/50 transition-all font-mono"
              dir="ltr"
            />
            {/* Auto-BCC notification */}
            <div className="flex items-center gap-1.5 text-[11px] text-[#7D5A56] mt-0.5">
              {recipient.trim().toLowerCase() === 'amit2001tal@gmail.com' ? (
                <span className="text-[#88463F] font-medium">
                  הנמען הוא חשבון הבעלים — לא יישלח עותק כפול ב-BCC.
                </span>
              ) : (
                <span>
                  עותק נסתר (BCC) יישלח אוטומטית ל-<strong>amit2001tal@gmail.com</strong> עם אותו תוכן וקובץ ה-PDF.
                </span>
              )}
            </div>
          </div>

          {/* Subject Input */}
          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-bold text-warm-900">נושא ההודעה *</label>
            <input
              type="text"
              required
              value={subject}
              onChange={e => setSubject(e.target.value)}
              placeholder="נושא המייל..."
              className="w-full h-10 px-3.5 rounded-xl text-sm bg-white/70 border border-[#BC796F]/25 focus:outline-none focus:ring-2 focus:ring-[#BC796F]/50 transition-all"
            />
          </div>

          {/* Message Body Textarea */}
          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-bold text-warm-900">תוכן ההודעה ללקוח</label>
            <textarea
              rows={5}
              value={messageBody}
              onChange={e => setMessageBody(e.target.value)}
              placeholder="תוכן ההודעה..."
              className="w-full p-3.5 rounded-xl text-sm bg-white/70 border border-[#BC796F]/25 focus:outline-none focus:ring-2 focus:ring-[#BC796F]/50 transition-all resize-y leading-relaxed"
            />
          </div>

          {/* Attachment preview note */}
          <div className="p-3.5 rounded-2xl bg-white/60 border border-[#BC796F]/20 flex items-center justify-between text-xs">
            <div className="flex items-center gap-2">
              <span className="font-bold text-[#88463F]">קובץ מצורף:</span>
              <span className="text-warm-800 font-mono text-[11px] bg-white px-2 py-0.5 rounded border border-[#BC796F]/20">
                {pdfFilename}
              </span>
            </div>
            <span className="text-[#7D5A56] text-[11px]">
              {(document.signedPdfFilename || document.digitalSignature?.isSigned) ? 'קובץ PDF חתום דיגיטלית (סעיף 18ב)' : 'קובץ PDF'}
            </span>
          </div>

          {/* Footer Actions */}
          <div className="flex items-center justify-end gap-3 pt-2 border-t border-[#BC796F]/15">
            <button
              type="button"
              onClick={onClose}
              disabled={isSending}
              className="px-5 py-2.5 rounded-xl text-xs font-semibold text-warm-800 hover:bg-white/60 transition-colors disabled:opacity-50"
            >
              ביטול
            </button>
            <button
              type="submit"
              disabled={isSending || !providerStatus.isConfigured}
              className="px-6 py-2.5 rounded-xl text-xs font-bold text-white bg-gradient-to-r from-[#BC796F] to-[#88463F] hover:from-[#ab6c63] hover:to-[#723832] disabled:opacity-50 shadow-md shadow-[#BC796F]/20 transition-all flex items-center gap-2"
            >
              {isSending ? (
                <>
                  <RefreshCw className="w-4 h-4 animate-spin" />
                  <span>שולח לספק הדוא״ל...</span>
                </>
              ) : (
                <>
                  <Send className="w-4 h-4" />
                  <span>שלח דוא״ל עכשיו</span>
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
