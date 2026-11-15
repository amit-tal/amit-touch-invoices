import React, { useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { GlassRibbonsBackground } from './GlassRibbonsBackground';
import { Lock, Mail, KeyRound, ShieldAlert, ArrowLeft, Loader2, Eye, EyeOff, ShieldCheck } from 'lucide-react';

export const LoginView: React.FC = () => {
  const { isConfigured, recoveryAvailable, login, setup, recoverOwner } = useAuth();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [setupToken, setSetupToken] = useState('');
  const [recoveryKey, setRecoveryKey] = useState('');
  const [isRecoveryMode, setIsRecoveryMode] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [retryAfterSeconds, setRetryAfterSeconds] = useState<number | null>(null);

  // Setup mode if server has no configured owner yet
  const isSetupMode = !isConfigured;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);
    setSuccessMessage(null);

    const cleanEmail = email.trim();
    if (!cleanEmail) {
      setErrorMessage('נא להזין כתובת דוא״ל');
      return;
    }

    if (isRecoveryMode) {
      if (!recoveryKey.trim()) {
        setErrorMessage('נא להזין את מפתח השחזור (SETUP_TOKEN מיומן השרת או ממשתני הסביבה)');
        return;
      }
      if (!password || password.length < 8) {
        setErrorMessage('הסיסמה החדשה חייבת להכיל לפחות 8 תווים');
        return;
      }
      if (password !== confirmPassword) {
        setErrorMessage('אימות הסיסמה אינו תואם');
        return;
      }

      setLoading(true);
      const res = await recoverOwner(cleanEmail, password, recoveryKey.trim());
      setLoading(false);

      if (!res.success) {
        setErrorMessage(res.error || 'שחזור החשבון נכשל');
      } else {
        setSuccessMessage('הסיסמה עודכנה בהצלחה! מתחבר למערכת...');
      }
      return;
    }

    if (isSetupMode) {
      if (!setupToken.trim()) {
        setErrorMessage('נא להזין את קוד האבטחה החד-פעמי (Setup Token) מיומן השרת');
        return;
      }
    }

    if (!password) {
      setErrorMessage('נא להזין סיסמה');
      return;
    }

    if (isSetupMode) {
      if (password.length < 8) {
        setErrorMessage('הסיסמה חייבת להכיל לפחות 8 תווים');
        return;
      }
      if (password !== confirmPassword) {
        setErrorMessage('אימות הסיסמה אינו תואם');
        return;
      }

      setLoading(true);
      const res = await setup(cleanEmail, password, setupToken.trim());
      setLoading(false);

      if (!res.success) {
        setErrorMessage(res.error || 'הגדרת החשבון נכשלה');
      }
    } else {
      setLoading(true);
      const res = await login(cleanEmail, password);
      setLoading(false);

      if (!res.success) {
        setErrorMessage(res.error || 'פרטי התחברות שגויים');
        if (res.retryAfter) {
          setRetryAfterSeconds(res.retryAfter);
        }
      }
    }
  };

  return (
    <div className="relative min-h-screen flex items-center justify-center p-4 sm:p-6 text-warm-900 font-heebo selection:bg-rose-dusty/20 selection:text-warm-950 overflow-hidden" dir="rtl">
      {/* Background Ribbons */}
      <GlassRibbonsBackground />

      {/* Main Glass Card */}
      <div className="relative z-10 w-full max-w-[460px] liquid-glass p-7 sm:p-9 rounded-[32px] border border-white/80 shadow-2xl backdrop-blur-xl">
        {/* Header / Logo */}
        <div className="flex flex-col items-center text-center mb-7">
          <div className="w-full flex items-center justify-center py-2 mb-3">
            <img
              src="/amit-touch-logo.png"
              alt="AMIT TOUCH Design Studio"
              className="w-full max-w-[170px] max-h-[90px] object-contain select-none"
            />
          </div>

          <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-[#BC796F]/10 border border-[#BC796F]/20 text-[#88463F] text-xs font-semibold mb-2">
            <Lock className="w-3.5 h-3.5" />
            <span>סביבת ניהול פרטית ומאובטחת</span>
          </div>

          <h1 className="text-2xl font-bold text-warm-950 tracking-tight">
            {isRecoveryMode
              ? 'שחזור חשבון בעלים ואיפוס סיסמה'
              : isSetupMode
              ? 'הגדרת חשבון מנהל ראשי'
              : 'כניסה למערכת'}
          </h1>
          <p className="text-xs sm:text-sm text-[#7D5A56] mt-1 max-w-sm">
            {isRecoveryMode
              ? 'איפוס סיסמה ישיר ומאובטח באמצעות מפתח השחזור המוגדר בשרת. הסיסמה החדשה נשמרת ישירות בדפדפן ובשרת.'
              : isSetupMode
              ? 'הפעלה ראשונית: הגדרת חשבון המנהל הבלעדי של הסטודיו. לאחר מכן, לא תתאפשר הרשמה נוספת.'
              : 'מערכת ניהול סטודיו לעיצוב, מעקב שעות ומסמכים חשבונאיים'}
          </p>
        </div>

        {/* Success Alert */}
        {successMessage && (
          <div className="mb-5 p-3.5 rounded-2xl bg-emerald-50/90 border border-emerald-200/90 flex items-start gap-2.5 text-xs text-emerald-800 animate-in fade-in duration-200">
            <ShieldCheck className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
            <div className="flex-1">
              <span className="font-semibold block mb-0.5">פעולה הצליחה</span>
              <span>{successMessage}</span>
            </div>
          </div>
        )}

        {/* Error / Rate-limit alert */}
        {errorMessage && (
          <div className="mb-5 p-3.5 rounded-2xl bg-rose-50/90 border border-rose-200/90 flex items-start gap-2.5 text-xs text-rose-800 animate-in fade-in duration-200">
            <ShieldAlert className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
            <div className="flex-1">
              <span className="font-semibold block mb-0.5">שגיאת אימות</span>
              <span>{errorMessage}</span>
              {retryAfterSeconds && (
                <div className="mt-1 font-mono text-[11px] text-rose-700">
                  נא להמתין כ-{Math.ceil(retryAfterSeconds / 60)} דקות לפני ניסיון חוזר.
                </div>
              )}
            </div>
          </div>
        )}

        {/* Security badge for setup */}
        {isSetupMode && (
          <div className="mb-5 p-3 rounded-2xl bg-amber-50/70 border border-amber-200/60 flex items-start gap-2.5 text-xs text-amber-900">
            <ShieldCheck className="w-4 h-4 text-amber-700 shrink-0 mt-0.5" />
            <span>
              כתובת הדוא״ל והסיסמה שתזין ישמשו כהרשאת הגישה היחידה למערכת. שמור את הפרטים במקום בטוח.
            </span>
          </div>
        )}

        {/* Auth Form */}
        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          {/* Recovery Key field (Recovery mode only) */}
          {isRecoveryMode && (
            <div className="flex flex-col gap-1.5 text-right animate-in fade-in duration-200">
              <div className="flex items-center justify-between">
                <label className="text-xs font-semibold text-warm-800">
                  מפתח שחזור סודי (OWNER_RECOVERY_KEY)
                </label>
                <span className="text-[10px] text-amber-800 font-medium">מוגדר ב-Render</span>
              </div>

              {!recoveryAvailable && (
                <div className="p-3 bg-amber-50/90 border border-amber-200/80 rounded-xl text-right text-xs text-amber-900 leading-relaxed mb-1">
                  <p className="font-semibold mb-0.5">שחזור חשבון בעלים אינו מופעל כרגע בשרת</p>
                  <p className="text-[11px] text-amber-800">
                    מטעמי אבטחה, ברירת המחדל הישנה הוסרה. להפעלת שחזור סיסמה, יש להגדיר בלוח הבקרה של Render במשתני הסביבה (Environment) מפתח סודי במשתנה <code className="bg-amber-100 px-1 py-0.5 rounded font-mono">OWNER_RECOVERY_KEY</code> באורך 16 תווים לפחות.
                  </p>
                </div>
              )}

              <div className="relative">
                <input
                  type="text"
                  required
                  autoComplete="off"
                  value={recoveryKey}
                  onChange={(e) => setRecoveryKey(e.target.value)}
                  placeholder="הזן את מפתח השחזור מ-Render (משתנה OWNER_RECOVERY_KEY)"
                  dir="ltr"
                  disabled={loading}
                  className="w-full h-11 px-3.5 pl-10 rounded-2xl bg-amber-50/40 border border-amber-300/80 focus:border-[#BC796F] focus:ring-2 focus:ring-[#BC796F]/20 text-xs font-mono text-warm-900 transition-all outline-none"
                />
                <KeyRound className="w-4 h-4 text-amber-600 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
              </div>
              <span className="text-[10px] text-warm-600">
                שחזור מוגן במפתח שרת מאובטח ומאמת כרטיס שחזור קצר-מועד (10 דקות). כל ההתחברויות הישנות מבוטלות אוטומטית.
              </span>
            </div>
          )}

          {/* Setup Token field (Setup mode only) */}
          {isSetupMode && (
            <div className="flex flex-col gap-1.5 text-right animate-in fade-in duration-200">
              <div className="flex items-center justify-between">
                <label className="text-xs font-semibold text-warm-800">
                  קוד אבטחה חד-פעמי (Setup Token)
                </label>
                <span className="text-[10px] text-amber-800 font-medium">מיומן השרת הפרטי</span>
              </div>
              <div className="relative">
                <input
                  type="text"
                  required
                  autoComplete="off"
                  value={setupToken}
                  onChange={(e) => setSetupToken(e.target.value)}
                  placeholder="הזן את הטוקן שנוצר בשרת"
                  dir="ltr"
                  disabled={loading}
                  className="w-full h-11 px-3.5 pl-10 rounded-2xl bg-amber-50/40 border border-amber-300/80 focus:border-[#BC796F] focus:ring-2 focus:ring-[#BC796F]/20 text-xs font-mono text-warm-900 transition-all outline-none"
                />
                <KeyRound className="w-4 h-4 text-amber-600 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
              </div>
              <span className="text-[10px] text-warm-600">
                קוד זה מופק בקונסולת השרת בעת הפעלה ראשונית, ומונע השתלטות חיצונית על המערכת.
              </span>
            </div>
          )}

          {/* Email field */}
          <div className="flex flex-col gap-1.5 text-right">
            <label className="text-xs font-semibold text-warm-800">
              כתובת דוא״ל
            </label>
            <div className="relative">
              <input
                type="email"
                required
                autoComplete="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="amit@touch.co.il"
                dir="ltr"
                disabled={loading}
                className="w-full h-11 px-3.5 pl-10 rounded-2xl bg-white/70 border border-warm-200/80 focus:border-[#BC796F] focus:ring-2 focus:ring-[#BC796F]/20 text-sm text-warm-900 transition-all outline-none"
              />
              <Mail className="w-4 h-4 text-warm-400 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
            </div>
          </div>

          {/* Password field */}
          <div className="flex flex-col gap-1.5 text-right">
            <label className="text-xs font-semibold text-warm-800">
              {isRecoveryMode ? 'סיסמה חדשה' : 'סיסמה'}
            </label>
            <div className="relative">
              <input
                type={showPassword ? 'text' : 'password'}
                required
                autoComplete={isSetupMode || isRecoveryMode ? 'new-password' : 'current-password'}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder={isSetupMode || isRecoveryMode ? 'לפחות 8 תווים' : 'הזן סיסמה'}
                dir="ltr"
                disabled={loading}
                className="w-full h-11 px-3.5 pl-10 rounded-2xl bg-white/70 border border-warm-200/80 focus:border-[#BC796F] focus:ring-2 focus:ring-[#BC796F]/20 text-sm text-warm-900 transition-all outline-none"
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                tabIndex={-1}
                className="p-1 rounded-lg text-warm-400 hover:text-warm-700 absolute left-3 top-1/2 -translate-y-1/2 transition-colors"
                title={showPassword ? 'הסתר סיסמה' : 'הצג סיסמה'}
              >
                {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
          </div>

          {/* Confirm Password (Setup mode or Recovery mode) */}
          {(isSetupMode || isRecoveryMode) && (
            <div className="flex flex-col gap-1.5 text-right animate-in fade-in duration-200">
              <label className="text-xs font-semibold text-warm-800">
                {isRecoveryMode ? 'אימות סיסמה חדשה' : 'אימות סיסמה'}
              </label>
              <div className="relative">
                <input
                  type={showPassword ? 'text' : 'password'}
                  required
                  autoComplete="new-password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  placeholder="הזן את הסיסמה שנית"
                  dir="ltr"
                  disabled={loading}
                  className="w-full h-11 px-3.5 pl-10 rounded-2xl bg-white/70 border border-warm-200/80 focus:border-[#BC796F] focus:ring-2 focus:ring-[#BC796F]/20 text-sm text-warm-900 transition-all outline-none"
                />
                <KeyRound className="w-4 h-4 text-warm-400 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
              </div>
            </div>
          )}

          {/* Submit Button */}
          <button
            type="submit"
            disabled={loading}
            className="mt-3 w-full h-11 px-4 rounded-2xl bg-gradient-to-r from-[#BC796F] to-[#88463F] hover:from-[#aa6a61] hover:to-[#793c36] text-white font-medium text-sm shadow-md hover:shadow-lg transition-all active:scale-[0.99] flex items-center justify-center gap-2 disabled:opacity-60 disabled:cursor-not-allowed cursor-pointer"
          >
            {loading ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                <span>מאמת נתונים...</span>
              </>
            ) : (
              <>
                <span>
                  {isRecoveryMode
                    ? 'שחזר סיסמה והתחבר'
                    : isSetupMode
                    ? 'הגדר חשבון והתחבר'
                    : 'כניסה למערכת'}
                </span>
                <ArrowLeft className="w-4 h-4" />
              </>
            )}
          </button>

          {/* Recovery Toggle Link */}
          {!isSetupMode && (
            <div className="text-center pt-1">
              <button
                type="button"
                onClick={() => {
                  setErrorMessage(null);
                  setSuccessMessage(null);
                  setIsRecoveryMode(!isRecoveryMode);
                  if (!isRecoveryMode && !email.trim()) {
                    setEmail('amit2001tal@gmail.com');
                  }
                }}
                className="text-xs text-[#88463F] hover:text-[#5c2420] underline decoration-[#BC796F]/40 underline-offset-4 transition-colors font-medium cursor-pointer"
              >
                {isRecoveryMode ? 'חזרה למסך כניסה רגיל' : 'שכחת סיסמה? שחזור חשבון בעלים'}
              </button>
            </div>
          )}
        </form>

        {/* Footer Notice */}
        <div className="mt-7 pt-4 border-t border-warm-200/60 text-center">
          <p className="text-[11px] text-warm-600/90 leading-relaxed">
            המערכת פועלת במודל של חשבון בעלים יחיד ומאובטח.
            <br />
            כל הפעולות, יצוא ה-PDF והגיבויים מנוהלים ומאומתים בצד השרת.
          </p>
        </div>
      </div>
    </div>
  );
};
