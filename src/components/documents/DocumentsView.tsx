import React, { useState, useMemo } from 'react';
import { useApp } from '../../context/AppContext';
import { useDocuments } from '../../context/DocumentsContext';
import type { 
  AppDocument, 
  DocumentType 
} from '../../types/documents';
import { CustomSelect } from '../CustomSelect';
import { DocumentEditorModal } from './DocumentEditorModal';
import { RecordPaymentModal } from './RecordPaymentModal';
import { DocumentDetailsModal } from './DocumentDetailsModal';
import { TimeBillingModal } from './TimeBillingModal';
import { SequenceConfirmationModal } from './SequenceConfirmationModal';
import { 
  formatCurrency, 
  getStatusBadgeInfo,
  getDeliveryStatusBadge 
} from '../../utils/moneyUtils';
import { 
  FileText, 
  Clock, 
  Plus, 
  Search, 
  Download, 
  Settings2, 
  Eye, 
  CreditCard, 
  Edit3, 
  ChevronDown, 
  Sparkles, 
  ShieldCheck,
  BellRing
} from 'lucide-react';
import { PaymentReminderModal } from './PaymentReminderModal';

export const DocumentsView: React.FC = () => {
  const { clients, showToast } = useApp();
  const { 
    documents, 
    sequences, 
    isTestMode, 
    setIsTestMode, 
    downloadBackup,
    convertQuoteToPaymentRequest,
    refreshDocuments
  } = useDocuments();

  const [isGeneratingTestReceipt, setIsGeneratingTestReceipt] = useState(false);

  const handleGenerateTestReceipt = async () => {
    setIsGeneratingTestReceipt(true);
    try {
      const res = await fetch('/api/documents/generate-test-receipt', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      });
      const data = await res.json();
      if (!res.ok) {
        showToast(data.error || 'שגיאה בהפקת קבלת בדיקה');
        return;
      }
      await refreshDocuments();
      showToast(`הופקה בהצלחה קבלת בדיקה חתומה דיגיטלית: ${data.document.documentNumber}`);
      if (data.document) {
        setSelectedDocForDetails(data.document);
        setIsDetailsModalOpen(true);
      }
    } catch (err: any) {
      showToast(err.message || 'שגיאה בהפקת קבלת בדיקה');
    } finally {
      setIsGeneratingTestReceipt(false);
    }
  };

  // Active Sub-tab: 'all' | 'payment_requests' | 'receipts' | 'quotes' | 'drafts' | 'overdue'
  const [activeTab, setActiveTab] = useState<'all' | 'payment_requests' | 'receipts' | 'quotes' | 'drafts' | 'overdue'>('all');

  // Filters
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [clientFilter, setClientFilter] = useState<string>('all');

  // Modals state
  const [isEditorOpen, setIsEditorOpen] = useState(false);
  const [editorDocToEdit, setEditorDocToEdit] = useState<AppDocument | null>(null);
  const [editorInitialType, setEditorInitialType] = useState<DocumentType>('payment_request');

  const [isPaymentModalOpen, setIsPaymentModalOpen] = useState(false);
  const [paymentTargetRequest, setPaymentTargetRequest] = useState<AppDocument | null>(null);

  const [isDetailsModalOpen, setIsDetailsModalOpen] = useState(false);
  const [selectedDocForDetails, setSelectedDocForDetails] = useState<AppDocument | null>(null);

  const [isReminderModalOpen, setIsReminderModalOpen] = useState(false);
  const [reminderTargetDoc, setReminderTargetDoc] = useState<AppDocument | null>(null);

  const [isTimeBillingOpen, setIsTimeBillingOpen] = useState(false);
  const [isSequenceModalOpen, setIsSequenceModalOpen] = useState(false);
  const [isNewDocMenuOpen, setIsNewDocMenuOpen] = useState(false);

  // Today in Israel for overdue checks
  const todayInIsrael = useMemo(() => {
    return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Jerusalem' }).format(new Date());
  }, []);

  const isDocOverdue = (doc: AppDocument) => {
    if (doc.type !== 'payment_request') return false;
    if (doc.status !== 'issued' && doc.status !== 'partially_paid') return false;
    if (!doc.dueDate) return false;
    const balance = doc.remainingBalance !== undefined ? doc.remainingBalance : doc.totalAmount;
    return doc.dueDate < todayInIsrael && balance > 0;
  };

  // Filter documents
  const filteredDocuments = useMemo(() => {
    return documents.filter(doc => {
      // Tab filter
      if (activeTab === 'payment_requests' && doc.type !== 'payment_request') return false;
      if (activeTab === 'receipts' && doc.type !== 'receipt') return false;
      if (activeTab === 'quotes' && doc.type !== 'quote') return false;
      if (activeTab === 'drafts' && doc.status !== 'draft') return false;
      if (activeTab === 'overdue' && !isDocOverdue(doc)) return false;

      // Status filter:
      // Exclude canceled documents from default list ('all'); keep them accessible through status filter
      if (statusFilter === 'all') {
        if (doc.status === 'canceled') return false;
      } else if (statusFilter === 'canceled') {
        if (doc.status !== 'canceled') return false;
      } else if (statusFilter === 'overdue') {
        if (!isDocOverdue(doc)) return false;
      } else if (doc.status !== statusFilter) {
        return false;
      }

      // Client filter
      if (clientFilter !== 'all' && doc.clientId !== clientFilter) return false;

      // Search term
      if (searchTerm.trim()) {
        const query = searchTerm.toLowerCase();
        const numMatch = (doc.documentNumber || '').toLowerCase().includes(query);
        const clientMatch = doc.clientName.toLowerCase().includes(query);
        const descMatch = doc.lineItems.some(i => i.description.toLowerCase().includes(query));
        const refMatch = (doc.customerRef || '').toLowerCase().includes(query);
        if (!numMatch && !clientMatch && !descMatch && !refMatch) return false;
      }

      return true;
    });
  }, [documents, activeTab, statusFilter, clientFilter, searchTerm, todayInIsrael]);

  // Handle open details
  const handleOpenDetails = (doc: AppDocument) => {
    setSelectedDocForDetails(doc);
    setIsDetailsModalOpen(true);
  };

  // Handle open editor for new doc
  const handleOpenNewDoc = (type: DocumentType) => {
    setEditorDocToEdit(null);
    setEditorInitialType(type);
    setIsNewDocMenuOpen(false);
    setIsEditorOpen(true);
  };

  // Handle edit draft
  const handleEditDraft = (doc: AppDocument) => {
    setEditorDocToEdit(doc);
    setEditorInitialType(doc.type);
    setIsEditorOpen(true);
  };

  // Handle record payment for document
  const handleRecordPayment = (doc: AppDocument) => {
    setIsDetailsModalOpen(false);
    setSelectedDocForDetails(null);
    setPaymentTargetRequest(doc);
    setIsPaymentModalOpen(true);
  };

  // Handle convert quote to payment request
  const handleConvertQuote = async (quote: AppDocument) => {
    try {
      const draftReq = await convertQuoteToPaymentRequest(quote.id);
      showToast('הצעת המחיר הומרה בהצלחה לטיוטת חשבון עסקה');
      setEditorDocToEdit(draftReq);
      setEditorInitialType('payment_request');
      setIsEditorOpen(true);
    } catch (err: any) {
      showToast(err?.message || 'שגיאה בהמרת הצעת המחיר');
    }
  };

  return (
    <div className="flex flex-col font-heebo animate-fade-in">
      {/* Normal Documents Page Content - Visible on Screen, Excluded from Print */}
      <div className="documents-page-content print-hide print:hidden flex flex-col gap-6 lg:gap-7 pb-12">
        {/* Header & Subtitle */}
      <header className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-1">
        <div>
          <h1 className="text-3xl sm:text-[38px] lg:text-[40px] font-bold text-warm-950 tracking-tight leading-tight">
            מסמכים
          </h1>
          <p className="text-sm sm:text-[15px] text-[#7D5A56] font-normal mt-1">
            חשבונות עסקה / דרישות תשלום, קבלות והצעות מחיר בסטנדרט AMIT TOUCH
          </p>
        </div>

        {/* Action Controls */}
        <div className="flex flex-wrap items-center gap-2.5">
          {/* Test / Production Mode Switcher */}
          <div className="flex items-center p-1 rounded-2xl bg-white/50 border border-white/70 shadow-sm">
            <button
              type="button"
              onClick={() => setIsTestMode(false)}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold transition-all ${
                !isTestMode
                  ? 'bg-[#BC796F] text-white shadow-sm'
                  : 'text-warm-700 hover:text-warm-900'
              }`}
            >
              <ShieldCheck className="w-3.5 h-3.5" />
              <span>הפקה רשמית</span>
            </button>

            <button
              type="button"
              onClick={() => setIsTestMode(true)}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold transition-all ${
                isTestMode
                  ? 'bg-amber-600 text-white shadow-sm'
                  : 'text-warm-700 hover:text-warm-900'
              }`}
            >
              <Sparkles className="w-3.5 h-3.5" />
              <span>מצב בדיקה</span>
            </button>
          </div>

          {/* Sequence Confirmation Trigger */}
          <button
            type="button"
            onClick={() => setIsSequenceModalOpen(true)}
            className="flex items-center gap-1.5 px-3 py-2 rounded-2xl text-xs font-semibold text-warm-800 bg-white/60 hover:bg-white border border-white/80 transition-all shadow-sm"
            title="הגדרת רצף ומספור רשמי"
          >
            <Settings2 className="w-3.5 h-3.5 text-[#BC796F]" />
            <span>מספור: {sequences.isProductionActive ? 'רשמי פעיל' : 'טרם אומת'}</span>
          </button>

          {/* Data Backup Button */}
          <button
            type="button"
            onClick={downloadBackup}
            className="p-2 rounded-2xl text-warm-700 bg-white/60 hover:bg-white border border-white/80 transition-all shadow-sm"
            title="הורדת גיבוי JSON של כל המסמכים"
          >
            <Download className="w-4 h-4" />
          </button>

          {/* Time Billing Button */}
          <button
            type="button"
            onClick={() => setIsTimeBillingOpen(true)}
            className="flex items-center gap-1.5 px-3.5 py-2.5 rounded-2xl text-xs font-bold text-[#88463F] bg-white/80 hover:bg-white border border-[#BC796F]/30 shadow-sm transition-all active:scale-95"
          >
            <Clock className="w-4 h-4 text-[#BC796F]" />
            <span>חיוב משעות עבודה</span>
          </button>

          {/* New Document Button with Dropdown */}
          <div className="relative">
            <button
              type="button"
              onClick={() => setIsNewDocMenuOpen(prev => !prev)}
              className="flex items-center gap-2 px-4 py-2.5 rounded-2xl text-xs font-bold text-white liquid-glass-btn-primary shadow-md active:scale-95 transition-all"
            >
              <Plus className="w-4 h-4" />
              <span>מסמך חדש</span>
              <ChevronDown className="w-3.5 h-3.5" />
            </button>

            {isNewDocMenuOpen && (
              <div 
                className="absolute left-0 mt-2 w-56 rounded-2xl liquid-glass shadow-2xl border border-white/80 py-2 z-30 animate-fade-in flex flex-col"
                onClick={e => e.stopPropagation()}
              >
                <button
                  type="button"
                  onClick={() => handleOpenNewDoc('payment_request')}
                  className="px-4 py-2 text-right text-xs font-bold text-warm-900 hover:bg-white/60 flex items-center justify-between transition-colors"
                >
                  <span>חשבון עסקה / דרישת תשלום</span>
                  <span className="text-[10px] text-warm-500 font-normal">Next: {sequences.paymentRequestNext}</span>
                </button>

                <button
                  type="button"
                  onClick={() => handleOpenNewDoc('receipt')}
                  className="px-4 py-2 text-right text-xs font-bold text-warm-900 hover:bg-white/60 flex items-center justify-between transition-colors"
                >
                  <span>קבלה על תשלום</span>
                  <span className="text-[10px] text-warm-500 font-normal">Next: {sequences.receiptNext}</span>
                </button>

                <button
                  type="button"
                  onClick={() => handleOpenNewDoc('quote')}
                  className="px-4 py-2 text-right text-xs font-bold text-warm-900 hover:bg-white/60 flex items-center justify-between transition-colors"
                >
                  <span>הצעת מחיר</span>
                  <span className="text-[10px] text-warm-500 font-normal">Next: {sequences.quoteNext || 'לא הוגדר'}</span>
                </button>
              </div>
            )}
          </div>
        </div>

        {/* Test Mode Banner with Quick Test Receipt Generator & Download */}
        {isTestMode && (
          <div className="p-4 rounded-2xl bg-gradient-to-r from-amber-500/10 via-amber-500/5 to-transparent border border-amber-300/60 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 shadow-xs">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-xl bg-amber-500/15 border border-amber-400/40 flex items-center justify-center shrink-0">
                <Sparkles className="w-5 h-5 text-amber-700" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <span className="font-bold text-amber-950 text-xs">מצב בדיקה פעיל — חתימה אלקטרונית מאובטחת מקומית</span>
                  <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-200 text-amber-900 border border-amber-300">
                    TEST-MODE
                  </span>
                </div>
                <div className="text-[11px] text-amber-800/90 mt-0.5">
                  המסמכים נושאים מספר בדיקה ייעודי (TEST-xxxx) ונחתמים במפתח המקומי המאובטח. רצף המסמכים הרשמי מוגן לחלוטין.
                </div>
              </div>
            </div>

            <div className="flex items-center gap-2 shrink-0">
              <button
                type="button"
                onClick={handleGenerateTestReceipt}
                disabled={isGeneratingTestReceipt}
                className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-bold text-white bg-amber-700 hover:bg-amber-800 shadow-sm transition-all disabled:opacity-50"
              >
                <ShieldCheck className="w-3.5 h-3.5" />
                <span>{isGeneratingTestReceipt ? 'מפיק קבלת בדיקה...' : 'הפקת קבלה חתומה לבדיקה'}</span>
              </button>

              <a
                href="/api/documents/test-signed-pdf"
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-bold text-amber-900 bg-amber-100 hover:bg-amber-200 border border-amber-300 shadow-xs transition-all"
                title="הורדת קובץ בדיקה חתום דיגיטלית ישירות"
              >
                <Download className="w-3.5 h-3.5" />
                <span>הורדת קובץ בדיקה חתום</span>
              </a>
            </div>
          </div>
        )}
      </header>

      {/* Main Table Panel */}
      <section className="liquid-glass rounded-3xl p-5 sm:p-6 border border-white/60 shadow-lg flex flex-col gap-5">
        {/* Sub-tabs and Search / Filters Bar */}
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 pb-4 border-b border-[#BC796F]/15">
          {/* Sub-Tabs: הכל, חשבונות עסקה, קבלות, הצעות מחיר, טיוטות */}
          <div className="flex items-center gap-1.5 p-1 rounded-2xl bg-white/50 border border-white/70 overflow-x-auto scrollbar-none">
            <button
              type="button"
              onClick={() => setActiveTab('all')}
              className={`px-3.5 py-1.5 rounded-xl text-xs font-bold transition-all whitespace-nowrap ${
                activeTab === 'all'
                  ? 'bg-[#BC796F] text-white shadow-sm'
                  : 'text-warm-700 hover:text-warm-950'
              }`}
            >
              הכל ({documents.filter(d => d.status !== 'canceled').length})
            </button>

            <button
              type="button"
              onClick={() => setActiveTab('payment_requests')}
              className={`px-3.5 py-1.5 rounded-xl text-xs font-bold transition-all whitespace-nowrap ${
                activeTab === 'payment_requests'
                  ? 'bg-[#BC796F] text-white shadow-sm'
                  : 'text-warm-700 hover:text-warm-950'
              }`}
            >
              חשבונות עסקה ({documents.filter(d => d.type === 'payment_request' && d.status !== 'canceled').length})
            </button>

            <button
              type="button"
              onClick={() => setActiveTab('receipts')}
              className={`px-3.5 py-1.5 rounded-xl text-xs font-bold transition-all whitespace-nowrap ${
                activeTab === 'receipts'
                  ? 'bg-[#BC796F] text-white shadow-sm'
                  : 'text-warm-700 hover:text-warm-950'
              }`}
            >
              קבלות ({documents.filter(d => d.type === 'receipt' && d.status !== 'canceled').length})
            </button>

            <button
              type="button"
              onClick={() => setActiveTab('quotes')}
              className={`px-3.5 py-1.5 rounded-xl text-xs font-bold transition-all whitespace-nowrap ${
                activeTab === 'quotes'
                  ? 'bg-[#BC796F] text-white shadow-sm'
                  : 'text-warm-700 hover:text-warm-950'
              }`}
            >
              הצעות מחיר ({documents.filter(d => d.type === 'quote' && d.status !== 'canceled').length})
            </button>

            <button
              type="button"
              onClick={() => setActiveTab('drafts')}
              className={`px-3.5 py-1.5 rounded-xl text-xs font-bold transition-all whitespace-nowrap ${
                activeTab === 'drafts'
                  ? 'bg-[#BC796F] text-white shadow-sm'
                  : 'text-warm-700 hover:text-warm-950'
              }`}
            >
              טיוטות ({documents.filter(d => d.status === 'draft').length})
            </button>

            <button
              type="button"
              onClick={() => setActiveTab('overdue')}
              className={`px-3.5 py-1.5 rounded-xl text-xs font-bold transition-all whitespace-nowrap flex items-center gap-1.5 ${
                activeTab === 'overdue'
                  ? 'bg-rose-700 text-white shadow-sm'
                  : 'text-rose-700 hover:text-rose-900 bg-rose-50/60'
              }`}
            >
              <Clock className="w-3.5 h-3.5" />
              <span>באיחור ({documents.filter(isDocOverdue).length})</span>
            </button>
          </div>

          {/* Filters: Search & Dropdowns */}
          <div className="flex flex-wrap items-center gap-2.5">
            {/* Search Input */}
            <div className="relative min-w-[200px]">
              <input
                type="text"
                value={searchTerm}
                onChange={e => setSearchTerm(e.target.value)}
                placeholder="חיפוש לפי מספר, לקוח..."
                className="w-full h-9 pr-8 pl-3 rounded-xl text-xs font-medium text-warm-900 bg-white/70 border border-white/80 focus:bg-white"
              />
              <Search className="w-3.5 h-3.5 text-warm-500 absolute right-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
            </div>

            {/* Client Filter */}
            <div className="w-36">
              <CustomSelect
                value={clientFilter}
                onChange={setClientFilter}
                options={[
                  { value: 'all', label: 'כל הלקוחות' },
                  ...clients.map(c => ({ value: c.id, label: c.name }))
                ]}
                triggerClassName="h-9 text-xs"
              />
            </div>

            {/* Status Filter */}
            <div className="w-44">
              <CustomSelect
                value={statusFilter}
                onChange={setStatusFilter}
                options={[
                  { value: 'all', label: 'כל המסמכים (ללא מבוטלים)' },
                  { value: 'overdue', label: `באיחור (${documents.filter(isDocOverdue).length})` },
                  { value: 'draft', label: 'טיוטות' },
                  { value: 'issued', label: 'הופק' },
                  { value: 'partially_paid', label: 'שולם חלקית' },
                  { value: 'paid', label: 'שולם' },
                  { value: 'canceled', label: `מבוטלים (${documents.filter(d => d.status === 'canceled').length})` },
                ]}
                triggerClassName="h-9 text-xs"
              />
            </div>
          </div>
        </div>

        {/* Test Mode Banner with Quick Test Receipt Generator & Download */}
        {isTestMode && (
          <div className="p-4 rounded-2xl bg-gradient-to-r from-amber-500/10 via-amber-500/5 to-transparent border border-amber-300/60 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 shadow-xs">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-xl bg-amber-500/15 border border-amber-400/40 flex items-center justify-center shrink-0">
                <Sparkles className="w-5 h-5 text-amber-700" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <span className="font-bold text-amber-950 text-xs">מצב בדיקה פעיל — חתימה אלקטרונית מאובטחת מקומית</span>
                  <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-200 text-amber-900 border border-amber-300">
                    TEST-MODE
                  </span>
                </div>
                <div className="text-[11px] text-amber-800/90 mt-0.5">
                  המסמכים נושאים מספר בדיקה ייעודי (TEST-xxxx) ונחתמים במפתח המקומי המאובטח. רצף המסמכים הרשמי מוגן לחלוטין.
                </div>
              </div>
            </div>

            <div className="flex items-center gap-2 shrink-0">
              <button
                type="button"
                onClick={handleGenerateTestReceipt}
                disabled={isGeneratingTestReceipt}
                className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-bold text-white bg-amber-700 hover:bg-amber-800 shadow-sm transition-all disabled:opacity-50"
              >
                <ShieldCheck className="w-3.5 h-3.5" />
                <span>{isGeneratingTestReceipt ? 'מפיק קבלת בדיקה...' : 'הפקת קבלה חתומה לבדיקה'}</span>
              </button>

              <a
                href="/api/documents/test-signed-pdf"
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-bold text-amber-900 bg-amber-100 hover:bg-amber-200 border border-amber-300 shadow-xs transition-all"
                title="הורדת קובץ בדיקה חתום דיגיטלית ישירות"
              >
                <Download className="w-3.5 h-3.5" />
                <span>הורדת קובץ בדיקה חתום</span>
              </a>
            </div>
          </div>
        )}

        {/* Table Content */}
        {filteredDocuments.length === 0 ? (
          <div className="py-16 sm:py-20 flex flex-col items-center justify-center text-center gap-3.5 liquid-glass rounded-3xl p-8 border border-white/70">
            <div className="w-16 h-16 rounded-3xl bg-gradient-to-tr from-[#BC796F]/15 via-white/80 to-[#E4AEA3]/20 border border-[#BC796F]/30 flex items-center justify-center text-[#BC796F] shadow-sm">
              <FileText className="w-8 h-8" />
            </div>
            <div>
              <h3 className="text-lg font-bold text-warm-950">
                {documents.length === 0
                  ? 'טרם נוצרו מסמכים במערכת'
                  : activeTab === 'drafts'
                  ? 'אין טיוטות שמורות'
                  : statusFilter === 'canceled'
                  ? 'אין מסמכים מבוטלים'
                  : 'אין מסמכים להצגה'}
              </h3>
              <p className="text-xs sm:text-sm text-[#7D5A56] mt-1.5 max-w-md mx-auto">
                {documents.length === 0
                  ? 'כל חשבונות העסקה, הקבלות והצעות המחיר שתפיק יישמרו כאן באופן מאובטח ומסודר.'
                  : activeTab === 'drafts'
                  ? 'טיוטות שתיצור ותשמור בעורך המסמכים יופיעו כאן להמשך עריכה והפקה.'
                  : 'לא נמצאו מסמכים התואמים את תנאי הסינון הנוכחיים.'}
              </p>
            </div>
            <div className="flex flex-wrap items-center justify-center gap-2.5 mt-2">
              <button
                type="button"
                onClick={() => handleOpenNewDoc('payment_request')}
                className="flex items-center gap-2 px-5 py-2.5 rounded-xl text-xs font-bold text-white liquid-glass-btn-primary shadow-sm transition-all"
              >
                <Plus className="w-4 h-4" />
                <span>מסמך חדש</span>
              </button>
              {(statusFilter !== 'all' || clientFilter !== 'all' || searchTerm.trim() || activeTab !== 'all') && documents.length > 0 && (
                <button
                  type="button"
                  onClick={() => {
                    setStatusFilter('all');
                    setClientFilter('all');
                    setSearchTerm('');
                    setActiveTab('all');
                  }}
                  className="px-4 py-2.5 rounded-xl text-xs font-semibold text-warm-800 bg-white/70 hover:bg-white border border-warm-200/80 transition-all"
                >
                  איפוס סינונים
                </button>
              )}
            </div>
          </div>
        ) : (
          <div className="overflow-x-auto rounded-2xl border border-white/60 bg-white/40">
            <table className="w-full text-right text-xs">
              <thead>
                <tr className="bg-white/60 border-b border-[#BC796F]/15 text-warm-900 font-bold">
                  <th className="py-3 px-3.5 w-24">מס׳ מסמך</th>
                  <th className="py-3 px-3.5 w-32">סוג</th>
                  <th className="py-3 px-3.5">שם הלקוח</th>
                  <th className="py-3 px-3.5 w-28">תאריך</th>
                  <th className="py-3 px-3.5 w-28">מועד פירעון / תוקף</th>
                  <th className="py-3 px-3.5 w-32 text-left">סכום</th>
                  <th className="py-3 px-3.5 w-28 text-center">סטטוס</th>
                  <th className="py-3 px-3.5 w-24 text-center">מסירה</th>
                  <th className="py-3 px-3.5 w-32 text-center">פעולות</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/40">
                {filteredDocuments.map(doc => {
                  const statusInfo = getStatusBadgeInfo(doc.status, doc.type);

                  return (
                    <tr 
                      key={doc.id}
                      onClick={() => handleOpenDetails(doc)}
                      className="hover:bg-white/50 transition-colors cursor-pointer group"
                    >
                      {/* Document Number */}
                      <td className="py-3 px-3.5 font-bold text-warm-950 tabular-nums">
                        {doc.documentNumber ? (
                          <span dir="ltr" className="text-[#88463F] group-hover:underline">
                            #{doc.documentNumber}
                          </span>
                        ) : (
                          <span className="text-[11px] font-semibold text-warm-500 bg-white/60 px-2 py-0.5 rounded-md border border-warm-200">
                            טיוטה
                          </span>
                        )}
                      </td>

                      {/* Document Type */}
                      <td className="py-3 px-3.5">
                        <span className="font-semibold text-warm-900">
                          {doc.type === 'payment_request' ? 'חשבון עסקה' :
                           doc.type === 'receipt' ? 'קבלה' : 'הצעת מחיר'}
                        </span>
                      </td>

                      {/* Client Name */}
                      <td className="py-3 px-3.5">
                        <span className="font-bold text-warm-950">{doc.clientName}</span>
                        {doc.projectName && (
                          <span className="block text-[11px] text-warm-500">{doc.projectName}</span>
                        )}
                      </td>

                      {/* Date */}
                      <td className="py-3 px-3.5 text-warm-700 tabular-nums">
                        {doc.date}
                      </td>

                      {/* Due / Expiry Date */}
                      <td className="py-3 px-3.5 text-warm-700 tabular-nums">
                        {doc.dueDate || doc.validUntilDate || '—'}
                      </td>

                      {/* Amount and remaining balance */}
                      <td className="py-3 px-3.5 text-left font-black text-warm-950 tabular-nums">
                        <div>{formatCurrency(doc.totalAmount, doc.currency)}</div>
                        {doc.type === 'payment_request' && doc.status !== 'draft' && doc.status !== 'paid' && doc.status !== 'canceled' && (
                          <div className="text-[11px] font-semibold text-rose-700">
                            יתרה: {formatCurrency(doc.remainingBalance, doc.currency)}
                          </div>
                        )}
                      </td>

                      {/* Status */}
                      <td className="py-3 px-3.5 text-center">
                        <span className={`inline-block px-2.5 py-0.5 rounded-full text-[11px] font-bold ${statusInfo.bgClass} ${statusInfo.textClass}`}>
                          {statusInfo.label}
                        </span>
                      </td>

                      {/* Delivery Status */}
                      <td className="py-3 px-3.5 text-center">
                        {(() => {
                          const deliveryBadge = getDeliveryStatusBadge(doc);
                          return (
                            <span 
                              className={`inline-block px-2 py-0.5 rounded-full text-[10px] font-bold ${deliveryBadge.bgClass} ${deliveryBadge.textClass}`}
                              title={deliveryBadge.tooltip}
                            >
                              {deliveryBadge.shortLabel}
                            </span>
                          );
                        })()}
                      </td>

                      {/* Actions */}
                      <td className="py-3 px-3.5 text-center" onClick={e => e.stopPropagation()}>
                        <div className="flex items-center justify-center gap-1.5">
                          {/* View details */}
                          <button
                            type="button"
                            onClick={() => handleOpenDetails(doc)}
                            className="p-1.5 rounded-lg text-warm-600 hover:text-warm-950 hover:bg-white/70 transition-colors"
                            title="צפייה בפרטי המסמך"
                          >
                            <Eye className="w-4 h-4" />
                          </button>

                          {/* Edit if draft */}
                          {doc.status === 'draft' && (
                            <button
                              type="button"
                              onClick={() => handleEditDraft(doc)}
                              className="p-1.5 rounded-lg text-[#BC796F] hover:bg-white/70 transition-colors"
                              title="עריכת טיוטה"
                            >
                              <Edit3 className="w-4 h-4" />
                            </button>
                          )}

                          {/* Record payment if payment request */}
                          {doc.type === 'payment_request' && 
                           doc.status !== 'draft' && 
                           doc.status !== 'canceled' && 
                           doc.remainingBalance > 0 && (
                            <button
                              type="button"
                              onClick={() => handleRecordPayment(doc)}
                              className="p-1.5 rounded-lg text-emerald-700 hover:bg-emerald-50 transition-colors"
                              title="רישום קבלה לתשלום"
                            >
                              <CreditCard className="w-4 h-4" />
                            </button>
                          )}

                          {/* Send payment reminder if payment request with outstanding balance */}
                          {doc.type === 'payment_request' && 
                           doc.status !== 'draft' && 
                           doc.status !== 'canceled' && 
                           doc.remainingBalance > 0 && (
                            <button
                              type="button"
                              onClick={() => {
                                setReminderTargetDoc(doc);
                                setIsReminderModalOpen(true);
                              }}
                              className={`p-1.5 rounded-lg transition-colors ${
                                isDocOverdue(doc) 
                                  ? 'text-rose-700 hover:bg-rose-50' 
                                  : 'text-amber-700 hover:bg-amber-50'
                              }`}
                              title="שליחת תזכורת תשלום באישור"
                            >
                              <BellRing className="w-4 h-4" />
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>
      </div>

      {/* Modals */}
      {/* 1. Document Editor Modal */}
      <DocumentEditorModal
        isOpen={isEditorOpen}
        onClose={() => {
          setIsEditorOpen(false);
          setEditorDocToEdit(null);
        }}
        documentToEdit={editorDocToEdit}
        initialType={editorInitialType}
        onIssued={(issuedDoc) => {
          handleOpenDetails(issuedDoc);
        }}
      />

      {/* 2. Record Payment Modal */}
      <RecordPaymentModal
        isOpen={isPaymentModalOpen}
        onClose={() => {
          setIsPaymentModalOpen(false);
          setPaymentTargetRequest(null);
        }}
        targetPaymentRequest={paymentTargetRequest}
        onReceiptIssued={(_receipt) => {
          // Close modal and return directly to documents view without opening another dialog
          setIsPaymentModalOpen(false);
          setPaymentTargetRequest(null);
          setIsDetailsModalOpen(false);
          setSelectedDocForDetails(null);
        }}
      />

      {/* 3. Document Details Modal */}
      <DocumentDetailsModal
        isOpen={isDetailsModalOpen}
        onClose={() => {
          setIsDetailsModalOpen(false);
          setSelectedDocForDetails(null);
        }}
        document={selectedDocForDetails}
        onEditDraft={(draft) => handleEditDraft(draft)}
        onRecordPayment={(req) => handleRecordPayment(req)}
        onConvertQuote={(quote) => handleConvertQuote(quote)}
      />

      {/* 4. Time Billing Wizard Modal */}
      <TimeBillingModal
        isOpen={isTimeBillingOpen}
        onClose={() => setIsTimeBillingOpen(false)}
        onDraftCreated={(docId, newDraft) => {
          setIsTimeBillingOpen(false);
          const found = newDraft || documents.find(d => d.id === docId);
          if (found) {
            handleEditDraft(found);
          }
        }}
      />

      {/* 5. Sequence Confirmation Modal */}
      <SequenceConfirmationModal
        isOpen={isSequenceModalOpen}
        onClose={() => setIsSequenceModalOpen(false)}
      />

      {/* 6. Payment Reminder Modal */}
      {reminderTargetDoc && (
        <PaymentReminderModal
          isOpen={isReminderModalOpen}
          onClose={() => {
            setIsReminderModalOpen(false);
            setReminderTargetDoc(null);
          }}
          document={reminderTargetDoc}
        />
      )}
    </div>
  );
};
