import React, { useState, useMemo } from 'react';
import { useApp } from '../../context/AppContext';
import { useDocuments } from '../../context/DocumentsContext';
import { 
  type MonthlyExportOptions, 
  generateMonthlyExcelXml, 
  generateMonthlyCsv, 
  downloadFile 
} from '../../utils/monthlyExportUtils';
import { formatCurrency } from '../../utils/moneyUtils';
import { 
  FileSpreadsheet, 
  Download, 
  X, 
  Calendar, 
  AlertCircle,
  Layers
} from 'lucide-react';
import { CustomSelect } from '../CustomSelect';
import type { TimeEntry } from '../../types';

interface MonthlyExportModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const MonthlyExportModal: React.FC<MonthlyExportModalProps> = ({
  isOpen,
  onClose,
}) => {
  const { clients, projects, entries, showToast } = useApp();
  const { documents } = useDocuments();

  // Current year & month in Asia/Jerusalem
  const defaultYearMonth = useMemo(() => {
    const now = new Date();
    try {
      const parts = new Intl.DateTimeFormat('en-CA', {
        timeZone: 'Asia/Jerusalem',
        year: 'numeric',
        month: 'numeric',
      }).formatToParts(now);
      const y = parseInt(parts.find(p => p.type === 'year')?.value || `${now.getFullYear()}`);
      const m = parseInt(parts.find(p => p.type === 'month')?.value || `${now.getMonth() + 1}`);
      return { year: y, month: m };
    } catch {
      return { year: now.getFullYear(), month: now.getMonth() + 1 };
    }
  }, []);

  const [selectedYear, setSelectedYear] = useState<number>(defaultYearMonth.year);
  const [selectedMonth, setSelectedMonth] = useState<number>(defaultYearMonth.month);
  const [selectedScope, setSelectedScope] = useState<'all' | 'entries' | 'documents'>('all');
  const [selectedFormat, setSelectedFormat] = useState<'xlsx' | 'csv'>('xlsx');
  const [isExporting, setIsExporting] = useState(false);

  // Month options (Hebrew names)
  const monthNames = [
    'ינואר (01)', 'פברואר (02)', 'מרץ (03)', 'אפריל (04)',
    'מאי (05)', 'יוני (06)', 'יולי (07)', 'אוגוסט (08)',
    'ספטמבר (09)', 'אוקטובר (10)', 'נובמבר (11)', 'דצמבר (12)'
  ];

  const monthOptions = monthNames.map((name, i) => ({
    value: `${i + 1}`,
    label: name,
  }));

  // Year options: currentYear down to 2 years back and 1 year forward
  const yearOptions = [
    selectedYear - 2,
    selectedYear - 1,
    selectedYear,
    selectedYear + 1,
  ].map(y => ({ value: `${y}`, label: `${y}` }));

  // Month prefix string
  const monthPad = String(selectedMonth).padStart(2, '0');
  const monthPrefix = `${selectedYear}-${monthPad}`;

  // Preview stats for the selected period
  const previewStats = useMemo(() => {
    // Entries in month
    const monthEntries = entries.filter((e: TimeEntry) => e.date.startsWith(monthPrefix));
    const totalDurationSeconds = monthEntries.reduce((sum: number, e: TimeEntry) => sum + (e.durationSeconds || 0), 0);
    const totalHours = Math.round((totalDurationSeconds / 3600) * 10) / 10;

    // Documents issued in month
    const monthDocs = documents.filter(d => d.status !== 'canceled' && d.date.startsWith(monthPrefix));

    // Receipts received in month
    const monthReceipts = documents.filter(d => {
      if (d.type !== 'receipt' || d.status === 'canceled') return false;
      const rDate = d.paymentReceivedDate || d.date;
      return rDate.startsWith(monthPrefix);
    });

    const totalReceiptsAmount = monthReceipts.reduce((sum, r) => sum + (r.totalAmount || 0), 0);

    return {
      entriesCount: monthEntries.length,
      totalHours,
      docsCount: monthDocs.length,
      receiptsCount: monthReceipts.length,
      totalReceiptsAmount,
    };
  }, [entries, documents, monthPrefix]);

  const handleExport = () => {
    setIsExporting(true);
    try {
      const options: MonthlyExportOptions = {
        year: selectedYear,
        month: selectedMonth,
        scope: selectedScope,
        format: selectedFormat,
      };

      const fileBaseName = `amit_touch_monthly_${selectedYear}_${monthPad}_${selectedScope}`;

      if (selectedFormat === 'xlsx') {
        const xmlContent = generateMonthlyExcelXml(entries, documents, clients, projects, options);
        downloadFile(xmlContent, `${fileBaseName}.xls`, 'application/vnd.ms-excel;charset=utf-8');
      } else {
        const csvContent = generateMonthlyCsv(entries, documents, clients, projects, options);
        downloadFile(csvContent, `${fileBaseName}.csv`, 'text/csv;charset=utf-8');
      }

      showToast(`ייצוא לחודש ${monthPad}/${selectedYear} הורד בהצלחה`);
      onClose();
    } catch (err: any) {
      showToast(err.message || 'שגיאה בהפקת קובץ הייצוא');
    } finally {
      setIsExporting(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div 
      className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-5 bg-black/45 backdrop-blur-sm animate-fade-in font-heebo"
      onClick={onClose}
    >
      <div 
        className="liquid-glass w-full max-w-xl rounded-3xl shadow-2xl border border-white/70 overflow-hidden flex flex-col my-auto"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="px-6 py-4 border-b border-[#BC796F]/15 flex items-center justify-between bg-white/40">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-gradient-to-tr from-[#BC796F] to-[#E4AEA3] flex items-center justify-center text-white shadow-md shadow-[#BC796F]/20">
              <FileSpreadsheet className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-xl font-bold text-warm-950">ייצוא חודשי מרוכז</h2>
              <p className="text-xs text-warm-600 font-normal">
                הפקת נתוני שעות, מסמכים ותקבולים בפורמט Excel / CSV רב-עמודי
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-2 rounded-xl text-warm-600 hover:text-warm-900 hover:bg-white/60 transition-colors"
            aria-label="סגור"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Form Body */}
        <div className="p-6 flex flex-col gap-5 overflow-y-auto max-h-[75vh] scrollbar-none">
          {/* Period Selector: Year & Month */}
          <div className="flex flex-col gap-2">
            <label className="text-xs font-bold text-warm-900 flex items-center gap-1.5">
              <Calendar className="w-3.5 h-3.5 text-[#BC796F]" />
              <span>תקופת הייצוא (שעון ישראל)</span>
            </label>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-[11px] text-warm-600 mb-1">חודש</label>
                <CustomSelect
                  value={`${selectedMonth}`}
                  onChange={v => setSelectedMonth(parseInt(v, 10))}
                  options={monthOptions}
                  triggerClassName="h-10 text-xs"
                />
              </div>

              <div>
                <label className="block text-[11px] text-warm-600 mb-1">שנה</label>
                <CustomSelect
                  value={`${selectedYear}`}
                  onChange={v => setSelectedYear(parseInt(v, 10))}
                  options={yearOptions}
                  triggerClassName="h-10 text-xs"
                />
              </div>
            </div>
          </div>

          {/* Scope Selector */}
          <div className="flex flex-col gap-2">
            <label className="text-xs font-bold text-warm-900 flex items-center gap-1.5">
              <Layers className="w-3.5 h-3.5 text-[#BC796F]" />
              <span>היקף הנתונים</span>
            </label>

            <div className="grid grid-cols-3 gap-2">
              <button
                type="button"
                onClick={() => setSelectedScope('all')}
                className={`p-3 rounded-2xl border text-right transition-all flex flex-col gap-1 ${
                  selectedScope === 'all'
                    ? 'bg-white border-[#BC796F] shadow-sm ring-1 ring-[#BC796F]/30 text-warm-950 font-bold'
                    : 'bg-white/40 border-white/70 text-warm-700 hover:bg-white/60'
                }`}
              >
                <span className="text-xs font-bold">הכל</span>
                <span className="text-[10px] text-warm-500 font-normal">שעות + מסמכים + קבלות</span>
              </button>

              <button
                type="button"
                onClick={() => setSelectedScope('entries')}
                className={`p-3 rounded-2xl border text-right transition-all flex flex-col gap-1 ${
                  selectedScope === 'entries'
                    ? 'bg-white border-[#BC796F] shadow-sm ring-1 ring-[#BC796F]/30 text-warm-950 font-bold'
                    : 'bg-white/40 border-white/70 text-warm-700 hover:bg-white/60'
                }`}
              >
                <span className="text-xs font-bold">דיווחי שעות</span>
                <span className="text-[10px] text-warm-500 font-normal">פירוט משימות ותעריפים</span>
              </button>

              <button
                type="button"
                onClick={() => setSelectedScope('documents')}
                className={`p-3 rounded-2xl border text-right transition-all flex flex-col gap-1 ${
                  selectedScope === 'documents'
                    ? 'bg-white border-[#BC796F] shadow-sm ring-1 ring-[#BC796F]/30 text-warm-950 font-bold'
                    : 'bg-white/40 border-white/70 text-warm-700 hover:bg-white/60'
                }`}
              >
                <span className="text-xs font-bold">מסמכים ותקבולים</span>
                <span className="text-[10px] text-warm-500 font-normal">חשבונות וקבלות שהופקו</span>
              </button>
            </div>
          </div>

          {/* Format Selector */}
          <div className="flex flex-col gap-2">
            <label className="text-xs font-bold text-warm-900">פורמט הקובץ</label>

            <div className="grid grid-cols-2 gap-3">
              <label className={`flex items-center gap-2.5 p-3 rounded-2xl border cursor-pointer transition-all ${
                selectedFormat === 'xlsx'
                  ? 'bg-white border-[#BC796F] shadow-sm ring-1 ring-[#BC796F]/30 text-warm-950'
                  : 'bg-white/40 border-white/70 text-warm-700 hover:bg-white/60'
              }`}>
                <input
                  type="radio"
                  name="exportFormat"
                  value="xlsx"
                  checked={selectedFormat === 'xlsx'}
                  onChange={() => setSelectedFormat('xlsx')}
                  className="accent-[#BC796F] w-4 h-4"
                />
                <div>
                  <div className="text-xs font-bold">Excel (.xls)</div>
                  <div className="text-[10px] text-warm-500">גליונות מופרדים עם RTL וסגנון עברי</div>
                </div>
              </label>

              <label className={`flex items-center gap-2.5 p-3 rounded-2xl border cursor-pointer transition-all ${
                selectedFormat === 'csv'
                  ? 'bg-white border-[#BC796F] shadow-sm ring-1 ring-[#BC796F]/30 text-warm-950'
                  : 'bg-white/40 border-white/70 text-warm-700 hover:bg-white/60'
              }`}>
                <input
                  type="radio"
                  name="exportFormat"
                  value="csv"
                  checked={selectedFormat === 'csv'}
                  onChange={() => setSelectedFormat('csv')}
                  className="accent-[#BC796F] w-4 h-4"
                />
                <div>
                  <div className="text-xs font-bold">CSV (UTF-8 עם BOM)</div>
                  <div className="text-[10px] text-warm-500">תאימות מלאה לטקסט ופסיקים</div>
                </div>
              </label>
            </div>
          </div>

          {/* Live Month Preview Cards */}
          <div className="p-4 rounded-2xl bg-white/50 border border-white/70 flex flex-col gap-2">
            <span className="text-[11px] font-bold text-warm-800">
              סיכום מקדים לחודש {monthPad}/{selectedYear}:
            </span>

            <div className="grid grid-cols-3 gap-2.5 text-center">
              <div className="p-2.5 rounded-xl bg-white/70 border border-warm-200/50">
                <div className="text-[10px] text-warm-500">שעות שבוצעו</div>
                <div className="text-sm font-bold text-warm-950 tabular-nums">
                  {previewStats.totalHours} שע׳
                </div>
                <div className="text-[9px] text-warm-400">({previewStats.entriesCount} דיווחים)</div>
              </div>

              <div className="p-2.5 rounded-xl bg-white/70 border border-warm-200/50">
                <div className="text-[10px] text-warm-500">מסמכים שהופקו</div>
                <div className="text-sm font-bold text-warm-950 tabular-nums">
                  {previewStats.docsCount}
                </div>
                <div className="text-[9px] text-warm-400">(חשבונות/הצעות/קבלות)</div>
              </div>

              <div className="p-2.5 rounded-xl bg-white/70 border border-warm-200/50">
                <div className="text-[10px] text-warm-500">תקבולים שנגבו</div>
                <div className="text-sm font-bold text-emerald-800 tabular-nums">
                  {formatCurrency(previewStats.totalReceiptsAmount, '₪')}
                </div>
                <div className="text-[9px] text-warm-400">({previewStats.receiptsCount} קבלות)</div>
              </div>
            </div>
          </div>

          {/* Legal Notice / Disclaimer */}
          <div className="flex items-start gap-2.5 p-3 rounded-2xl bg-[#FAF4F2] border border-[#BC796F]/25 text-[11px] text-[#7D5A56] leading-relaxed">
            <AlertCircle className="w-4 h-4 text-[#BC796F] shrink-0 mt-0.5" />
            <p>
              <strong>הודעה משפטית:</strong> ייצוא זה נועד לצורכי ניהול ומעקב פנימי בלבד ואינו מהווה דיווח מס רשמי או תחליף לקובץ במבנה אחיד (BKMVD). הערכים מיוצאים בדיוק מלא ומסננים נוסחאות זדוניות.
            </p>
          </div>
        </div>

        {/* Modal Actions */}
        <div className="px-6 py-4 border-t border-[#BC796F]/15 bg-white/40 flex items-center justify-end gap-3">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 rounded-xl text-xs font-semibold text-warm-800 hover:bg-white/60 transition-colors"
          >
            ביטול
          </button>

          <button
            type="button"
            onClick={handleExport}
            disabled={isExporting}
            className="flex items-center gap-2 px-5 py-2.5 rounded-xl text-xs font-bold text-white bg-[#BC796F] hover:bg-[#A46A69] transition-all shadow-md active:scale-95 disabled:opacity-50"
          >
            <Download className="w-4 h-4" />
            <span>הורדת קובץ ייצוא</span>
          </button>
        </div>
      </div>
    </div>
  );
};
