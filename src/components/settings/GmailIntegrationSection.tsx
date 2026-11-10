import React, { useState, useEffect } from 'react';
import { useApp } from '../../context/AppContext';
import { 
  Mail, 
  CheckCircle2, 
  AlertTriangle, 
  RefreshCw, 
  SendHorizontal, 
  Unlink, 
  Info,
  ShieldCheck
} from 'lucide-react';

export const GmailIntegrationSection: React.FC = () => {
  const { showToast } = useApp();
  const [oauthStatus, setOauthStatus] = useState<{
    isConfigured: boolean;
    isConnected: boolean;
    connectedEmail?: string;
    connectedAt?: string;
    missingEnv: string[];
  }>({
    isConfigured: false,
    isConnected: false,
    missingEnv: [],
  });
  const [isLoading, setIsLoading] = useState(false);
  const [isDisconnecting, setIsDisconnecting] = useState(false);
  const [testEmail, setTestEmail] = useState('');
  const [isSendingTest, setIsSendingTest] = useState(false);
  const [testSuccessMsg, setTestSuccessMsg] = useState('');
  const [errorMsg, setErrorMsg] = useState('');
  const [showGuide, setShowGuide] = useState(false);

  useEffect(() => {
    fetchStatus();

    // Listen for postMessage from OAuth popup
    const handleMessage = (e: MessageEvent) => {
      if (e.data?.type === 'GMAIL_CONNECTED') {
        showToast(`חשבון Gmail חובר בהצלחה (${e.data.email})`);
        fetchStatus();
      }
    };
    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
  }, []);

  const fetchStatus = async () => {
    setIsLoading(true);
    try {
      const res = await fetch('/api/auth/google/status');
      if (res.ok) {
        const data = await res.json();
        setOauthStatus(data);
        if (data.connectedEmail && !testEmail) {
          setTestEmail(data.connectedEmail);
        }
      }
    } catch {
      // Ignore network glitch
    } finally {
      setIsLoading(false);
    }
  };

  const handleConnect = async () => {
    setErrorMsg('');
    try {
      const res = await fetch('/api/auth/google/url');
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'שגיאה ביצירת קישור התחברות ל-Google');

      // Open OAuth popup window
      const width = 560;
      const height = 650;
      const left = window.screenX + (window.outerWidth - width) / 2;
      const top = window.screenY + (window.outerHeight - height) / 2;
      window.open(
        data.url,
        'google_oauth_popup',
        `width=${width},height=${height},left=${left},top=${top},toolbar=no,menubar=no,location=no`
      );
    } catch (err: any) {
      setErrorMsg(err.message || 'שגיאה בחיבור לחשבון Google');
    }
  };

  const handleDisconnect = async () => {
    if (!window.confirm('האם אתה בטוח שברצונך לנתק את חשבון ה-Gmail מהמערכת?')) return;
    setIsDisconnecting(true);
    setErrorMsg('');
    try {
      const res = await fetch('/api/auth/google/disconnect', { method: 'POST' });
      if (!res.ok) throw new Error('שגיאה בניתוק החשבון');
      showToast('חשבון Gmail נותק בהצלחה');
      await fetchStatus();
    } catch (err: any) {
      setErrorMsg(err.message || 'שגיאה בניתוק החשבון');
    } finally {
      setIsDisconnecting(false);
    }
  };

  const handleSendTest = async () => {
    if (!testEmail.trim()) {
      setErrorMsg('יש להזין כתובת דוא״ל לבדיקה');
      return;
    }
    setIsSendingTest(true);
    setErrorMsg('');
    setTestSuccessMsg('');
    try {
      const res = await fetch('/api/documents/send-test-email', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ recipient: testEmail.trim() }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'שגיאה בשליחת מייל בדיקה');
      setTestSuccessMsg(`מייל בדיקה נשלח בהצלחה דרך ${data.result?.provider}!`);
      showToast('מייל בדיקה נשלח בהצלחה');
    } catch (err: any) {
      setErrorMsg(err.message || 'שגיאה בשליחת מייל בדיקה');
    } finally {
      setIsSendingTest(false);
    }
  };

  return (
    <div className="card-warm p-6 rounded-3xl border border-warm-200/80 bg-white/70 shadow-sm flex flex-col gap-5">
      {/* Header */}
      <div className="flex items-center justify-between pb-3 border-b border-warm-200/60">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-2xl bg-gradient-to-tr from-[#EA4335] via-[#FBBC05] to-[#4285F4] flex items-center justify-center text-white shadow-sm shadow-[#EA4335]/20">
            <Mail className="w-5 h-5 text-white" />
          </div>
          <div>
            <h2 className="text-base font-bold text-warm-950 flex items-center gap-2">
              <span>אינטגרציית דוא״ל ישירה — Gmail API</span>
              <span className="text-[11px] px-2 py-0.5 rounded-full bg-blue-50 text-blue-700 font-semibold border border-blue-200/60">
                HTTPS Port 443
              </span>
            </h2>
            <p className="text-xs text-[#7D5A56] mt-0.5">
              שליחת חשבונות עסקה, קבלות ומסמכים רשמיים ישירות מכתובת ה-Gmail האישית שלך ב-Render Free.
            </p>
          </div>
        </div>

        <button
          type="button"
          onClick={fetchStatus}
          disabled={isLoading}
          className="p-1.5 rounded-xl text-warm-600 hover:text-warm-950 hover:bg-white transition-colors"
          title="רענן מצב חיבור"
        >
          <RefreshCw className={`w-4 h-4 ${isLoading ? 'animate-spin' : ''}`} />
        </button>
      </div>

      {errorMsg && (
        <div className="p-3.5 rounded-2xl bg-red-50 border border-red-200 text-xs text-red-900 leading-relaxed">
          {errorMsg}
        </div>
      )}

      {/* Connected State */}
      {oauthStatus.isConnected ? (
        <div className="flex flex-col gap-4">
          <div className="p-4 rounded-2xl bg-[#E8F5E9] border border-[#C8E6C9] flex items-center justify-between text-xs text-[#2E7D32]">
            <div className="flex items-center gap-2.5">
              <CheckCircle2 className="w-5 h-5 text-[#2E7D32] shrink-0" />
              <div>
                <div className="font-bold text-sm">חשבון Gmail מחובר ופעיל</div>
                <div className="text-[12px] text-[#1B5E20] font-mono mt-0.5" dir="ltr">
                  {oauthStatus.connectedEmail}
                </div>
              </div>
            </div>

            <button
              type="button"
              onClick={handleDisconnect}
              disabled={isDisconnecting}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold text-red-700 bg-white hover:bg-red-50 border border-red-200 transition-colors shadow-xs"
            >
              <Unlink className="w-3.5 h-3.5" />
              <span>{isDisconnecting ? 'מנתק...' : 'ניתוק חשבון Gmail'}</span>
            </button>
          </div>

          {/* Test Email Card */}
          <div className="p-4 rounded-2xl bg-warm-50/70 border border-warm-200/70 flex flex-col gap-2.5">
            <div className="font-bold text-warm-950 text-xs flex items-center gap-1.5">
              <SendHorizontal className="w-3.5 h-3.5 text-[#88463F]" />
              <span>בדיקת מסירה באמצעות Gmail API</span>
            </div>
            <div className="flex items-center gap-2">
              <input
                type="email"
                placeholder="הזן כתובת דוא״ל לבדיקה..."
                value={testEmail}
                onChange={e => setTestEmail(e.target.value)}
                className="flex-1 h-9 px-3 rounded-xl text-xs bg-white border border-warm-300 focus:outline-none focus:ring-1 focus:ring-[#BC796F] font-mono"
                dir="ltr"
              />
              <button
                type="button"
                onClick={handleSendTest}
                disabled={isSendingTest || !testEmail.trim()}
                className="px-4 h-9 rounded-xl text-xs font-bold text-white bg-[#88463F] hover:bg-[#723832] disabled:opacity-50 transition-colors flex items-center gap-1.5 shrink-0 shadow-xs"
              >
                <span>{isSendingTest ? 'שולח...' : 'שלח מייל בדיקה עם PDF'}</span>
              </button>
            </div>

            {testSuccessMsg && (
              <div className="p-2.5 rounded-xl bg-green-50 text-green-900 border border-green-200 text-xs">
                {testSuccessMsg}
              </div>
            )}
          </div>
        </div>
      ) : oauthStatus.isConfigured ? (
        /* Configured in env, ready to connect */
        <div className="p-4 rounded-2xl bg-blue-50/70 border border-blue-200/80 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-start gap-3">
            <div className="w-8 h-8 rounded-xl bg-blue-100 flex items-center justify-center text-blue-700 shrink-0 mt-0.5">
              <ShieldCheck className="w-4 h-4" />
            </div>
            <div>
              <div className="font-bold text-sm text-blue-950">הגדרות Google Cloud זוהו בשרת</div>
              <div className="text-xs text-blue-800 mt-0.5 leading-relaxed">
                משתני הסביבה הוגדרו. נותר רק לאשר את הגישה מחשבון ה-Gmail שלך בלחיצה אחת.
              </div>
            </div>
          </div>

          <button
            type="button"
            onClick={handleConnect}
            className="px-5 py-2.5 rounded-xl text-xs font-bold text-white bg-[#1A73E8] hover:bg-[#1557B0] transition-all shadow-sm flex items-center justify-center gap-2 shrink-0"
          >
            <Mail className="w-4 h-4" />
            <span>חיבור לחשבון Gmail</span>
          </button>
        </div>
      ) : (
        /* Missing credentials in env */
        <div className="p-4 rounded-2xl bg-amber-50 border border-amber-200 text-xs text-amber-950 flex flex-col gap-3">
          <div className="flex items-center gap-2 font-bold text-amber-900 text-sm">
            <AlertTriangle className="w-4 h-4 text-amber-700 shrink-0" />
            <span>נדרשת הגדרת מפתחות Google Cloud ב-Render</span>
          </div>
          <p className="leading-relaxed text-amber-800">
            כדי לחבר את חשבון ה-Gmail שלך, יש להגדיר ב-Render את משתני הסביבה הבאים:
          </p>
          <div className="bg-white/80 p-2.5 rounded-xl border border-amber-200/80 font-mono text-amber-950 flex flex-col gap-1">
            {oauthStatus.missingEnv.map(env => (
              <div key={env}>• <strong>{env}</strong></div>
            ))}
          </div>
          <div className="pt-1 flex items-center gap-2">
            <button
              type="button"
              onClick={() => setShowGuide(!showGuide)}
              className="text-xs font-bold text-[#88463F] hover:underline flex items-center gap-1"
            >
              <Info className="w-3.5 h-3.5" />
              <span>{showGuide ? 'הסתר הוראות הגדרה' : 'הצג הוראות מפורטות להגדרה ב-Google Cloud'}</span>
            </button>
          </div>
        </div>
      )}

      {/* Expandable Guide */}
      {showGuide && (
        <div className="p-4 rounded-2xl bg-warm-50 border border-warm-200 text-xs text-warm-900 leading-relaxed flex flex-col gap-2.5 animate-fade-in">
          <div className="font-bold text-sm text-[#88463F]">שלבי ההגדרה ב-Google Cloud Console:</div>
          <ol className="list-decimal list-inside space-y-1.5 text-[#5C4542]">
            <li>היכנס ל-<strong>Google Cloud Console</strong> (<span dir="ltr">console.cloud.google.com</span>) ופתח פרויקט חדש בשם <strong>AMIT TOUCH</strong>.</li>
            <li>תחת <strong>APIs & Services &gt; Library</strong>, חפש את <strong>Gmail API</strong> ולחץ על <strong>Enable</strong>.</li>
            <li>תחת <strong>OAuth consent screen</strong>, בחר <strong>External</strong>, הזן את שם האפליקציה ודוא״ל התמיכה, והוסף תחת <strong>Test Users</strong> את כתובת ה-Gmail שלך: <strong dir="ltr">amit2001tal@gmail.com</strong>.</li>
            <li>תחת <strong>Credentials &gt; Create Credentials &gt; OAuth client ID</strong>, בחר <strong>Web application</strong>.</li>
            <li>תחת <strong>Authorized redirect URIs</strong> הוסף את שתי הכתובות:<br />
              • <code className="bg-white px-1.5 py-0.5 rounded border border-warm-300" dir="ltr">https://bussines-4mfs.onrender.com/api/auth/google/callback</code><br />
              • <code className="bg-white px-1.5 py-0.5 rounded border border-warm-300" dir="ltr">http://localhost:3000/api/auth/google/callback</code>
            </li>
            <li>העתק את <strong>Client ID</strong> ו-<strong>Client Secret</strong> והדבק אותם ב-Render תחת Environment Variables כ-<strong>GMAIL_CLIENT_ID</strong> ו-<strong>GMAIL_CLIENT_SECRET</strong>.</li>
          </ol>
        </div>
      )}
    </div>
  );
};
