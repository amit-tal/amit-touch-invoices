import React, { useState, useEffect, useRef } from 'react';
import { useDocuments } from '../../context/DocumentsContext';
import { useApp } from '../../context/AppContext';
import { 
  ShieldCheck, 
  Download, 
  Upload, 
  RefreshCw, 
  CheckCircle2, 
  AlertTriangle, 
  HardDrive,
  Info,
  X
} from 'lucide-react';

export const BackupRestoreSection: React.FC = () => {
  const { 
    downloadBackup, 
    getBackupStatus, 
    validateBackup, 
    restoreBackup, 
    triggerAutoBackup 
  } = useDocuments();
  const { refreshAppData, showToast } = useApp();

  const [backupStatus, setBackupStatus] = useState<any>(null);
  const [isLoadingStatus, setIsLoadingStatus] = useState(false);
  const [isCreatingSnapshot, setIsCreatingSnapshot] = useState(false);

  // Restore flow state
  const [selectedFileContent, setSelectedFileContent] = useState<any>(null);
  const [validationResult, setValidationResult] = useState<any>(null);
  const [isValidating, setIsValidating] = useState(false);
  const [isRestoring, setIsRestoring] = useState(false);
  const [isRestoreModalOpen, setIsRestoreModalOpen] = useState(false);
  const [restoreSuccessInfo, setRestoreSuccessInfo] = useState<any>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);

  const loadStatus = async () => {
    setIsLoadingStatus(true);
    try {
      const data = await getBackupStatus();
      setBackupStatus(data);
    } catch {
      // Ignore
    } finally {
      setIsLoadingStatus(false);
    }
  };

  useEffect(() => {
    loadStatus();
  }, []);

  const handleCreateSnapshot = async () => {
    setIsCreatingSnapshot(true);
    try {
      await triggerAutoBackup();
      await loadStatus();
    } catch {
      // Ignore
    } finally {
      setIsCreatingSnapshot(false);
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = async (event) => {
      try {
        const text = event.target?.result as string;
        const parsed = JSON.parse(text);
        setSelectedFileContent(parsed);
        setIsValidating(true);
        const result = await validateBackup(parsed);
        setValidationResult(result);
        setIsRestoreModalOpen(true);
      } catch (err: any) {
        showToast(err.message || 'קובץ הגיבוי שנבחר אינו קובץ JSON תקין');
      } finally {
        setIsValidating(false);
        if (fileInputRef.current) {
          fileInputRef.current.value = '';
        }
      }
    };
    reader.readAsText(file);
  };

  const handleConfirmRestore = async () => {
    if (!selectedFileContent) return;
    setIsRestoring(true);
    try {
      const result = await restoreBackup(selectedFileContent);
      setRestoreSuccessInfo(result);
      await refreshAppData();
      await loadStatus();
      showToast('שחזור הנתונים הושלם בהצלחה!');
    } catch (err: any) {
      showToast(err.message || 'שגיאה בביצוע השחזור');
    } finally {
      setIsRestoring(false);
    }
  };

  const closeRestoreModal = () => {
    setIsRestoreModalOpen(false);
    setSelectedFileContent(null);
    setValidationResult(null);
    setRestoreSuccessInfo(null);
  };

  const formatDateTime = (isoStr?: string) => {
    if (!isoStr) return 'לא קיים תיעוד';
    try {
      const d = new Date(isoStr);
      return `${d.toLocaleDateString('he-IL')} בשעה ${d.toLocaleTimeString('he-IL', { hour: '2-digit', minute: '2-digit' })}`;
    } catch {
      return isoStr;
    }
  };

  return (
    <div className="liquid-glass rounded-3xl p-6 sm:p-7 relative overflow-hidden border border-[#BC796F]/20 shadow-[0_12px_40px_-15px_rgba(188,121,111,0.08)] bg-gradient-to-br from-white/90 via-white/75 to-[#FAF4F2]/70 backdrop-blur-xl">
      {/* Section Header */}
      <div className="flex items-center justify-between pb-4 border-b border-[#BC796F]/15 mb-6">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-[#BC796F]/15 flex items-center justify-center text-[#88463F] border border-[#BC796F]/25 shadow-xs">
            <HardDrive className="w-5 h-5" />
          </div>
          <div>
            <h2 className="text-lg font-bold text-warm-950">גיבוי ושחזור נתונים</h2>
            <p className="text-xs text-[#7D5A56]">שמירה מאובטחת, ייצוא גרסאות ושחזור מבוקר של כל נתוני המערכת</p>
          </div>
        </div>

        <button
          type="button"
          onClick={loadStatus}
          disabled={isLoadingStatus}
          className="p-2 rounded-xl text-[#7D5A56] hover:text-warm-950 hover:bg-white/50 active:scale-95 transition-all"
          title="רענון סטטוס גיבוי"
          aria-label="רענון סטטוס גיבוי"
        >
          <RefreshCw className={`w-4 h-4 ${isLoadingStatus ? 'animate-spin' : ''}`} />
        </button>
      </div>

      <div className="flex flex-col gap-6">
        {/* Status & Automatic Backups */}
        <div className="p-4 sm:p-5 rounded-2xl bg-white/60 border border-white/90 shadow-xs backdrop-blur-md">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div>
              <div className="flex items-center gap-2">
                <ShieldCheck className="w-4 h-4 text-[#BC796F]" />
                <h3 className="font-bold text-warm-950 text-sm">גיבויים אוטומטיים במערכת הקבצים</h3>
              </div>
              <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-[#7D5A56] mt-2 font-medium">
                <span>
                  גיבוי אחרון:{' '}
                  <strong className="text-warm-950">{formatDateTime(backupStatus?.lastBackupAt)}</strong>
                </span>
                <span>•</span>
                <span>
                  סטטוס:{' '}
                  <strong className="text-[#88463F]">פעיל ומאוחסן בשרת</strong>
                </span>
                {backupStatus?.totalSnapshots !== undefined && (
                  <>
                    <span>•</span>
                    <span>
                      עותקי גיבוי שמורים:{' '}
                      <strong className="text-warm-950 tabular-nums">{backupStatus.totalSnapshots}</strong>
                    </span>
                  </>
                )}
              </div>
            </div>

            <button
              type="button"
              onClick={handleCreateSnapshot}
              disabled={isCreatingSnapshot}
              className="flex items-center justify-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-bold text-[#88463F] bg-[#BC796F]/15 hover:bg-[#BC796F]/25 border border-[#BC796F]/30 transition-all shrink-0 active:scale-98 shadow-xs"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isCreatingSnapshot ? 'animate-spin' : ''}`} />
              <span>{isCreatingSnapshot ? 'יוצר גיבוי...' : 'יצירת נקודת גיבוי עכשיו'}</span>
            </button>
          </div>

          {/* Honest Storage Architecture Disclaimer */}
          <div className="mt-4 pt-3 border-t border-[#BC796F]/10 flex items-start gap-2 text-[11px] text-[#7D5A56] leading-relaxed">
            <Info className="w-3.5 h-3.5 text-[#BC796F] shrink-0 mt-0.5" />
            <p>
              הגיבויים האוטומטיים נשמרים במערכת הקבצים של השרת (תיקיית <code>data/backups/</code>) בעת כל שינוי משמעותי. לתשומת לבך: גיבוי מתוזמן ברקע אינו מובטח כאשר יישום השרת סגור לחלוטין.
            </p>
          </div>
        </div>

        {/* Action Grid: Download Backup & Restore Backup */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {/* Download Backup */}
          <div className="p-4 sm:p-5 rounded-2xl bg-white/60 border border-white/90 shadow-xs flex flex-col justify-between backdrop-blur-md">
            <div>
              <div className="flex items-center gap-2 mb-2">
                <Download className="w-4 h-4 text-[#BC796F]" />
                <h3 className="font-bold text-warm-950 text-sm">הורדת גיבוי מלא</h3>
              </div>
              <p className="text-xs text-[#7D5A56] leading-relaxed">
                ייצוא חבילת גיבוי מלאה (JSON) של כל הלקוחות, הפרויקטים, דיווחי השעות, הגדרות העסק, המסמכים הרשמיים, הטיוטות ויומן הביקורת.
              </p>
              <p className="text-[11px] text-[#8C6D68] mt-2 font-medium">
                🔒 מטעמי אבטחה, קובץ הגיבוי אינו כולל סיסמאות שרת דוא״ל (SMTP) או מפתחות API.
              </p>
            </div>

            <button
              type="button"
              onClick={downloadBackup}
              className="mt-5 flex items-center justify-center gap-2 w-full py-2.5 rounded-xl text-xs font-bold text-white bg-gradient-to-r from-[#BC796F] to-[#A46A69] hover:from-[#A46A69] hover:to-[#88463F] shadow-sm hover:shadow transition-all active:scale-98"
            >
              <Download className="w-4 h-4" />
              <span>הורדת קובץ גיבוי (JSON)</span>
            </button>
          </div>

          {/* Restore from Backup */}
          <div className="p-4 sm:p-5 rounded-2xl bg-white/60 border border-white/90 shadow-xs flex flex-col justify-between backdrop-blur-md">
            <div>
              <div className="flex items-center gap-2 mb-2">
                <Upload className="w-4 h-4 text-[#88463F]" />
                <h3 className="font-bold text-warm-950 text-sm">שחזור מגיבוי</h3>
              </div>
              <p className="text-xs text-[#7D5A56] leading-relaxed">
                שחזור מבוקר מקובץ גיבוי קודם. המערכת תבדוק את תקינות הקובץ, תציג תצוגה מקדימה, ותיצור גיבוי הצלה מקדים באופן אוטומטי.
              </p>
              <p className="text-[11px] text-[#8C6D68] mt-2 font-medium">
                🛡️ מסמכים רשמיים שהופקו יישמרו, ומספרי הרצף הרשמיים לעולם לא יגולגלו לאחור.
              </p>
            </div>

            <div className="mt-5">
              <input
                ref={fileInputRef}
                type="file"
                accept=".json,application/json"
                onChange={handleFileChange}
                className="hidden"
                id="restore-backup-file-input"
              />
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                disabled={isValidating}
                className="flex items-center justify-center gap-2 w-full py-2.5 rounded-xl text-xs font-bold text-[#88463F] bg-white border border-[#BC796F]/30 hover:border-[#BC796F]/60 hover:bg-[#BC796F]/5 shadow-xs transition-all active:scale-98"
              >
                <Upload className="w-4 h-4" />
                <span>{isValidating ? 'בודק קובץ גיבוי...' : 'בחירת קובץ גיבוי לשחזור...'}</span>
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Restore Preview & Confirmation Modal */}
      {isRestoreModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div onClick={closeRestoreModal} className="fixed inset-0 bg-warm-950/40 backdrop-blur-md" />
          <div
            role="dialog"
            aria-modal="true"
            dir="rtl"
            className="relative w-full max-w-lg liquid-glass rounded-3xl shadow-2xl p-6 sm:p-7 z-10 border border-white/80 max-h-[90vh] overflow-y-auto"
          >
            <div className="flex items-center justify-between pb-3 border-b border-[#BC796F]/15 mb-4">
              <div className="flex items-center gap-2">
                <HardDrive className="w-5 h-5 text-[#88463F]" />
                <h3 className="font-bold text-warm-950 text-base">אישור שחזור נתונים מגיבוי</h3>
              </div>
              <button onClick={closeRestoreModal} className="p-1 rounded-lg text-warm-700 hover:text-warm-950">
                <X className="w-5 h-5" />
              </button>
            </div>

            {restoreSuccessInfo ? (
              <div className="flex flex-col gap-4 text-center py-4">
                <div className="w-12 h-12 rounded-full bg-emerald-100 text-emerald-700 flex items-center justify-center mx-auto border border-emerald-200">
                  <CheckCircle2 className="w-7 h-7" />
                </div>
                <h4 className="font-bold text-warm-950 text-base">השחזור הושלם בהצלחה!</h4>
                <p className="text-xs text-[#7D5A56] leading-relaxed">
                  הנתונים שוחזרו בהצלחה מהקובץ. נוצר גיבוי הצלה מקדים: <br />
                  <code className="text-[11px] font-bold text-warm-900 bg-white/70 px-2 py-0.5 rounded border border-black/5 mt-1 inline-block">
                    {restoreSuccessInfo.recoveryFile}
                  </code>
                </p>
                <div className="p-3 rounded-xl bg-white/60 border border-white text-xs text-warm-800 text-right">
                  <div>שוחזרו: {restoreSuccessInfo.restoredCounts?.clients || 0} לקוחות</div>
                  <div>שוחזרו: {restoreSuccessInfo.restoredCounts?.projects || 0} פרויקטים</div>
                  <div>שוחזרו: {restoreSuccessInfo.restoredCounts?.entries || 0} דיווחי שעות</div>
                  <div>שוחזרו: {restoreSuccessInfo.restoredCounts?.documents || 0} מסמכים</div>
                </div>
                <button
                  type="button"
                  onClick={closeRestoreModal}
                  className="mt-2 w-full py-2.5 rounded-xl text-xs font-bold text-white bg-[#BC796F] hover:bg-[#88463F] transition-all"
                >
                  סגירה
                </button>
              </div>
            ) : (
              <div className="flex flex-col gap-4">
                <div className="p-3.5 rounded-2xl bg-amber-500/10 border border-amber-500/25 text-amber-900 text-xs flex items-start gap-2.5">
                  <AlertTriangle className="w-4 h-4 text-amber-700 shrink-0 mt-0.5" />
                  <div>
                    <strong>שים לב: פעולת שחזור תחליף את נתוני העבודה הנוכחיים בנתוני הגיבוי.</strong>
                    <div className="mt-1 text-[11px] text-amber-800/90">
                      למען ביטחונך, המערכת תיצור באופן אוטומטי גיבוי הצלה מקדים (Recovery Snapshot) לפני החלת השינויים.
                    </div>
                  </div>
                </div>

                {/* Inspect Summary */}
                {validationResult && (
                  <div className="p-4 rounded-2xl bg-white/70 border border-white text-xs space-y-2">
                    <div className="font-bold text-warm-950 pb-1 border-b border-[#BC796F]/10">
                      תוכן קובץ הגיבוי:
                    </div>
                    <div className="grid grid-cols-2 gap-2 text-[#7D5A56]">
                      <div>גרסת גיבוי: <strong className="text-warm-950">{validationResult.version}</strong></div>
                      <div>תאריך ייצוא: <strong className="text-warm-950">{formatDateTime(validationResult.exportDate)}</strong></div>
                      <div>לקוחות: <strong className="text-warm-950">{validationResult.counts?.clients || 0}</strong></div>
                      <div>פרויקטים: <strong className="text-warm-950">{validationResult.counts?.projects || 0}</strong></div>
                      <div>דיווחי שעות: <strong className="text-warm-950">{validationResult.counts?.entries || 0}</strong></div>
                      <div>מסמכים: <strong className="text-warm-950">{validationResult.counts?.documents || 0}</strong></div>
                    </div>

                    {validationResult.warnings && validationResult.warnings.length > 0 && (
                      <div className="mt-3 pt-2 border-t border-[#BC796F]/10 space-y-1">
                        <div className="font-semibold text-amber-900">הערות בטיחות חשובות:</div>
                        {validationResult.warnings.map((w: string, idx: number) => (
                          <div key={idx} className="text-[11px] text-amber-800 flex items-start gap-1">
                            <span>•</span>
                            <span>{w}</span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}

                {/* Protection guarantees */}
                <div className="text-[11px] text-[#7D5A56] space-y-1 leading-relaxed bg-[#BC796F]/5 p-3 rounded-xl border border-[#BC796F]/15">
                  <div className="font-bold text-[#88463F] text-xs">הגנות בטיחות המובנות בשחזור:</div>
                  <div>✓ מסמכים רשמיים שהופקו במערכת הנוכחית יישמרו ולא יימחקו.</div>
                  <div>✓ מספרי הרצף הרשמיים לעולם לא יגולגלו לאחור על מנת למנוע כפילויות מסמכים.</div>
                  <div>✓ מזהי מסמכים ורשומות ייבדקו באופן קפדני.</div>
                </div>

                <div className="flex items-center justify-end gap-3 pt-2">
                  <button
                    type="button"
                    onClick={closeRestoreModal}
                    disabled={isRestoring}
                    className="px-4 py-2 rounded-xl text-xs font-semibold text-warm-800 hover:bg-white/50 transition-all"
                  >
                    ביטול
                  </button>
                  <button
                    type="button"
                    onClick={handleConfirmRestore}
                    disabled={isRestoring || !validationResult?.canRestore}
                    className="flex items-center gap-2 px-5 py-2.5 rounded-xl text-xs font-bold text-white bg-gradient-to-r from-[#88463F] to-[#BC796F] hover:from-[#6E352F] hover:to-[#A46A69] shadow-sm transition-all active:scale-98 disabled:opacity-50"
                  >
                    <Upload className="w-3.5 h-3.5" />
                    <span>{isRestoring ? 'מבצע שחזור מאובטח...' : 'אישור ושחזור הנתונים'}</span>
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
