import React, { useState, useMemo } from 'react';
import { useApp } from '../../context/AppContext';
import { useDocuments } from '../../context/DocumentsContext';
import { CustomSelect } from '../CustomSelect';
import { CustomDatePicker } from '../CustomDatePicker';
import { formatDurationHHMM } from '../../utils/dateUtils';
import { formatCurrency } from '../../utils/moneyUtils';
import { 
  analyzeTimeEntries, 
  generateTimeBillingDocumentData,
  type TimeBillingLayoutMode 
} from '../../utils/timeBillingUtils';
import { 
  Clock, 
  AlertTriangle, 
  List, 
  AlignLeft, 
  CheckCircle, 
  X, 
  Eye, 
  ArrowRight,
  Info,
  Check,
  FileSpreadsheet
} from 'lucide-react';

import type { AppDocument } from '../../types/documents';

interface TimeBillingModalProps {
  isOpen: boolean;
  onClose: () => void;
  onDraftCreated?: (docId: string, draft?: AppDocument) => void;
  initialClientId?: string;
}

export const TimeBillingModal: React.FC<TimeBillingModalProps> = ({
  isOpen,
  onClose,
  onDraftCreated,
  initialClientId,
}) => {
  const { clients, projects, entries, settings } = useApp();
  const { getBilledTimeEntryIds, createDraftFromTimeEntries, businessSettings } = useDocuments();

  const [activeTab, setActiveTab] = useState<'select' | 'preview'>('select');
  const [selectedClientId, setSelectedClientId] = useState<string>(initialClientId || clients[0]?.id || '');
  const [selectedProjectId, setSelectedProjectId] = useState<string>('');
  const [fromDate, setFromDate] = useState<string>('');
  const [toDate, setToDate] = useState<string>('');
  
  // Layout Options:
  // Option 1: 'detailed_lines' (“פירוט בשורות המסמך”)
  // Option 2: 'summary_with_notes' (“שורה מסכמת ופירוט בהערות”)
  const [layoutMode, setLayoutMode] = useState<TimeBillingLayoutMode>('detailed_lines');
  const [splitByRate, setSplitByRate] = useState<boolean>(false);
  const [manualNotes, setManualNotes] = useState<string>(businessSettings.defaultNotes || '');

  const [selectedEntryIds, setSelectedEntryIds] = useState<Set<string>>(new Set());
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState('');

  const billedEntryIds = useMemo(() => getBilledTimeEntryIds(), [getBilledTimeEntryIds]);

  // Filter available unbilled entries
  const availableEntries = useMemo(() => {
    return entries.filter(e => {
      // Exclude already billed
      if (billedEntryIds.has(e.id)) return false;
      // Filter by selected client
      if (selectedClientId && e.clientId !== selectedClientId) return false;
      // Filter by selected project
      if (selectedProjectId && e.projectId !== selectedProjectId) return false;
      // Date filters
      if (fromDate && e.date < fromDate) return false;
      if (toDate && e.date > toDate) return false;
      return true;
    });
  }, [entries, billedEntryIds, selectedClientId, selectedProjectId, fromDate, toDate]);

  // Toggle selection for all filtered entries
  const handleSelectAll = () => {
    if (selectedEntryIds.size === availableEntries.length) {
      setSelectedEntryIds(new Set());
    } else {
      setSelectedEntryIds(new Set(availableEntries.map(e => e.id)));
    }
  };

  const handleToggleEntry = (id: string) => {
    const next = new Set(selectedEntryIds);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setSelectedEntryIds(next);
  };

  // Currently selected entries list
  const selectedEntries = useMemo(() => {
    return availableEntries.filter(e => selectedEntryIds.has(e.id));
  }, [availableEntries, selectedEntryIds]);

  // Calculate live analysis
  const analysis = useMemo(() => {
    return analyzeTimeEntries(
      selectedEntries,
      projects,
      settings.defaultHourlyRate || 350
    );
  }, [selectedEntries, projects, settings.defaultHourlyRate]);

  // Calculate document preview data
  const previewData = useMemo(() => {
    return generateTimeBillingDocumentData({
      selectedEntries,
      projects,
      defaultHourlyRate: settings.defaultHourlyRate || 350,
      mode: layoutMode,
      splitByRate,
      manualNotes,
      isVatExempt: businessSettings.businessType === 'exempt',
    });
  }, [selectedEntries, projects, settings.defaultHourlyRate, layoutMode, splitByRate, manualNotes, businessSettings.businessType]);

  // Handle auto-suggesting splitByRate if rounding discrepancy occurs
  React.useEffect(() => {
    if (analysis.hasMultipleRates && !analysis.reconcilesCleanly && !splitByRate) {
      // Keep splitByRate user controlled or default as needed
    }
  }, [analysis.hasMultipleRates, analysis.reconcilesCleanly, splitByRate]);

  if (!isOpen) return null;

  const handleCreateDraft = async () => {
    if (selectedEntryIds.size === 0) {
      setError('יש לבחור לפחות דיווח שעות אחד להפקה');
      return;
    }
    if (!selectedClientId) {
      setError('יש לבחור לקוח');
      return;
    }

    setIsSubmitting(true);
    setError('');
    try {
      const draft = await createDraftFromTimeEntries(
        selectedClientId,
        selectedProjectId || undefined,
        Array.from(selectedEntryIds),
        layoutMode,
        {
          splitByRate,
          manualNotes,
        }
      );
      onClose();
      if (onDraftCreated) {
        onDraftCreated(draft.id, draft);
      }
    } catch (err: any) {
      setError(err.message || 'שגיאה ביצירת טיוטה');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-5 overflow-y-auto">
      <div onClick={onClose} className="fixed inset-0 bg-warm-950/45 backdrop-blur-md transition-opacity" />

      <div
        role="dialog"
        aria-modal="true"
        dir="rtl"
        className="relative w-full max-w-4xl liquid-glass rounded-3xl shadow-2xl p-5 sm:p-7 z-10 border border-white/85 text-right flex flex-col max-h-[92vh] my-auto"
      >
        {/* Header with Title and Mode Switch */}
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between pb-3.5 border-b border-[#BC796F]/15 mb-4 gap-3 shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-[#BC796F]/15 flex items-center justify-center text-[#BC796F] shadow-xs">
              <Clock className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-bold text-warm-950 text-base sm:text-lg">יצירת חשבון עסקה מדיווחי שעות</h3>
              <p className="text-xs text-[#7D5A56]">חיוב שעות עבודה שנרשמו במערכת עם התאמה מושלמת של תעריפים וסכומים</p>
            </div>
          </div>

          <div className="flex items-center gap-2 self-end sm:self-center">
            {/* View Tabs */}
            <div className="flex items-center p-1 rounded-xl bg-white/60 border border-white/80 shadow-xs text-xs">
              <button
                type="button"
                onClick={() => setActiveTab('select')}
                className={`px-3 py-1.5 rounded-lg font-bold transition-all ${
                  activeTab === 'select'
                    ? 'bg-[#BC796F] text-white shadow-xs'
                    : 'text-warm-700 hover:text-warm-950'
                }`}
              >
                1. בחירת שעות
              </button>
              <button
                type="button"
                onClick={() => setActiveTab('preview')}
                disabled={selectedEntryIds.size === 0}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg font-bold transition-all disabled:opacity-40 ${
                  activeTab === 'preview'
                    ? 'bg-[#BC796F] text-white shadow-xs'
                    : 'text-warm-700 hover:text-warm-950'
                }`}
              >
                <Eye className="w-3.5 h-3.5" />
                <span>2. תצוגה מקדימה</span>
              </button>
            </div>

            <button 
              onClick={onClose} 
              aria-label="סגור"
              className="p-1.5 rounded-xl text-warm-600 hover:text-warm-950 hover:bg-white/60 transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {error && (
          <div className="p-3 mb-3 rounded-2xl bg-red-500/10 border border-red-500/25 text-red-800 text-xs font-semibold flex items-center gap-2 shrink-0 animate-fade-in">
            <AlertTriangle className="w-4 h-4 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        {/* Tab 1: Selection & Layout Options */}
        {activeTab === 'select' && (
          <div className="flex-1 overflow-y-auto scrollbar-none flex flex-col gap-4 pr-1">
            {/* Filters Row */}
            <div className="grid grid-cols-1 sm:grid-cols-4 gap-3 shrink-0 p-3.5 rounded-2xl bg-white/50 border border-white/70">
              <div>
                <label className="text-xs font-bold text-warm-900 block mb-1">לקוח לחיוב *</label>
                <CustomSelect
                  value={selectedClientId}
                  onChange={v => {
                    setSelectedClientId(v);
                    setSelectedProjectId('');
                    setSelectedEntryIds(new Set());
                  }}
                  options={clients.map(c => ({ value: c.id, label: c.name }))}
                  triggerClassName="h-10 bg-white/85"
                />
              </div>

              <div>
                <label className="text-xs font-bold text-warm-900 block mb-1">סינון לפי פרויקט</label>
                <CustomSelect
                  value={selectedProjectId}
                  onChange={setSelectedProjectId}
                  options={[
                    { value: '', label: 'כל הפרויקטים ללקוח זה' },
                    ...projects
                      .filter(p => !selectedClientId || p.clientId === selectedClientId)
                      .map(p => ({ value: p.id, label: p.name })),
                  ]}
                  triggerClassName="h-10 bg-white/85"
                />
              </div>

              <div>
                <label className="text-xs font-bold text-warm-900 block mb-1">מתאריך</label>
                <CustomDatePicker value={fromDate} onChange={setFromDate} />
              </div>

              <div>
                <label className="text-xs font-bold text-warm-900 block mb-1">עד תאריך</label>
                <CustomDatePicker value={toDate} onChange={setToDate} />
              </div>
            </div>

            {/* Layout Options: “אופן הצגת השעות במסמך” */}
            <div className="p-4 rounded-2xl bg-white/60 border border-white/80 shadow-xs flex flex-col gap-3 shrink-0">
              <div className="flex items-center justify-between">
                <span className="text-xs font-black text-warm-950 flex items-center gap-1.5">
                  <FileSpreadsheet className="w-4 h-4 text-[#BC796F]" />
                  <span>אופן הצגת השעות במסמך:</span>
                </span>
                <span className="text-[11px] text-[#7D5A56]">
                  בחר כיצד יוצגו השעות והתעריפים בתוך חשבון העסקה
                </span>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {/* Option 1: “פירוט בשורות המסמך” */}
                <div
                  onClick={() => setLayoutMode('detailed_lines')}
                  className={`p-3.5 rounded-2xl border cursor-pointer transition-all flex flex-col gap-1.5 relative ${
                    layoutMode === 'detailed_lines'
                      ? 'bg-white/95 border-[#BC796F] ring-2 ring-[#BC796F]/25 shadow-sm'
                      : 'bg-white/50 border-white/70 hover:bg-white/80'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <div className={`p-1.5 rounded-xl ${layoutMode === 'detailed_lines' ? 'bg-[#BC796F] text-white' : 'bg-warm-100 text-warm-700'}`}>
                        <List className="w-4 h-4" />
                      </div>
                      <span className="font-bold text-xs text-warm-950">פירוט בשורות המסמך</span>
                    </div>
                    {layoutMode === 'detailed_lines' && (
                      <span className="w-5 h-5 rounded-full bg-[#BC796F] text-white flex items-center justify-center text-[10px]">
                        <Check className="w-3 h-3 stroke-[3]" />
                      </span>
                    )}
                  </div>
                  <p className="text-[11px] text-warm-700 leading-relaxed pr-8">
                    יצירת שורה נפרדת במסמך עבור כל דיווח שעות שנבחר, כולל תאריך, שם הפרויקט, תיאור העבודה, כמות השעות והתעריף הייעודי.
                  </p>
                </div>

                {/* Option 2: “שורה מסכמת ופירוט בהערות” */}
                <div
                  onClick={() => setLayoutMode('summary_with_notes')}
                  className={`p-3.5 rounded-2xl border cursor-pointer transition-all flex flex-col gap-1.5 relative ${
                    layoutMode === 'summary_with_notes'
                      ? 'bg-white/95 border-[#BC796F] ring-2 ring-[#BC796F]/25 shadow-sm'
                      : 'bg-white/50 border-white/70 hover:bg-white/80'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <div className={`p-1.5 rounded-xl ${layoutMode === 'summary_with_notes' ? 'bg-[#BC796F] text-white' : 'bg-warm-100 text-warm-700'}`}>
                        <AlignLeft className="w-4 h-4" />
                      </div>
                      <span className="font-bold text-xs text-warm-950">שורה מסכמת ופירוט בהערות</span>
                    </div>
                    {layoutMode === 'summary_with_notes' && (
                      <span className="w-5 h-5 rounded-full bg-[#BC796F] text-white flex items-center justify-center text-[10px]">
                        <Check className="w-3 h-3 stroke-[3]" />
                      </span>
                    )}
                  </div>
                  <p className="text-[11px] text-warm-700 leading-relaxed pr-8">
                    שורה מרוכזת אחת לתקופת העבודה, והוספת פירוט שעות מובנה, כרונולוגי ומקובץ לפי פרויקטים בהערות המסמך (כולל זמנים ב-HH:mm).
                  </p>
                </div>
              </div>

              {/* Sub-options for Option 2 if Multiple Rates exist */}
              {layoutMode === 'summary_with_notes' && analysis.hasMultipleRates && (
                <div className="mt-1 p-3.5 rounded-2xl bg-amber-50/70 border border-amber-300/50 flex flex-col gap-2.5 text-xs text-warm-900 animate-fade-in">
                  <div className="flex items-start gap-2">
                    <Info className="w-4 h-4 text-amber-700 shrink-0 mt-0.5" />
                    <div className="flex flex-col gap-1">
                      <span className="font-bold text-amber-950">
                        זוהו תעריפים שונים בדיווחים שנבחרו ({analysis.distinctRates.map(r => r + ' ₪').join(', ')})
                      </span>
                      <span className="text-[11px] text-amber-900">
                        תעריף משוקלל אפקטיבי: <strong>{analysis.displayWeightedRate} ₪/שעה</strong>.
                        {!analysis.reconcilesCleanly && (
                          <span className="block mt-0.5 text-amber-900 font-medium">
                            עקב עיגול אריתמטי בדיוק של 2 ספרות קיים הפרש של {analysis.discrepancy} ₪. מוצע לפצל לשורת סיכום לכל תעריף להתאמה מושלמת של כמות × תעריף = סה״כ.
                          </span>
                        )}
                      </span>
                    </div>
                  </div>

                  {/* Radio Switcher between Single Weighted Line and Split Lines per Rate */}
                  <div className="flex flex-wrap items-center gap-3 pt-1 border-t border-amber-200/60">
                    <label className="flex items-center gap-2 cursor-pointer text-xs font-semibold text-warm-900">
                      <input
                        type="radio"
                        name="rateStrategy"
                        checked={!splitByRate}
                        onChange={() => setSplitByRate(false)}
                        className="text-[#BC796F] focus:ring-[#BC796F]"
                      />
                      <span>שורה מסכמת אחת (תעריף משוקלל {analysis.displayWeightedRate} ₪)</span>
                    </label>

                    <label className="flex items-center gap-2 cursor-pointer text-xs font-semibold text-warm-900">
                      <input
                        type="radio"
                        name="rateStrategy"
                        checked={splitByRate}
                        onChange={() => setSplitByRate(true)}
                        className="text-[#BC796F] focus:ring-[#BC796F]"
                      />
                      <span>פיצול לשורת סיכום נפרדת לכל תעריף (מומלץ)</span>
                    </label>
                  </div>
                </div>
              )}
            </div>

            {/* Entries Selection Table */}
            <div className="flex-1 flex flex-col rounded-2xl border border-[#BC796F]/20 bg-white/45 overflow-hidden">
              <div className="flex items-center justify-between p-3 border-b border-[#BC796F]/15 bg-white/65 text-xs">
                <div className="flex items-center gap-3">
                  <button
                    type="button"
                    onClick={handleSelectAll}
                    disabled={availableEntries.length === 0}
                    className="font-bold text-[#88463F] hover:underline disabled:opacity-50"
                  >
                    {availableEntries.length > 0 && selectedEntryIds.size === availableEntries.length ? 'בטל בחירת הכל' : 'בחר הכל'}
                  </button>
                  <span className="text-[#7D5A56] font-medium">
                    (נבחרו {selectedEntryIds.size} מתוך {availableEntries.length} דיווחים שלא חויבו)
                  </span>
                </div>

                {selectedEntryIds.size > 0 && (
                  <span className="text-xs font-black text-[#88463F] tabular-nums">
                    סה״כ לתשלום: {formatCurrency(analysis.combinedTotal)}
                  </span>
                )}
              </div>

              <div className="overflow-y-auto divide-y divide-[#BC796F]/10 max-h-[35vh] scrollbar-none">
                {availableEntries.length === 0 ? (
                  <div className="p-8 text-center text-xs text-[#7D5A56]">
                    לא נמצאו דיווחי שעות שלא חויבו עבור הסינון הנוכחי.
                  </div>
                ) : (
                  availableEntries.map(e => {
                    const proj = projects.find(p => p.id === e.projectId);
                    const isSelected = selectedEntryIds.has(e.id);
                    const hasRate = typeof proj?.hourlyRate === 'number';
                    const rate = hasRate ? proj.hourlyRate! : settings.defaultHourlyRate || 350;
                    const durationDecimal = (e.durationSeconds / 3600).toFixed(2);
                    const durationHHMM = formatDurationHHMM(e.durationSeconds);
                    const entryAmount = Math.round(((e.durationSeconds / 3600) * rate) * 100) / 100;

                    return (
                      <div
                        key={e.id}
                        onClick={() => handleToggleEntry(e.id)}
                        className={`p-3 flex items-center justify-between gap-3 text-xs cursor-pointer transition-colors ${
                          isSelected ? 'bg-[#BC796F]/15' : 'hover:bg-white/60'
                        }`}
                      >
                        <div className="flex items-center gap-3 min-w-0">
                          <input
                            type="checkbox"
                            checked={isSelected}
                            onChange={() => {}} // handled by parent onClick
                            className="rounded text-[#BC796F] focus:ring-[#BC796F]"
                          />
                          <div className="flex flex-col min-w-0">
                            <span className="font-bold text-warm-950 truncate">{e.task || 'עבודה שוטפת'}</span>
                            <div className="flex items-center gap-2 text-[11px] text-[#7D5A56] mt-0.5">
                              <span className="tabular-nums">{e.date}</span>
                              <span>•</span>
                              <span>{proj?.name || 'פרויקט כללי'}</span>
                              <span>•</span>
                              <span className="tabular-nums">תעריף: {rate} ₪/שעה</span>
                              {!hasRate && (
                                <span className="text-amber-800 font-medium bg-amber-100/80 px-1.5 rounded">
                                  ברירת מחדל
                                </span>
                              )}
                            </div>
                          </div>
                        </div>

                        <div className="flex items-center gap-4 shrink-0 text-left">
                          <div className="flex flex-col items-end">
                            <span dir="ltr" className="font-bold text-warm-900 tabular-nums">
                              {durationHHMM} שעות
                            </span>
                            <span className="text-[11px] text-warm-600 tabular-nums">
                              ({durationDecimal} שעות)
                            </span>
                          </div>

                          <div className="w-20 text-left">
                            <span dir="ltr" className="font-black text-[#88463F] tabular-nums">
                              {formatCurrency(entryAmount)}
                            </span>
                          </div>
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            </div>
          </div>
        )}

        {/* Tab 2: Interactive Document Preview */}
        {activeTab === 'preview' && (
          <div className="flex-1 overflow-y-auto scrollbar-none flex flex-col gap-4 pr-1">
            {/* Option Switching Banner inside Preview */}
            <div className="p-3.5 rounded-2xl bg-white/70 border border-white/85 shadow-xs flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 shrink-0">
              <div className="flex items-center gap-2">
                <span className="text-xs font-bold text-warm-900">אופן הצגה נוכחי:</span>
                <div className="flex items-center p-0.5 rounded-xl bg-warm-100/70 border border-warm-200 text-xs">
                  <button
                    type="button"
                    onClick={() => setLayoutMode('detailed_lines')}
                    className={`px-3 py-1 rounded-lg font-bold transition-all ${
                      layoutMode === 'detailed_lines'
                        ? 'bg-[#BC796F] text-white shadow-xs'
                        : 'text-warm-700 hover:text-warm-950'
                    }`}
                  >
                    פירוט בשורות המסמך ({previewData.lineItems.length} שורות)
                  </button>
                  <button
                    type="button"
                    onClick={() => setLayoutMode('summary_with_notes')}
                    className={`px-3 py-1 rounded-lg font-bold transition-all ${
                      layoutMode === 'summary_with_notes'
                        ? 'bg-[#BC796F] text-white shadow-xs'
                        : 'text-warm-700 hover:text-warm-950'
                    }`}
                  >
                    שורה מסכמת ופירוט בהערות
                  </button>
                </div>
              </div>

              {/* Identity & Reconciliation Badge */}
              <div className="flex items-center gap-1.5 text-xs text-emerald-800 bg-emerald-50 px-2.5 py-1 rounded-xl border border-emerald-200">
                <CheckCircle className="w-3.5 h-3.5 text-emerald-700" />
                <span className="font-semibold">סכום זהה בשתי האפשרויות: {formatCurrency(analysis.combinedTotal)}</span>
              </div>
            </div>

            {/* Document Lines Table Preview */}
            <div className="rounded-2xl border border-[#BC796F]/20 bg-white/70 overflow-hidden shadow-xs">
              <div className="p-3 bg-white/85 border-b border-[#BC796F]/15 flex items-center justify-between text-xs">
                <span className="font-black text-warm-950">שורות המסמך המיועדות להיווצר:</span>
                <span className="text-warm-600 font-medium">עוסק פטור — לא נגבה מע״מ</span>
              </div>

              <table className="w-full text-right text-xs">
                <thead>
                  <tr className="bg-warm-50/60 border-b border-warm-200/50 text-[#7D5A56] font-bold">
                    <th className="py-2.5 px-3">תיאור השורה</th>
                    <th className="py-2.5 px-3 text-center">כמות</th>
                    <th className="py-2.5 px-3 text-center">יחידה</th>
                    <th className="py-2.5 px-3 text-left">מחיר יחידה</th>
                    <th className="py-2.5 px-3 text-left">סה״כ שורה</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-warm-100">
                  {previewData.lineItems.map((item, idx) => (
                    <tr key={item.id || idx} className="hover:bg-white/80">
                      <td className="py-2.5 px-3 font-semibold text-warm-950">{item.description}</td>
                      <td className="py-2.5 px-3 text-center tabular-nums">{item.quantity}</td>
                      <td className="py-2.5 px-3 text-center text-warm-600">{item.unit}</td>
                      <td className="py-2.5 px-3 text-left tabular-nums">{formatCurrency(item.unitPrice)}</td>
                      <td className="py-2.5 px-3 text-left font-bold text-[#88463F] tabular-nums">{formatCurrency(item.lineTotal)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>

              {/* Totals Reconciliation Box */}
              <div className="p-4 bg-white/90 border-t border-[#BC796F]/15 flex flex-col items-end gap-1 text-xs">
                <div className="flex items-center gap-6 text-warm-700">
                  <span>סכום ביניים:</span>
                  <span className="font-bold tabular-nums">{formatCurrency(previewData.subtotal)}</span>
                </div>
                <div className="flex items-center gap-6 text-warm-700">
                  <span>מע״מ (עוסק פטור — לא נגבה מע״מ):</span>
                  <span className="font-bold tabular-nums">0.00 ₪</span>
                </div>
                <div className="flex items-center gap-6 text-sm font-black text-[#88463F] pt-1 border-t border-warm-200">
                  <span>סה״כ לתשלום:</span>
                  <span className="text-base tabular-nums">{formatCurrency(previewData.totalAmount)}</span>
                </div>
              </div>
            </div>

            {/* Document Notes & Breakdown Section (especially for Option 2) */}
            <div className="p-4 rounded-2xl bg-white/70 border border-[#BC796F]/20 flex flex-col gap-3">
              <div className="flex items-center justify-between">
                <span className="text-xs font-black text-warm-950">הערות המסמך:</span>
                <span className="text-[11px] text-[#7D5A56]">
                  {layoutMode === 'summary_with_notes' 
                    ? 'כולל את הפירוט המובנה של שעות העבודה' 
                    : 'הערות כלליות למסמך'}
                </span>
              </div>

              {/* Editable manual notes that stay preserved */}
              <div>
                <label className="text-[11px] font-bold text-warm-800 block mb-1">
                  הערות אישיות נוספות (יישמרו בנוסף לפירוט השעות ולא יידרסו):
                </label>
                <textarea
                  rows={2}
                  value={manualNotes}
                  onChange={e => setManualNotes(e.target.value)}
                  placeholder="הזן הערות ידניות, תנאי העברה בנקאית או פרטים נוספים..."
                  className="w-full p-2.5 rounded-xl text-xs bg-white text-warm-900 border border-warm-200 focus:border-[#BC796F] resize-none"
                />
              </div>

              {/* Notes content view with structured breakdown */}
              {layoutMode === 'summary_with_notes' && (
                <div className="p-3.5 rounded-xl bg-warm-50/80 border border-warm-200/70 text-xs font-mono text-warm-900 whitespace-pre-line leading-relaxed max-h-48 overflow-y-auto scrollbar-none">
                  {previewData.notes}
                </div>
              )}
            </div>
          </div>
        )}

        {/* Footer Actions */}
        <div className="flex flex-col sm:flex-row items-center justify-between pt-3.5 border-t border-[#BC796F]/15 shrink-0 text-xs gap-3 mt-3">
          <div className="flex items-center gap-5 w-full sm:w-auto justify-between sm:justify-start">
            <div>
              <span className="text-[#7D5A56] block text-[11px]">שעות שנבחרו לחיוב:</span>
              <strong dir="ltr" className="text-sm font-bold text-warm-950 tabular-nums">
                {formatDurationHHMM(analysis.totalDurationSeconds)} שעות ({analysis.totalHours} שעות)
              </strong>
            </div>

            <div>
              <span className="text-[#7D5A56] block text-[11px]">סכום כולל לתשלום:</span>
              <strong dir="ltr" className="text-base font-black text-[#88463F] tabular-nums">
                {formatCurrency(analysis.combinedTotal)}
              </strong>
            </div>
          </div>

          <div className="flex items-center gap-2.5 w-full sm:w-auto justify-end">
            {activeTab === 'preview' ? (
              <button
                type="button"
                onClick={() => setActiveTab('select')}
                className="flex items-center gap-1.5 px-4 py-2.5 rounded-xl text-xs font-bold text-warm-800 bg-white/80 hover:bg-white border border-warm-200/80 transition-all active:scale-95"
              >
                <ArrowRight className="w-3.5 h-3.5" />
                <span>חזרה לבחירת שעות</span>
              </button>
            ) : (
              <button
                type="button"
                onClick={() => setActiveTab('preview')}
                disabled={selectedEntryIds.size === 0}
                className="flex items-center gap-1.5 px-4 py-2.5 rounded-xl text-xs font-bold text-[#88463F] bg-white/80 hover:bg-white border border-[#BC796F]/30 shadow-xs transition-all active:scale-95 disabled:opacity-40"
              >
                <Eye className="w-3.5 h-3.5 text-[#BC796F]" />
                <span>תצוגה מקדימה</span>
              </button>
            )}

            <button
              type="button"
              onClick={onClose}
              disabled={isSubmitting}
              className="px-4 py-2.5 rounded-xl text-xs font-semibold text-warm-800 hover:text-warm-950 hover:bg-white/60 transition-colors"
            >
              ביטול
            </button>

            <button
              type="button"
              onClick={handleCreateDraft}
              disabled={isSubmitting || selectedEntryIds.size === 0}
              className="flex items-center gap-2 px-6 py-2.5 rounded-xl text-xs font-bold text-white liquid-glass-btn-primary shadow-md active:scale-95 transition-all disabled:opacity-50"
            >
              <CheckCircle className="w-4 h-4" />
              <span>{isSubmitting ? 'מייצר טיוטה...' : `יצירת טיוטת חשבון עסקה (${formatCurrency(analysis.combinedTotal)})`}</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
