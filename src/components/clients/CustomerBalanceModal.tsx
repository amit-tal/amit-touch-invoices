import React, { useState } from 'react';
import type { Client, Project, TimeEntry, Settings } from '../../types';
import type { AppDocument } from '../../types/documents';
import { 
  getCustomerFinancialOverview, 
  formatCurrencyAmountGroups 
} from '../../utils/customerBalanceUtils';
import { formatDurationHHMM, formatHoursDecimal } from '../../utils/dateUtils';
import { 
  X, 
  FileText, 
  Receipt, 
  Clock, 
  AlertTriangle, 
  ArrowUpRight, 
  Plus,
  Coins,
  ShieldCheck,
  AlertCircle
} from 'lucide-react';

interface CustomerBalanceModalProps {
  isOpen: boolean;
  onClose: () => void;
  client: Client;
  clients: Client[];
  projects: Project[];
  entries: TimeEntry[];
  documents: AppDocument[];
  settings: Settings;
  onOpenDocumentDetails?: (doc: AppDocument) => void;
  onOpenTimeBilling?: (clientId: string) => void;
  onOpenNewDocument?: (clientId: string) => void;
}

export const CustomerBalanceModal: React.FC<CustomerBalanceModalProps> = ({
  isOpen,
  onClose,
  client,
  clients,
  projects,
  entries,
  documents,
  settings,
  onOpenDocumentDetails,
  onOpenTimeBilling,
  onOpenNewDocument,
}) => {
  const [activeTab, setActiveTab] = useState<'open_requests' | 'unbilled_time' | 'receipts'>('open_requests');

  if (!isOpen) return null;

  const overview = getCustomerFinancialOverview(
    client.id,
    clients,
    projects,
    entries,
    documents,
    settings
  );

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-5">
      <div onClick={onClose} className="fixed inset-0 bg-warm-950/40 backdrop-blur-md" />
      
      <div 
        role="dialog"
        aria-modal="true"
        dir="rtl"
        className="relative w-full max-w-3xl liquid-glass rounded-3xl shadow-2xl p-6 sm:p-8 z-10 border border-white/90 max-h-[92vh] overflow-y-auto"
      >
        {/* Header */}
        <div className="flex items-start justify-between pb-4 border-b border-[#BC796F]/15 mb-6">
          <div>
            <div className="flex items-center gap-2.5">
              <span 
                className="w-3.5 h-3.5 rounded-full shrink-0" 
                style={{ backgroundColor: client.color || '#BC796F' }}
              />
              <h2 className="text-xl sm:text-2xl font-bold text-warm-950 tracking-tight">
                סקירת יתרה פיננסית: {client.name}
              </h2>
            </div>
            
            <div className="flex flex-wrap items-center gap-3 mt-1.5 text-xs text-[#7D5A56] font-medium">
              {client.businessNumber && (
                <span>ע.מ / ח.פ: <bdi dir="ltr" className="text-warm-950 font-bold">{client.businessNumber}</bdi></span>
              )}
              <span>•</span>
              <span className="text-[#88463F] font-semibold">עוסק פטור — עסקאות אינן מחויבות במע״מ</span>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-1.5 rounded-xl text-warm-700 hover:text-warm-950 hover:bg-white/50 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Financial KPI Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3.5 mb-6">
          {/* 1. Open Payment Requests */}
          <div className="p-4 rounded-2xl bg-white/70 border border-white/90 shadow-xs flex flex-col justify-between backdrop-blur-md">
            <div className="flex items-center justify-between text-[#7D5A56] text-xs font-semibold mb-2">
              <span>פתוח לתשלום (חשבונות עסקה)</span>
              <FileText className="w-4 h-4 text-[#BC796F]" />
            </div>
            <div className="text-2xl font-black text-warm-950 tabular-nums">
              {formatCurrencyAmountGroups(overview.openPaymentRequestsAmounts, settings.currency)}
            </div>
            <div className="text-[11px] text-[#8C6D68] mt-1 font-medium">
              {overview.openPaymentRequestsCount} חשבונות עסקה פתוחים
            </div>
          </div>

          {/* 2. Overdue Balance */}
          <div className={`p-4 rounded-2xl border shadow-xs flex flex-col justify-between backdrop-blur-md ${
            overview.overduePaymentRequestsCount > 0 
              ? 'bg-red-50/70 border-red-200/80 text-red-950'
              : 'bg-white/70 border-white/90 text-warm-950'
          }`}>
            <div className="flex items-center justify-between text-xs font-semibold mb-2">
              <span className={overview.overduePaymentRequestsCount > 0 ? 'text-red-700 font-bold' : 'text-[#7D5A56]'}>
                יתרה באיחור (מעבר למועד פירעון)
              </span>
              <AlertTriangle className={`w-4 h-4 ${overview.overduePaymentRequestsCount > 0 ? 'text-red-600' : 'text-[#BC796F]'}`} />
            </div>
            <div className={`text-2xl font-black tabular-nums ${overview.overduePaymentRequestsCount > 0 ? 'text-red-700' : 'text-warm-950'}`}>
              {formatCurrencyAmountGroups(overview.overdueAmounts, settings.currency)}
            </div>
            <div className="text-[11px] mt-1 font-medium text-[#7D5A56]">
              {overview.overduePaymentRequestsCount > 0 ? `${overview.overduePaymentRequestsCount} מסמכים עברו את מועד הפירעון` : 'אין מסמכים באיחור'}
            </div>
          </div>

          {/* 3. Unbilled Hours & Estimated Value */}
          <div className="p-4 rounded-2xl bg-white/70 border border-white/90 shadow-xs flex flex-col justify-between backdrop-blur-md">
            <div className="flex items-center justify-between text-[#7D5A56] text-xs font-semibold mb-2">
              <span>שעות עבודה שלא חויבו</span>
              <Clock className="w-4 h-4 text-[#BC796F]" />
            </div>
            <div className="text-2xl font-black text-[#88463F] tabular-nums">
              {overview.unbilledHoursDecimal} <span className="text-sm font-semibold">שעות</span>
            </div>
            <div className="text-[11px] text-[#7D5A56] mt-1 flex flex-wrap items-center gap-1">
              <span>שווי משוער:</span>
              <strong className="text-warm-950">{formatCurrencyAmountGroups(overview.unbilledEstimatedAmounts, settings.currency)}</strong>
            </div>
          </div>

          {/* 4. Total Payments Received */}
          <div className="p-4 rounded-2xl bg-white/70 border border-white/90 shadow-xs flex flex-col justify-between backdrop-blur-md">
            <div className="flex items-center justify-between text-[#7D5A56] text-xs font-semibold mb-2">
              <span>תקבולים ששולמו בפועל</span>
              <Receipt className="w-4 h-4 text-[#BC796F]" />
            </div>
            <div className="text-2xl font-black text-warm-950 tabular-nums">
              {formatCurrencyAmountGroups(overview.paymentsReceivedAmounts, settings.currency)}
            </div>
            <div className="text-[11px] text-[#8C6D68] mt-1 font-medium">
              {overview.paymentsReceivedCount} קבלות שהופקו
            </div>
          </div>

          {/* 5. Unallocated Credit */}
          <div className="p-4 rounded-2xl bg-white/70 border border-white/90 shadow-xs flex flex-col justify-between backdrop-blur-md">
            <div className="flex items-center justify-between text-[#7D5A56] text-xs font-semibold mb-2">
              <span>יתרת זכות (תשלומים שלא שויכו)</span>
              <Coins className="w-4 h-4 text-[#BC796F]" />
            </div>
            <div className="text-2xl font-black text-warm-950 tabular-nums">
              {formatCurrencyAmountGroups(overview.unallocatedCreditAmounts, settings.currency)}
            </div>
            <div className="text-[11px] text-[#8C6D68] mt-1 font-medium">
              עודף תשלומים שטרם קוזז כנגד חשבונות
            </div>
          </div>

          {/* 6. Drafts Notice */}
          <div className="p-4 rounded-2xl bg-white/70 border border-white/90 shadow-xs flex flex-col justify-between backdrop-blur-md">
            <div className="flex items-center justify-between text-[#7D5A56] text-xs font-semibold mb-2">
              <span>טיוטות מסמכים פעילות</span>
              <ShieldCheck className="w-4 h-4 text-[#BC796F]" />
            </div>
            <div className="text-2xl font-black text-warm-950 tabular-nums">
              {overview.draftDocumentsCount}
            </div>
            <div className="text-[11px] text-[#7D5A56] mt-1">
              מופרדות לחלוטין מיתרות החוב הרשמיות
            </div>
          </div>
        </div>

        {/* Warning if missing hourly rates exist */}
        {overview.hasMissingHourlyRates && (
          <div className="p-3.5 rounded-2xl bg-amber-500/10 border border-amber-500/25 text-amber-900 text-xs mb-6 flex items-center gap-2.5">
            <AlertCircle className="w-4 h-4 text-amber-700 shrink-0" />
            <div>
              <strong>לתשומת לבך:</strong> קיימות {overview.unbilledHoursWithoutRate} שעות עבודה ללא תעריף שעתי מוגדר בפרויקט או בהגדרות ברירת המחדל.
            </div>
          </div>
        )}

        {/* Tab Selection */}
        <div className="flex rounded-xl p-1 bg-white/50 border border-white/70 text-xs font-semibold mb-4 w-fit">
          <button
            onClick={() => setActiveTab('open_requests')}
            className={`px-3 py-1.5 rounded-lg transition-all ${
              activeTab === 'open_requests' ? 'bg-[#BC796F] text-white shadow-xs' : 'text-warm-800 hover:text-warm-950'
            }`}
          >
            חשבונות עסקה פתוחים ({overview.openPaymentRequestsCount})
          </button>
          <button
            onClick={() => setActiveTab('unbilled_time')}
            className={`px-3 py-1.5 rounded-lg transition-all ${
              activeTab === 'unbilled_time' ? 'bg-[#BC796F] text-white shadow-xs' : 'text-warm-800 hover:text-warm-950'
            }`}
          >
            שעות שלא חויבו ({overview.unbilledEntryCount})
          </button>
          <button
            onClick={() => setActiveTab('receipts')}
            className={`px-3 py-1.5 rounded-lg transition-all ${
              activeTab === 'receipts' ? 'bg-[#BC796F] text-white shadow-xs' : 'text-warm-800 hover:text-warm-950'
            }`}
          >
            תקבולים וקבלות ({overview.paymentsReceivedCount})
          </button>
        </div>

        {/* Tab Content */}
        <div className="bg-white/40 rounded-2xl border border-white/60 p-4 max-h-64 overflow-y-auto mb-6">
          {activeTab === 'open_requests' && (
            overview.openPaymentRequests.length === 0 ? (
              <div className="text-center py-6 text-xs text-[#7D5A56]">
                אין חשבונות עסקה פתוחים לתשלום עבור לקוח זה.
              </div>
            ) : (
              <div className="space-y-2.5">
                {overview.openPaymentRequests.map(doc => {
                  const isOverdue = doc.dueDate && doc.dueDate < new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Jerusalem' }).format(new Date());
                  return (
                    <div 
                      key={doc.id}
                      className="p-3 rounded-xl bg-white/80 border border-white flex items-center justify-between gap-3 text-xs"
                    >
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="font-bold text-warm-950">חשבון עסקה מס׳ {doc.documentNumber}</span>
                          {isOverdue && (
                            <span className="px-2 py-0.5 rounded-md text-[10px] font-bold bg-red-100 text-red-700 border border-red-200">
                              באיחור
                            </span>
                          )}
                        </div>
                        <div className="text-[11px] text-[#7D5A56] mt-0.5">
                          תאריך: {doc.date} | מועד פירעון: {doc.dueDate || 'שוטף'}
                        </div>
                      </div>

                      <div className="flex items-center gap-3">
                        <div className="text-left font-bold text-warm-950 tabular-nums">
                          יתרה לתשלום: {doc.remainingBalance !== undefined ? doc.remainingBalance : doc.totalAmount} {doc.currency || '₪'}
                        </div>
                        {onOpenDocumentDetails && (
                          <button
                            type="button"
                            onClick={() => {
                              onClose();
                              onOpenDocumentDetails(doc);
                            }}
                            className="p-1.5 rounded-lg text-[#BC796F] hover:bg-[#BC796F]/10 transition-colors"
                            title="צפייה במסמך"
                          >
                            <ArrowUpRight className="w-4 h-4" />
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )
          )}

          {activeTab === 'unbilled_time' && (
            overview.unbilledEntries.length === 0 ? (
              <div className="text-center py-6 text-xs text-[#7D5A56]">
                כל שעות העבודה שנרשמו עבור לקוח זה כבר חויבו במסמכים.
              </div>
            ) : (
              <div className="space-y-2.5">
                {overview.unbilledEntries.map(e => {
                  const proj = projects.find(p => p.id === e.projectId);
                  return (
                    <div 
                      key={e.id}
                      className="p-3 rounded-xl bg-white/80 border border-white flex items-center justify-between gap-3 text-xs"
                    >
                      <div>
                        <div className="font-bold text-warm-950">{e.task || 'עבודה שוטפת'}</div>
                        <div className="text-[11px] text-[#7D5A56] mt-0.5">
                          פרויקט: {proj?.name || 'כללי'} | תאריך: {e.date}
                        </div>
                      </div>

                      <div className="flex items-center gap-3">
                        <div className="text-left font-bold text-warm-950 tabular-nums font-heebo" dir="ltr">
                          {formatDurationHHMM(e.durationSeconds)} ({formatHoursDecimal(e.durationSeconds)} שע׳)
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )
          )}

          {activeTab === 'receipts' && (
            overview.receipts.length === 0 ? (
              <div className="text-center py-6 text-xs text-[#7D5A56]">
                לא קיימות קבלות תשלום שהופקו עבור לקוח זה.
              </div>
            ) : (
              <div className="space-y-2.5">
                {overview.receipts.map(doc => (
                  <div 
                    key={doc.id}
                    className="p-3 rounded-xl bg-white/80 border border-white flex items-center justify-between gap-3 text-xs"
                  >
                    <div>
                      <div className="font-bold text-warm-950">קבלה מס׳ {doc.documentNumber}</div>
                      <div className="text-[11px] text-[#7D5A56] mt-0.5">
                        תאריך: {doc.date} | סכום: {doc.totalAmount} {doc.currency || '₪'}
                      </div>
                    </div>

                    {onOpenDocumentDetails && (
                      <button
                        type="button"
                        onClick={() => {
                          onClose();
                          onOpenDocumentDetails(doc);
                        }}
                        className="p-1.5 rounded-lg text-[#BC796F] hover:bg-[#BC796F]/10 transition-colors"
                        title="צפייה במסמך"
                      >
                        <ArrowUpRight className="w-4 h-4" />
                      </button>
                    )}
                  </div>
                ))}
              </div>
            )
          )}
        </div>

        {/* Footer Actions */}
        <div className="flex flex-wrap items-center justify-between gap-3 pt-3 border-t border-[#BC796F]/15">
          <div className="flex items-center gap-2">
            {overview.unbilledHoursDecimal > 0 && onOpenTimeBilling && (
              <button
                type="button"
                onClick={() => {
                  onClose();
                  onOpenTimeBilling(client.id);
                }}
                className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-bold text-white bg-[#BC796F] hover:bg-[#A46A69] transition-all shadow-xs active:scale-98"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>חיוב שעות אלו במסמך</span>
              </button>
            )}

            {onOpenNewDocument && (
              <button
                type="button"
                onClick={() => {
                  onClose();
                  onOpenNewDocument(client.id);
                }}
                className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-bold text-[#88463F] bg-white border border-[#BC796F]/30 hover:bg-[#BC796F]/10 transition-all shadow-xs active:scale-98"
              >
                <FileText className="w-3.5 h-3.5" />
                <span>מסמך חדש ללקוח</span>
              </button>
            )}
          </div>

          <button
            type="button"
            onClick={onClose}
            className="px-5 py-2 rounded-xl text-xs font-bold text-warm-800 hover:bg-white/60 transition-all border border-black/5"
          >
            סגירה
          </button>
        </div>
      </div>
    </div>
  );
};
