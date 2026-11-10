import React, { useState, useEffect } from 'react';
import { useApp } from '../context/AppContext';
import { useAuth } from '../context/AuthContext';
import { useDocuments } from '../context/DocumentsContext';
import { DeleteConfirmModal } from './DeleteConfirmModal';
import { CustomSelect } from './CustomSelect';
import { SequenceConfirmationModal } from './documents/SequenceConfirmationModal';
import { BackupRestoreSection } from './settings/BackupRestoreSection';
import { GmailIntegrationSection } from './settings/GmailIntegrationSection';
import type { BusinessType } from '../types/documents';
import { 
  Settings, 
  Save, 
  Trash2, 
  Database, 
  AlertTriangle, 
  FileText, 
  Building2, 
  CreditCard, 
  CheckCircle2,
  Clock,
  Bell,
  ShieldCheck,
  LogOut
} from 'lucide-react';

export const SettingsView: React.FC = () => {
  const { user, logout } = useAuth();
  const { 
    settings, 
    updateSettings, 
    clearAllWorkData, 
    clearDemoData,
    clients,
    projects,
    entries,
  } = useApp();

  const { 
    businessSettings, 
    updateBusinessSettings, 
    sequences 
  } = useDocuments();
  
  // Studio preferences state
  const [studioName, setStudioName] = useState(settings.studioName || 'AMIT TOUCH');
  const [hourlyRate, setHourlyRate] = useState(String(settings.defaultHourlyRate ?? 350));
  const [currency, setCurrency] = useState(settings.currency || '₪');
  const [timerReminderEnabled, setTimerReminderEnabled] = useState(settings.timerReminder?.enabled ?? true);
  const [timerReminderThreshold, setTimerReminderThreshold] = useState(String(settings.timerReminder?.thresholdHours ?? 4));
  const [timerBrowserNotifications, setTimerBrowserNotifications] = useState(settings.timerReminder?.browserNotificationsEnabled ?? false);
  const [isSavingStudio, setIsSavingStudio] = useState(false);

  // Business / Invoicing Profile state
  const [legalName, setLegalName] = useState(businessSettings.legalName || '');
  const [tradingName, setTradingName] = useState(businessSettings.tradingName || '');
  const [businessNumber, setBusinessNumber] = useState(businessSettings.businessNumber || '');
  const [businessType, setBusinessType] = useState<BusinessType>(businessSettings.businessType || 'licensed');
  const [address, setAddress] = useState(businessSettings.address || '');
  const [phone, setPhone] = useState(businessSettings.phone || '');
  const [email, setEmail] = useState(businessSettings.email || '');
  const [defaultPaymentTerms, setDefaultPaymentTerms] = useState(businessSettings.defaultPaymentTerms || 'שוטף + 30');
  
  // Bank details state
  const [bankName, setBankName] = useState(businessSettings.bankDetails?.bankName || '');
  const [branch, setBranch] = useState(businessSettings.bankDetails?.branch || '');
  const [accountNumber, setAccountNumber] = useState(businessSettings.bankDetails?.accountNumber || '');
  const [accountName, setAccountName] = useState(businessSettings.bankDetails?.accountName || '');

  const [isSavingBusiness, setIsSavingBusiness] = useState(false);

  // Modals
  const [isConfirmClearAllOpen, setIsConfirmClearAllOpen] = useState(false);
  const [isConfirmClearDemoOpen, setIsConfirmClearDemoOpen] = useState(false);
  const [isSequenceModalOpen, setIsSequenceModalOpen] = useState(false);

  // Sync studio settings whenever context updates (e.g. from localStorage or other tabs)
  useEffect(() => {
    if (settings) {
      setStudioName(settings.studioName || 'AMIT TOUCH');
      setHourlyRate(String(settings.defaultHourlyRate ?? 350));
      setCurrency(settings.currency || '₪');
      setTimerReminderEnabled(settings.timerReminder?.enabled ?? true);
      setTimerReminderThreshold(String(settings.timerReminder?.thresholdHours ?? 4));
      setTimerBrowserNotifications(settings.timerReminder?.browserNotificationsEnabled ?? false);
    }
  }, [settings]);

  // Sync business settings whenever context updates (e.g. after server fetch / refresh)
  useEffect(() => {
    if (businessSettings) {
      setLegalName(businessSettings.legalName || '');
      setTradingName(businessSettings.tradingName || '');
      setBusinessNumber(businessSettings.businessNumber || '');
      setBusinessType(businessSettings.businessType || 'licensed');
      setAddress(businessSettings.address || '');
      setPhone(businessSettings.phone || '');
      setEmail(businessSettings.email || '');
      setDefaultPaymentTerms(businessSettings.defaultPaymentTerms || 'שוטף + 30');
      if (businessSettings.bankDetails) {
        setBankName(businessSettings.bankDetails.bankName || '');
        setBranch(businessSettings.bankDetails.branch || '');
        setAccountNumber(businessSettings.bankDetails.accountNumber || '');
        setAccountName(businessSettings.bankDetails.accountName || '');
      }
    }
  }, [businessSettings]);

  const handleSubmitStudio = (e: React.FormEvent) => {
    e.preventDefault();
    setIsSavingStudio(true);
    try {
      updateSettings({
        studioName: studioName.trim() || 'AMIT TOUCH',
        defaultHourlyRate: Number(hourlyRate) || 350,
        currency: currency.trim() || '₪',
        timerReminder: {
          enabled: timerReminderEnabled,
          thresholdHours: Number(timerReminderThreshold) || 4,
          browserNotificationsEnabled: timerBrowserNotifications,
        },
      });
    } finally {
      setTimeout(() => setIsSavingStudio(false), 500);
    }
  };

  const handleSubmitBusiness = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSavingBusiness(true);
    try {
      const vatRate = businessType === 'exempt' ? 0 : 0.18;
      await updateBusinessSettings({
        legalName: legalName.trim(),
        tradingName: tradingName.trim(),
        businessNumber: businessNumber.trim(),
        businessType: businessType,
        address: address.trim(),
        phone: phone.trim(),
        email: email.trim(),
        defaultPaymentTerms: defaultPaymentTerms,
        vatRate: vatRate,
        bankDetails: {
          bankName: bankName.trim(),
          branch: branch.trim(),
          accountNumber: accountNumber.trim(),
          accountName: accountName.trim(),
        },
      });
      // Toast notification is fired by updateBusinessSettings upon successful server persistence
    } catch (err) {
      console.error('Failed to save business settings:', err);
    } finally {
      setIsSavingBusiness(false);
    }
  };

  return (
    <div className="flex flex-col gap-6 max-w-4xl font-heebo animate-fade-in pb-12">
      <div>
        <h1 className="text-2xl sm:text-3xl font-bold text-warm-900 tracking-tight">הגדרות מערכת</h1>
        <p className="text-sm text-[#7D5A56] mt-1 font-medium">
          התאמה אישית של פרטי הסטודיו, הפקת מסמכים, תעריפי השעות וניהול נתונים
        </p>
      </div>

      {/* Studio Profile & Rates */}
      <div className="liquid-glass rounded-3xl p-6 sm:p-7 relative overflow-hidden border border-white/80 shadow-[0_12px_40px_-15px_rgba(109,64,61,0.10)] bg-gradient-to-br from-white/90 via-white/75 to-[#FAF4F2]/70 backdrop-blur-xl">
        <div className="flex items-center gap-3 pb-4 border-b border-[#BC796F]/15 mb-6">
          <div className="w-9 h-9 rounded-xl bg-[#BC796F]/15 flex items-center justify-center text-[#BC796F] border border-[#BC796F]/25 shadow-xs">
            <Settings className="w-5 h-5" />
          </div>
          <div>
            <h2 className="text-lg font-bold text-warm-950">פרטי סטודיו ותעריפים</h2>
            <p className="text-xs text-[#7D5A56]">הגדרות תצוגה כלליות ותעריף עבודה שעתי</p>
          </div>
        </div>

        <form onSubmit={handleSubmitStudio} className="flex flex-col gap-5">
          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-bold text-warm-900">שם הסטודיו / המותג</label>
            <input
              type="text"
              value={studioName}
              onChange={e => setStudioName(e.target.value)}
              placeholder="AMIT TOUCH"
              className="w-full h-11 px-3.5 rounded-xl text-sm font-medium text-warm-900 liquid-glass-input bg-white/70 border border-white/80 focus:border-[#BC796F] focus:ring-2 focus:ring-[#BC796F]/20 focus:bg-white transition-all text-right font-heebo placeholder:text-[#9B7B76]"
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-bold text-warm-900">תעריף שעתי ברירת מחדל</label>
              <div className="relative">
                <input
                  type="number"
                  min="0"
                  step="10"
                  dir="ltr"
                  value={hourlyRate}
                  onChange={e => setHourlyRate(e.target.value)}
                  className="w-full h-11 pr-3.5 pl-8 rounded-xl text-sm font-medium text-warm-900 liquid-glass-input bg-white/70 border border-white/80 focus:border-[#BC796F] focus:ring-2 focus:ring-[#BC796F]/20 focus:bg-white transition-all text-right tabular-nums font-heebo"
                />
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-xs font-bold text-[#88463F] pointer-events-none select-none">
                  {currency}
                </span>
              </div>
            </div>

            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-bold text-warm-900">מטבע</label>
              <CustomSelect
                value={currency}
                onChange={setCurrency}
                options={[
                  { value: '₪', label: '₪ - שקל חדש (ILS)', badge: 'ILS' },
                  { value: '$', label: '$ - דולר אמריקאי (USD)', badge: 'USD' },
                  { value: '€', label: '€ - אירו (EUR)', badge: 'EUR' },
                  { value: '£', label: '£ - לירה שטרלינג (GBP)', badge: 'GBP' },
                ]}
                triggerClassName="h-11 bg-white/70 font-heebo border border-white/80 focus:border-[#BC796F]"
              />
            </div>
          </div>

          {/* Forgotten Timer Reminder Settings */}
          <div className="pt-4 border-t border-[#BC796F]/15 flex flex-col gap-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Clock className="w-4 h-4 text-[#BC796F]" />
                <label className="text-xs font-bold text-warm-900 cursor-pointer" htmlFor="timer-reminder-enable">
                  תזכורת לטיימר שנשכח
                </label>
              </div>
              <label className="relative inline-flex items-center cursor-pointer">
                <input
                  id="timer-reminder-enable"
                  type="checkbox"
                  checked={timerReminderEnabled}
                  onChange={e => setTimerReminderEnabled(e.target.checked)}
                  className="sr-only peer"
                />
                <div className="w-9 h-5 bg-warm-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:right-[2px] after:bg-white after:border-warm-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-[#BC796F]"></div>
              </label>
            </div>
            <p className="text-[11px] text-[#7D5A56] leading-relaxed">
              הצגת תזכורת נעימה בממשק כאשר טיימר פעיל ברציפות מעבר לסף שנקבע. הטיימר לעולם לא ייעצר או ישונה אוטומטית.
            </p>

            {timerReminderEnabled && (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mt-1 bg-white/40 p-3.5 rounded-2xl border border-white/60">
                <div className="flex flex-col gap-1.5">
                  <label className="text-xs font-bold text-warm-800">התרעה לאחר עבודה רצופה של:</label>
                  <CustomSelect
                    value={timerReminderThreshold}
                    onChange={setTimerReminderThreshold}
                    options={[
                      { value: '2', label: 'שעתיים (2 שעות רצופות)' },
                      { value: '3', label: '3 שעות רצופות' },
                      { value: '4', label: '4 שעות רצופות (ברירת מחדל)' },
                      { value: '5', label: '5 שעות רצופות' },
                      { value: '6', label: '6 שעות רצופות' },
                      { value: '8', label: '8 שעות רצופות' },
                    ]}
                    triggerClassName="h-10 bg-white font-heebo border border-white/80 focus:border-[#BC796F]"
                  />
                </div>

                <div className="flex flex-col justify-center gap-1.5">
                  <div className="flex items-center gap-2">
                    <input
                      id="timer-browser-notif"
                      type="checkbox"
                      checked={timerBrowserNotifications}
                      onChange={async e => {
                        const checked = e.target.checked;
                        if (checked && 'Notification' in window) {
                          const res = await Notification.requestPermission();
                          setTimerBrowserNotifications(res === 'granted');
                        } else {
                          setTimerBrowserNotifications(false);
                        }
                      }}
                      className="w-4 h-4 rounded text-[#BC796F] focus:ring-[#BC796F]/30 border-warm-300"
                    />
                    <label htmlFor="timer-browser-notif" className="text-xs font-semibold text-warm-900 cursor-pointer flex items-center gap-1.5">
                      <Bell className="w-3.5 h-3.5 text-[#BC796F]" />
                      <span>הפעלת התראות דפדפן (אופציונלי)</span>
                    </label>
                  </div>
                  <span className="text-[10px] text-[#8C6D68]">
                    התראות דפדפן דורשות אישור מפורש ופועלות כאשר לשונית הדפדפן פתוחה.
                  </span>
                </div>
              </div>
            )}
          </div>

          <div className="flex items-center justify-end pt-4 border-t border-[#BC796F]/15 mt-2">
            <button
              type="submit"
              disabled={isSavingStudio}
              className="flex items-center gap-2 px-6 py-2.5 rounded-xl text-sm font-bold text-white liquid-glass-btn-primary shadow-md active:scale-98 transition-all hover:shadow-lg hover:shadow-[#BC796F]/25 disabled:opacity-50 disabled:pointer-events-none"
            >
              <Save className="w-4 h-4" />
              <span>{isSavingStudio ? 'שומר...' : 'שמירת הגדרות סטודיו'}</span>
            </button>
          </div>
        </form>
      </div>

      {/* Business Details for Document Issuance */}
      <div className="liquid-glass rounded-3xl p-6 sm:p-7 relative overflow-hidden border border-white/80 shadow-[0_12px_40px_-15px_rgba(109,64,61,0.12)] bg-gradient-to-br from-white/90 via-white/75 to-[#FAF4F2]/70 backdrop-blur-xl">
        <div className="flex items-center justify-between pb-4 border-b border-[#BC796F]/15 mb-6 gap-3 flex-wrap">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-[#BC796F]/15 flex items-center justify-center text-[#BC796F] border border-[#BC796F]/25 shadow-xs">
              <Building2 className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-warm-950">פרטי עסק והפקת מסמכים</h2>
              <p className="text-xs text-[#7D5A56]">פרטי הישות המשפטית המוצגים במסמכים רשמיים</p>
            </div>
          </div>

          {/* Dusty Rose Status Badge (replacing the previous green status badge) */}
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-[#BC796F]/15 text-[#88463F] border border-[#BC796F]/30 shadow-xs text-xs font-bold font-heebo whitespace-nowrap shrink-0">
            <CheckCircle2 className="w-3.5 h-3.5 text-[#BC796F]" />
            <span>פרופיל עסק פעיל</span>
          </span>
        </div>

        <form onSubmit={handleSubmitBusiness} className="flex flex-col gap-5">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-bold text-warm-900">שם העסק הרשמי *</label>
              <input
                type="text"
                value={legalName}
                onChange={e => setLegalName(e.target.value)}
                placeholder="עמית טל"
                required
                className="w-full h-11 px-3.5 rounded-xl text-sm font-medium text-warm-900 liquid-glass-input bg-white/70 border border-white/80 focus:border-[#BC796F] focus:ring-2 focus:ring-[#BC796F]/20 focus:bg-white transition-all text-right font-heebo placeholder:text-[#9B7B76]"
              />
            </div>

            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-bold text-warm-900">שם מסחרי / מותג</label>
              <input
                type="text"
                value={tradingName}
                onChange={e => setTradingName(e.target.value)}
                placeholder="AMIT TOUCH"
                className="w-full h-11 px-3.5 rounded-xl text-sm font-medium text-warm-900 liquid-glass-input bg-white/70 border border-white/80 focus:border-[#BC796F] focus:ring-2 focus:ring-[#BC796F]/20 focus:bg-white transition-all text-right font-heebo placeholder:text-[#9B7B76]"
              />
            </div>

            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-bold text-warm-900">מספר עוסק / ח.פ / ת.ז *</label>
              <input
                type="text"
                dir="ltr"
                value={businessNumber}
                onChange={e => setBusinessNumber(e.target.value)}
                placeholder="322889486"
                required
                className="w-full h-11 px-3.5 rounded-xl text-sm font-medium text-warm-900 liquid-glass-input bg-white/70 border border-white/80 focus:border-[#BC796F] focus:ring-2 focus:ring-[#BC796F]/20 focus:bg-white transition-all text-right tabular-nums font-heebo placeholder:text-[#9B7B76]"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-bold text-warm-900">סוג עוסק</label>
              <CustomSelect
                value={businessType}
                onChange={(val) => setBusinessType(val as BusinessType)}
                options={[
                  { value: 'licensed', label: 'עוסק מורשה (מע״מ 18%)' },
                  { value: 'company', label: 'חברה בע״מ (מע״מ 18%)' },
                  { value: 'exempt', label: 'עוסק פטור — לא נגבה מע״מ' },
                ]}
                triggerClassName="h-11 bg-white/70 font-heebo border border-white/80 focus:border-[#BC796F]"
              />
            </div>

            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-bold text-warm-900">תנאי תשלום ברירת מחדל</label>
              <CustomSelect
                value={defaultPaymentTerms}
                onChange={setDefaultPaymentTerms}
                options={[
                  { value: 'לתשלום מיידי', label: 'לתשלום מיידי' },
                  { value: 'שוטף', label: 'שוטף (סוף החודש)' },
                  { value: 'שוטף + 15', label: 'שוטף + 15' },
                  { value: 'שוטף + 30', label: 'שוטף + 30' },
                  { value: 'שוטף + 45', label: 'שוטף + 45' },
                  { value: 'שוטף + 60', label: 'שוטף + 60' },
                  { value: 'שוטף + 90', label: 'שוטף + 90' },
                ]}
                triggerClassName="h-11 bg-white/70 font-heebo border border-white/80 focus:border-[#BC796F]"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-bold text-warm-900">כתובת</label>
              <input
                type="text"
                value={address}
                onChange={e => setAddress(e.target.value)}
                placeholder="הברזל 24, רמת החייל, תל אביב"
                className="w-full h-11 px-3.5 rounded-xl text-sm font-medium text-warm-900 liquid-glass-input bg-white/70 border border-white/80 focus:border-[#BC796F] focus:ring-2 focus:ring-[#BC796F]/20 focus:bg-white transition-all text-right font-heebo placeholder:text-[#9B7B76]"
              />
            </div>

            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-bold text-warm-900">טלפון</label>
              <input
                type="text"
                dir="ltr"
                value={phone}
                onChange={e => setPhone(e.target.value)}
                placeholder="03-6821456"
                className="w-full h-11 px-3.5 rounded-xl text-sm font-medium text-warm-900 liquid-glass-input bg-white/70 border border-white/80 focus:border-[#BC796F] focus:ring-2 focus:ring-[#BC796F]/20 focus:bg-white transition-all text-right font-heebo placeholder:text-[#9B7B76]"
              />
            </div>

            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-bold text-warm-900">דוא״ל</label>
              <input
                type="email"
                dir="ltr"
                value={email}
                onChange={e => setEmail(e.target.value)}
                placeholder="amit2001tal@gmail.com"
                className="w-full h-11 px-3.5 rounded-xl text-sm font-medium text-warm-900 liquid-glass-input bg-white/70 border border-white/80 focus:border-[#BC796F] focus:ring-2 focus:ring-[#BC796F]/20 focus:bg-white transition-all text-right font-heebo placeholder:text-[#9B7B76]"
              />
            </div>
          </div>

          {/* Bank Details Card */}
          <div className="p-5 rounded-2xl bg-gradient-to-br from-white/70 via-white/50 to-[#FAF4F2]/50 border border-white/90 shadow-xs flex flex-col gap-3.5">
            <div className="flex items-center gap-2">
              <div className="w-6 h-6 rounded-lg bg-[#BC796F]/15 flex items-center justify-center text-[#BC796F] border border-[#BC796F]/25 shadow-xs">
                <CreditCard className="w-3.5 h-3.5" />
              </div>
              <span className="text-xs font-bold text-warm-950 font-heebo">פרטי חשבון בנק להעברות</span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
              <div className="flex flex-col gap-1">
                <label className="text-[11px] font-semibold text-warm-800">בנק</label>
                <input
                  type="text"
                  placeholder="בנק הפועלים (12)"
                  value={bankName}
                  onChange={e => setBankName(e.target.value)}
                  className="h-10 px-3.5 rounded-xl text-xs sm:text-sm font-medium text-warm-900 liquid-glass-input bg-white/80 border border-white/90 focus:border-[#BC796F] focus:ring-2 focus:ring-[#BC796F]/20 focus:bg-white transition-all text-right font-heebo"
                />
              </div>

              <div className="flex flex-col gap-1">
                <label className="text-[11px] font-semibold text-warm-800">סניף</label>
                <input
                  type="text"
                  placeholder="610 — רמת החייל"
                  value={branch}
                  onChange={e => setBranch(e.target.value)}
                  className="h-10 px-3.5 rounded-xl text-xs sm:text-sm font-medium text-warm-900 liquid-glass-input bg-white/80 border border-white/90 focus:border-[#BC796F] focus:ring-2 focus:ring-[#BC796F]/20 focus:bg-white transition-all text-right font-heebo"
                />
              </div>

              <div className="flex flex-col gap-1">
                <label className="text-[11px] font-semibold text-warm-800">מספר חשבון</label>
                <input
                  type="text"
                  dir="ltr"
                  placeholder="489201"
                  value={accountNumber}
                  onChange={e => setAccountNumber(e.target.value)}
                  className="h-10 px-3.5 rounded-xl text-xs sm:text-sm font-medium text-warm-900 liquid-glass-input bg-white/80 border border-white/90 focus:border-[#BC796F] focus:ring-2 focus:ring-[#BC796F]/20 focus:bg-white transition-all text-right tabular-nums font-heebo"
                />
              </div>

              <div className="flex flex-col gap-1">
                <label className="text-[11px] font-semibold text-warm-800">שם בעל החשבון</label>
                <input
                  type="text"
                  placeholder="שם בעל החשבון"
                  value={accountName}
                  onChange={e => setAccountName(e.target.value)}
                  className="h-10 px-3.5 rounded-xl text-xs sm:text-sm font-medium text-warm-900 liquid-glass-input bg-white/80 border border-white/90 focus:border-[#BC796F] focus:ring-2 focus:ring-[#BC796F]/20 focus:bg-white transition-all text-right font-heebo"
                />
              </div>
            </div>
          </div>

          <div className="flex items-center justify-end pt-4 border-t border-[#BC796F]/15 mt-2">
            <button
              type="submit"
              disabled={isSavingBusiness}
              className="flex items-center gap-2 px-6 py-2.5 rounded-xl text-sm font-bold text-white liquid-glass-btn-primary shadow-md active:scale-98 transition-all hover:shadow-lg hover:shadow-[#BC796F]/25 disabled:opacity-50 disabled:pointer-events-none"
            >
              {isSavingBusiness ? (
                <>
                  <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  <span>שומר שינויים...</span>
                </>
              ) : (
                <>
                  <Save className="w-4 h-4" />
                  <span>שמירת פרטי עסק למסמכים</span>
                </>
              )}
            </button>
          </div>
        </form>
      </div>

      {/* Sequence Settings Card */}
      <div className="liquid-glass rounded-3xl p-6 sm:p-7 relative overflow-hidden border border-white/80 shadow-[0_12px_40px_-15px_rgba(109,64,61,0.10)] bg-gradient-to-br from-white/90 via-white/75 to-[#FAF4F2]/70 backdrop-blur-xl">
        <div className="flex items-center justify-between pb-4 border-b border-[#BC796F]/15 mb-6 gap-3 flex-wrap">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-[#BC796F]/15 flex items-center justify-center text-[#BC796F] border border-[#BC796F]/25 shadow-xs">
              <FileText className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-warm-950">רצף ומספור מסמכים רשמי</h2>
              <p className="text-xs text-[#7D5A56]">מעקב אחר מספרי המסמכים הבאים שיונפקו במערכת</p>
            </div>
          </div>

          <button
            type="button"
            onClick={() => setIsSequenceModalOpen(true)}
            className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-bold text-white liquid-glass-btn-primary shadow-sm hover:shadow-md hover:shadow-[#BC796F]/20 transition-all active:scale-98"
          >
            <span>{sequences.isProductionActive ? 'צפייה ברצף המספור' : 'אימות רצף מספור רשמי'}</span>
          </button>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div className="p-4 rounded-2xl bg-white/70 border border-white/90 shadow-xs flex flex-col justify-between backdrop-blur-md">
            <span className="text-xs text-[#7D5A56] font-bold">חשבון עסקה מספר הבא:</span>
            <span className="text-2xl font-black text-[#88463F] tabular-nums mt-1 font-heebo" dir="ltr">
              {sequences.paymentRequestNext}
            </span>
            <span className="text-[11px] text-[#A46A69] mt-1 font-medium">רצף רשמי מאושר</span>
          </div>

          {/* Receipt Sequence: Styled with Dusty Rose rather than emerald green */}
          <div className="p-4 rounded-2xl bg-white/70 border border-white/90 shadow-xs flex flex-col justify-between backdrop-blur-md">
            <span className="text-xs text-[#7D5A56] font-bold">קבלה מספר הבא:</span>
            <span className="text-2xl font-black text-[#A46A69] tabular-nums mt-1 font-heebo" dir="ltr">
              {sequences.receiptNext}
            </span>
            <span className="text-[11px] text-[#A46A69] mt-1 font-medium">רצף רשמי מאושר</span>
          </div>

          <div className="p-4 rounded-2xl bg-white/70 border border-white/90 shadow-xs flex flex-col justify-between backdrop-blur-md">
            <span className="text-xs text-[#7D5A56] font-bold">הצעת מחיר מספר הבא:</span>
            <span className="text-2xl font-black text-warm-950 tabular-nums mt-1 font-heebo" dir="ltr">
              {sequences.quoteNext || 'לא הוגדר'}
            </span>
            <span className="text-[11px] text-[#7D5A56] mt-1 font-medium">רצף הצעות מחיר</span>
          </div>
        </div>
      </div>

      {/* Account & Security Section */}
      <div className="liquid-glass rounded-3xl p-6 sm:p-7 relative overflow-hidden border border-[#BC796F]/20 shadow-[0_12px_40px_-15px_rgba(188,121,111,0.08)] bg-gradient-to-br from-white/90 via-white/75 to-[#FAF4F2]/70 backdrop-blur-xl">
        <div className="flex items-center justify-between pb-4 border-b border-[#BC796F]/15 mb-6">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-gradient-to-tr from-[#BC796F] to-[#E4AEA3] flex items-center justify-center text-white shadow-xs">
              <ShieldCheck className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-warm-950">אבטחה וחשבון מנהל</h2>
              <p className="text-xs text-[#7D5A56]">פרטי התחברות, הצפנת נתונים והרשאות מערכת</p>
            </div>
          </div>
          {user?.email && (
            <button
              type="button"
              onClick={logout}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold text-rose-700 bg-rose-50 hover:bg-rose-100 border border-rose-200 transition-all cursor-pointer"
            >
              <LogOut className="w-3.5 h-3.5" />
              <span>התנתקות</span>
            </button>
          )}
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="p-4 rounded-2xl bg-white/60 border border-warm-200/60">
            <span className="text-xs text-[#7D5A56] font-medium block mb-1">חשבון מחובר</span>
            <span className="text-sm font-bold text-warm-900 font-mono" dir="ltr">{user?.email || 'מנהל ראשי'}</span>
            <span className="inline-block mt-2 text-[11px] px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200 font-medium">
              פעיל ומאומת (PBKDF2-SHA512)
            </span>
          </div>
          <div className="p-4 rounded-2xl bg-white/60 border border-warm-200/60">
            <span className="text-xs text-[#7D5A56] font-medium block mb-1">רמת הרשאה ומדיניות גישה</span>
            <span className="text-sm font-bold text-warm-900">בעלים בלעדי (Private Single-Tenant)</span>
            <p className="text-[11px] text-[#7D5A56] mt-1">
              הרשמה פומבית חסומה. כל בקשות ה-API מאומתות באמצעות עוגיות מאובטחות (HttpOnly / Lax / Secure).
            </p>
          </div>
        </div>
      </div>

      {/* Gmail API Direct Email Integration */}
      <GmailIntegrationSection />

      {/* Backup & Restore Section */}
      <BackupRestoreSection />

      {/* Data Management Section */}
      <div className="liquid-glass rounded-3xl p-6 sm:p-7 relative overflow-hidden border border-red-500/20 shadow-[0_12px_40px_-15px_rgba(239,68,68,0.06)] bg-gradient-to-br from-white/90 via-white/75 to-[#FAF4F2]/70 backdrop-blur-xl">
        <div className="flex items-center gap-3 pb-4 border-b border-[#BC796F]/15 mb-6">
          <div className="w-9 h-9 rounded-xl bg-red-100 flex items-center justify-center text-red-700 border border-red-200 shadow-xs">
            <Database className="w-5 h-5" />
          </div>
          <div>
            <h2 className="text-lg font-bold text-warm-950">ניהול נתוני עבודה ומחיקה</h2>
            <p className="text-xs text-[#7D5A56]">איפוס מבוקר של לקוחות, פרויקטים ודיווחי שעות</p>
          </div>
        </div>

        <div className="flex flex-col gap-5">
          {/* Clear All Work Data */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-4 rounded-2xl bg-red-50/40 border border-red-200/60 shadow-xs">
            <div>
              <div className="flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 text-red-600" />
                <h3 className="font-bold text-warm-950 text-sm">מחיקת כל נתוני העבודה</h3>
              </div>
              <p className="text-xs text-[#7D5A56] mt-1 max-w-md font-medium">
                מחיקה מלאה של כל הלקוחות ({clients.length}), הפרויקטים ({projects.length}) ודיווחי השעות ({entries.length}). הגדרות הסטודיו, פרטי העסק והמסמכים הרשמיים יישמרו.
              </p>
            </div>

            <button
              type="button"
              onClick={() => setIsConfirmClearAllOpen(true)}
              className="flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-xl text-xs font-bold text-red-700 bg-red-100/80 hover:bg-red-200/80 border border-red-300/80 transition-all shrink-0 active:scale-98 shadow-xs"
            >
              <Trash2 className="w-3.5 h-3.5" />
              <span>מחיקת כל נתוני העבודה</span>
            </button>
          </div>

          {/* Clear Demo Data */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-4 rounded-2xl bg-white/50 border border-white/80 shadow-xs">
            <div>
              <h3 className="font-bold text-warm-950 text-sm">מחיקת נתוני הדוגמה</h3>
              <p className="text-xs text-[#7D5A56] mt-1 max-w-md font-medium">
                הסרה ממוקדת של רשומות הדמו המקוריות (אם קיימות), מבלי לפגוע בלקוחות ובפרויקטים האישיים שהזנת.
              </p>
            </div>

            <button
              type="button"
              onClick={() => setIsConfirmClearDemoOpen(true)}
              className="flex items-center justify-center gap-1.5 px-4 py-2 rounded-xl text-xs font-bold text-warm-800 bg-white/80 hover:bg-white border border-[#BC796F]/20 hover:border-[#BC796F]/40 transition-all shrink-0 active:scale-98 shadow-xs"
            >
              <Trash2 className="w-3.5 h-3.5 text-[#BC796F]" />
              <span>מחיקת נתוני דוגמה</span>
            </button>
          </div>
        </div>
      </div>

      {/* Delete Confirm Modal: Clear All Work Data */}
      <DeleteConfirmModal
        isOpen={isConfirmClearAllOpen}
        onClose={() => setIsConfirmClearAllOpen(false)}
        onConfirm={() => {
          clearAllWorkData();
          setIsConfirmClearAllOpen(false);
        }}
        title="מחיקת כל נתוני העבודה"
        itemName="כל נתוני העבודה הפעילים"
        warningDetails={`פעולה זו תמחק לצמיתות ${clients.length} לקוחות, ${projects.length} פרויקטים ו-${entries.length} דיווחי שעות. פרטי הסטודיו, המסמכים והרצפים יישמרו.`}
        confirmButtonText="מחיקת כל הנתונים לצמיתות"
      />

      {/* Delete Confirm Modal: Clear Demo Data */}
      <DeleteConfirmModal
        isOpen={isConfirmClearDemoOpen}
        onClose={() => setIsConfirmClearDemoOpen(false)}
        onConfirm={() => {
          clearDemoData();
          setIsConfirmClearDemoOpen(false);
        }}
        title="מחיקת נתוני הדוגמה"
        itemName="רשומות דוגמה מקוריות"
        warningDetails="פעולה זו תסיר אך ורק את רשומות הדמו המקוריות של המערכת ותשמור על כל הנתונים האמיתיים שלך."
        confirmButtonText="מחיקת רשומות הדמו"
      />

      {/* Sequence Confirmation Modal */}
      <SequenceConfirmationModal
        isOpen={isSequenceModalOpen}
        onClose={() => setIsSequenceModalOpen(false)}
      />
    </div>
  );
};
