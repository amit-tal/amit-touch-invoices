// AMIT TOUCH Document Editor Modal
import React, { useState, useEffect, useMemo } from 'react';
import { useApp } from '../../context/AppContext';
import { useDocuments } from '../../context/DocumentsContext';
import type { 
  AppDocument, 
  DocumentType, 
  DocumentLineItem,
  ReceiptPaymentMethod,
  PaymentAllocation,
  PaymentMethodType
} from '../../types/documents';
import { CustomSelect } from '../CustomSelect';
import { CustomDatePicker } from '../CustomDatePicker';
import { DocumentPdfPrintView } from './DocumentPdfPrintView';
import { 
  calculateLineTotal, 
  calculateTotals, 
  calculateDueDate, 
  formatCurrency, 
  getDocumentTypeTitle 
} from '../../utils/moneyUtils';
import { 
  X, 
  Plus, 
  Trash2, 
  Save, 
  Send, 
  Eye, 
  Edit3, 
  AlertCircle, 
  UserPlus, 
  FileText,
  Sparkles,
  RotateCcw,
  RefreshCw,
  Printer,
  FileDown,
  Coins,
  Link2,
  ShieldCheck,
} from 'lucide-react';
import { downloadDocumentPdf } from '../../utils/pdfExportUtils';

interface DocumentEditorModalProps {
  isOpen: boolean;
  onClose: () => void;
  documentToEdit?: AppDocument | null;
  initialType?: DocumentType;
  initialClientId?: string;
  onIssued?: (doc: AppDocument) => void;
}

export const DocumentEditorModal: React.FC<DocumentEditorModalProps> = ({
  isOpen,
  onClose,
  documentToEdit,
  initialType = 'payment_request',
  initialClientId,
  onIssued,
}) => {
  const { clients, projects, settings, addClient, showToast } = useApp();
  const { 
    documents,
    businessSettings, 
    sequences, 
    isTestMode, 
    saveDraft, 
    issueDocument 
  } = useDocuments();

  // Active view tab: 'edit' or 'preview'
  const [activeTab, setActiveTab] = useState<'edit' | 'preview'>('edit');

  // Document metadata
  const [docType, setDocType] = useState<DocumentType>(
    documentToEdit ? documentToEdit.type : initialType
  );
  const [clientId, setClientId] = useState<string>(
    documentToEdit?.clientId || initialClientId || (clients[0]?.id || '')
  );
  const [projectId, setProjectId] = useState<string>(
    documentToEdit?.projectId || ''
  );
  const [docDate, setDocDate] = useState<string>(
    documentToEdit?.date || new Date().toISOString().split('T')[0]
  );

  // Selected client reference
  const selectedClient = useMemo(() => {
    return clients.find(c => c.id === clientId);
  }, [clients, clientId]);

  // Payment Terms logic:
  // 1. Initialized from documentToEdit if exists
  // 2. Otherwise from selected client's paymentTerms
  // 3. Falling back to business defaults
  // 4. If neither, unselected
  const [paymentTerms, setPaymentTerms] = useState<string>(() => {
    if (documentToEdit?.paymentTerms) return documentToEdit.paymentTerms;
    const cl = clients.find(c => c.id === (documentToEdit?.clientId || clients[0]?.id));
    return cl?.paymentTerms || businessSettings.defaultPaymentTerms || 'שוטף + 30';
  });

  const [customTermsDetails, setCustomTermsDetails] = useState<string>(
    documentToEdit?.customPaymentTermsDetails || ''
  );

  // Due Date Manual Override State
  const [isDueDateManualOverride, setIsDueDateManualOverride] = useState<boolean>(
    documentToEdit?.isDueDateManualOverride || false
  );
  const [manualDueDate, setManualDueDate] = useState<string>(
    documentToEdit?.dueDate || ''
  );

  const [customerRef, setCustomerRef] = useState<string>(
    documentToEdit?.customerRef || ''
  );
  const [notes, setNotes] = useState<string>(
    documentToEdit?.notes || businessSettings.defaultNotes || ''
  );

  // Quote-specific state
  const [quoteTitle, setQuoteTitle] = useState<string>(
    documentToEdit?.title || ''
  );
  const [quoteValidityDays, setQuoteValidityDays] = useState<number>(
    businessSettings.defaultQuoteValidityDays || 14
  );
  const [scopeAndDeliverables, setScopeAndDeliverables] = useState<string>(
    documentToEdit?.scopeAndDeliverables || ''
  );
  const [paymentSchedule, setPaymentSchedule] = useState<string>(
    documentToEdit?.paymentSchedule || ''
  );
  const [estimatedDelivery, setEstimatedDelivery] = useState<string>(
    documentToEdit?.estimatedDelivery || ''
  );
  const [includedRevisions, setIncludedRevisions] = useState<string>(
    documentToEdit?.includedRevisions || 'עד 2 סבבי תיקונים כלולים בהצעה'
  );
  const [exclusions, setExclusions] = useState<string>(
    documentToEdit?.exclusions || ''
  );

  // Receipt-specific state
  const [isPaperReceipt, setIsPaperReceipt] = useState<boolean>(() => !!documentToEdit?.isPaperReceipt);
  const [paymentReceivedDate, setPaymentReceivedDate] = useState<string>(
    documentToEdit?.paymentReceivedDate || documentToEdit?.date || new Date().toISOString().split('T')[0]
  );
  const [paymentMethods, setPaymentMethods] = useState<ReceiptPaymentMethod[]>(() => {
    if (documentToEdit?.paymentMethods && documentToEdit.paymentMethods.length > 0) {
      return documentToEdit.paymentMethods;
    }
    return [
      {
        id: 'pm_' + Date.now(),
        type: 'bank_transfer',
        amount: documentToEdit?.totalAmount || 0,
        bankName: '',
        referenceNumber: '',
      }
    ];
  });
  const [paymentAllocations, setPaymentAllocations] = useState<PaymentAllocation[]>(
    documentToEdit?.paymentAllocations || []
  );

  // Line items state
  const [lineItems, setLineItems] = useState<DocumentLineItem[]>(() => {
    if (documentToEdit && documentToEdit.lineItems && documentToEdit.lineItems.length > 0) {
      return documentToEdit.lineItems;
    }
    return [
      {
        id: 'item_' + Date.now(),
        description: '',
        quantity: 1,
        unit: 'שעות',
        unitPrice: settings.defaultHourlyRate || 350,
        discount: 0,
        discountType: 'percent',
        isTaxable: businessSettings.businessType !== 'exempt',
        lineTotal: settings.defaultHourlyRate || 350,
      },
    ];
  });

  // Inline Quick-Add Client State
  const [isQuickAddClientOpen, setIsQuickAddClientOpen] = useState(false);
  const [quickClientName, setQuickClientName] = useState('');
  const [quickBusinessNumber, setQuickBusinessNumber] = useState('');
  const [quickPaymentTerms, setQuickPaymentTerms] = useState('שוטף + 30');

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [isExportingPdf, setIsExportingPdf] = useState(false);

  // Projects filtered by selected client
  const clientProjects = useMemo(() => {
    if (!clientId) return [];
    return projects.filter(p => p.clientId === clientId);
  }, [projects, clientId]);

  // Synchronize when documentToEdit changes or when modal opens
  useEffect(() => {
    if (!isOpen) return;

    if (documentToEdit) {
      setDocType(documentToEdit.type);
      setClientId(documentToEdit.clientId);
      setProjectId(documentToEdit.projectId || '');
      setDocDate(documentToEdit.date);
      setPaymentTerms(documentToEdit.paymentTerms || businessSettings.defaultPaymentTerms || '');
      setCustomTermsDetails(documentToEdit.customPaymentTermsDetails || '');
      setIsDueDateManualOverride(documentToEdit.isDueDateManualOverride || false);
      setManualDueDate(documentToEdit.dueDate || '');
      setCustomerRef(documentToEdit.customerRef || '');
      setNotes(documentToEdit.notes || businessSettings.defaultNotes || '');
      setLineItems(documentToEdit.lineItems && documentToEdit.lineItems.length > 0 ? documentToEdit.lineItems : [
        {
          id: 'item_' + Date.now(),
          description: '',
          quantity: 1,
          unit: 'שעות',
          unitPrice: 350,
          discount: 0,
          discountType: 'percent',
          isTaxable: businessSettings.businessType !== 'exempt',
          lineTotal: 350,
        }
      ]);
      setQuoteTitle(documentToEdit.title || '');
      setScopeAndDeliverables(documentToEdit.scopeAndDeliverables || '');
      setPaymentSchedule(documentToEdit.paymentSchedule || '');
      setEstimatedDelivery(documentToEdit.estimatedDelivery || '');
      setIncludedRevisions(documentToEdit.includedRevisions || '');
      setExclusions(documentToEdit.exclusions || '');
      setPaymentReceivedDate(documentToEdit.paymentReceivedDate || documentToEdit.date || new Date().toISOString().split('T')[0]);
      setPaymentMethods(documentToEdit.paymentMethods && documentToEdit.paymentMethods.length > 0 ? documentToEdit.paymentMethods : [
        { id: 'pm_' + Date.now(), type: 'bank_transfer', amount: documentToEdit.totalAmount || 0 }
      ]);
      setPaymentAllocations(documentToEdit.paymentAllocations || []);
    } else {
      setDocType(initialType);
      if (clients.length > 0) {
        const defaultClient = clients[0];
        setClientId(defaultClient.id);
        setPaymentTerms(defaultClient.paymentTerms || businessSettings.defaultPaymentTerms || 'שוטף + 30');
      } else {
        setPaymentTerms(businessSettings.defaultPaymentTerms || 'שוטף + 30');
      }
      setIsDueDateManualOverride(false);
      setManualDueDate('');
      setCustomerRef('');
      setNotes(businessSettings.defaultNotes || '');
      setPaymentReceivedDate(new Date().toISOString().split('T')[0]);
      setPaymentMethods([
        { id: 'pm_' + Date.now(), type: 'bank_transfer', amount: 0 }
      ]);
      setPaymentAllocations([]);
      setLineItems([
        {
          id: 'item_' + Date.now(),
          description: '',
          quantity: 1,
          unit: 'שעות',
          unitPrice: settings.defaultHourlyRate || 350,
          discount: 0,
          discountType: 'percent',
          isTaxable: businessSettings.businessType !== 'exempt',
          lineTotal: settings.defaultHourlyRate || 350,
        }
      ]);
      setQuoteTitle('');
      setScopeAndDeliverables('');
      setPaymentSchedule('');
      setEstimatedDelivery('');
      setIncludedRevisions('עד 2 סבבי תיקונים כלולים בהצעה');
      setExclusions('');
    }
  }, [isOpen, documentToEdit, initialType, clients, businessSettings, settings.defaultHourlyRate]);

  // Handle Escape key to close modal
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen) {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  // Handle Client Change with payment terms prefill
  const handleClientChange = (newClientId: string) => {
    setClientId(newClientId);
    // If we're creating a new document (not editing an existing one), prefill the client's saved terms:
    if (!documentToEdit) {
      const cl = clients.find(c => c.id === newClientId);
      const terms = cl?.paymentTerms || businessSettings.defaultPaymentTerms || 'שוטף + 30';
      setPaymentTerms(terms);
    }
  };

  // Automatic Due Date calculation from docDate and paymentTerms
  const autoDueDateInfo = useMemo(() => {
    if (docType !== 'payment_request') return undefined;
    return calculateDueDate(docDate, paymentTerms, customTermsDetails);
  }, [docType, docDate, paymentTerms, customTermsDetails]);

  // Effective due date (manual date if overridden, otherwise auto-calculated)
  const effectiveDueDate = useMemo(() => {
    if (docType !== 'payment_request') return undefined;
    if (isDueDateManualOverride) {
      return manualDueDate || autoDueDateInfo?.dueDate || docDate;
    }
    return autoDueDateInfo?.dueDate || docDate;
  }, [docType, isDueDateManualOverride, manualDueDate, autoDueDateInfo, docDate]);

  // User manually edits the due date
  const handleDueDateChange = (newDate: string) => {
    setManualDueDate(newDate);
    setIsDueDateManualOverride(true);
  };

  // Reset due date back to automatic formula
  const handleResetToAutoDueDate = () => {
    setIsDueDateManualOverride(false);
    if (autoDueDateInfo?.dueDate) {
      setManualDueDate(autoDueDateInfo.dueDate);
    }
  };

  // Refresh draft with latest saved business profile without clearing user content
  const handleRefreshBusinessInEditor = () => {
    // 1. Update line item taxability based on business type (exempt vs licensed/company)
    const isExempt = businessSettings.businessType === 'exempt';
    setLineItems(prev => prev.map(li => ({ ...li, isTaxable: !isExempt })));

    // 2. If payment terms were standard or empty, update to latest business default
    if (!paymentTerms || paymentTerms === 'שוטף + 30' || paymentTerms === 'לתשלום מיידי') {
      setPaymentTerms(businessSettings.defaultPaymentTerms || 'שוטף + 30');
    }

    // 3. Update notes if empty or matches standard default notes
    if (!notes || notes === 'תודה על שיתוף הפעולה. תנאי תשלום כפי שצוין בדרישה זו.') {
      setNotes(businessSettings.defaultNotes || '');
    }

    showToast('פרטי העסק עודכנו בטיוטה בהצלחה');
  };

  // User changes payment terms
  const handlePaymentTermsChange = (newTerms: string) => {
    setPaymentTerms(newTerms);
    if (newTerms === 'אחר') {
      setIsDueDateManualOverride(true);
      if (!manualDueDate) setManualDueDate(docDate);
    }
  };

  // Auto-calculate Validity Date for Quotes
  const validUntilDate = useMemo(() => {
    if (docType !== 'quote') return undefined;
    const [y, m, d] = docDate.split('-').map(Number);
    const targetUtc = new Date(Date.UTC(y, m - 1, d + (quoteValidityDays || 14)));
    const vy = targetUtc.getUTCFullYear();
    const vm = targetUtc.getUTCMonth() + 1;
    const vd = targetUtc.getUTCDate();
    return `${vy}-${String(vm).padStart(2, '0')}-${String(vd).padStart(2, '0')}`;
  }, [docType, docDate, quoteValidityDays]);

  // Recalculate totals
  const calculatedTotals = useMemo(() => {
    const vatRate = businessSettings.businessType === 'exempt' ? 0 : businessSettings.vatRate;
    return calculateTotals(lineItems, vatRate);
  }, [lineItems, businessSettings]);

  // Handle line item updates
  const handleUpdateLineItem = (id: string, updates: Partial<DocumentLineItem>) => {
    setLineItems(prev => prev.map(item => {
      if (item.id !== id) return item;
      const updated = { ...item, ...updates };
      const res = calculateLineTotal(
        updated.quantity,
        updated.unitPrice,
        updated.discount,
        updated.discountType
      );
      updated.lineTotal = res.lineTotal;
      return updated;
    }));
  };

  const handleAddLineItem = () => {
    const newItem: DocumentLineItem = {
      id: 'item_' + Date.now() + '_' + Math.random().toString(36).substring(2, 6),
      description: '',
      quantity: 1,
      unit: 'שעות',
      unitPrice: settings.defaultHourlyRate || 350,
      discount: 0,
      discountType: 'percent',
      isTaxable: businessSettings.businessType !== 'exempt',
      lineTotal: settings.defaultHourlyRate || 350,
    };
    setLineItems(prev => [...prev, newItem]);
  };

  const handleRemoveLineItem = (id: string) => {
    if (lineItems.length === 1) {
      showToast('המסמך חייב להכיל לפחות שורה אחת');
      return;
    }
    setLineItems(prev => prev.filter(item => item.id !== id));
  };

  // Handle Quick Add Client
  const handleQuickAddClient = (e: React.FormEvent) => {
    e.preventDefault();
    if (!quickClientName.trim()) return;
    const newClient = addClient(
      quickClientName.trim(),
      '#BC796F',
      quickBusinessNumber.trim() || undefined,
      quickPaymentTerms || undefined
    );
    setClientId(newClient.id);
    setPaymentTerms(newClient.paymentTerms || businessSettings.defaultPaymentTerms || '');
    setIsQuickAddClientOpen(false);
    setQuickClientName('');
    setQuickBusinessNumber('');
    showToast(`הלקוח ${newClient.name} נוסף בהצלחה`);
  };

  // Build Document Payload for saving or issuing
  const buildDocumentPayload = (): Partial<AppDocument> => {
    const client = clients.find(c => c.id === clientId);
    const project = projects.find(p => p.id === projectId);

    return {
      ...(documentToEdit?.id ? { id: documentToEdit.id } : {}),
      billedTimeEntryIds: documentToEdit?.billedTimeEntryIds,
      type: docType,
      date: docDate,
      dueDate: effectiveDueDate,
      validUntilDate: validUntilDate,
      clientId: clientId,
      clientName: client?.name || '',
      clientBusinessNumber: client?.businessNumber,
      clientAddress: client?.address,
      clientEmail: client?.email,
      clientContactPerson: client?.contactPerson,
      projectId: projectId || undefined,
      projectName: project?.name,
      currency: businessSettings.currency || '₪',
      customerRef: customerRef.trim() || undefined,
      lineItems: lineItems,
      subtotal: calculatedTotals.subtotal,
      discountTotal: calculatedTotals.discountTotal,
      vatTotal: calculatedTotals.vatTotal,
      totalAmount: calculatedTotals.totalAmount,
      paidAmount: documentToEdit?.paidAmount || 0,
      remainingBalance: calculatedTotals.totalAmount - (documentToEdit?.paidAmount || 0),
      notes: notes.trim() || undefined,
      paymentTerms: paymentTerms,
      customPaymentTermsDetails: customTermsDetails.trim() || undefined,
      dueDateExplanation: isDueDateManualOverride ? 'נקבע ידנית' : autoDueDateInfo?.explanation,
      isDueDateManualOverride: isDueDateManualOverride,
      title: quoteTitle.trim() || undefined,
      scopeAndDeliverables: scopeAndDeliverables.trim() || undefined,
      paymentSchedule: paymentSchedule.trim() || undefined,
      estimatedDelivery: estimatedDelivery.trim() || undefined,
      includedRevisions: includedRevisions.trim() || undefined,
      exclusions: exclusions.trim() || undefined,
      paymentReceivedDate: docType === 'receipt' ? (paymentReceivedDate || docDate) : undefined,
      paymentMethods: docType === 'receipt' ? paymentMethods : undefined,
      paymentAllocations: docType === 'receipt' && paymentAllocations.length > 0 ? paymentAllocations : undefined,
      isPaperReceipt: docType === 'receipt' ? isPaperReceipt : undefined,
      deliveryMethod: docType === 'receipt' ? (isPaperReceipt ? 'paper' : 'electronic') : undefined,
    };
  };

  // Save Draft
  const handleSaveDraft = async () => {
    if (!clientId) {
      setError('יש לבחור לקוח');
      return;
    }
    setError('');
    setIsSubmitting(true);
    try {
      const payload = buildDocumentPayload();
      payload.status = 'draft';
      await saveDraft(payload);
      showToast('הטיוטה נשמרה בהצלחה');
      onClose();
    } catch (err: any) {
      setError(err?.message || 'שגיאה בשמירת הטיוטה');
    } finally {
      setIsSubmitting(false);
    }
  };

  // Issue Document
  const handleIssue = async () => {
    if (!clientId) {
      setError('יש לבחור לקוח');
      return;
    }
    if (lineItems.length === 0 || !lineItems.some(i => i.description.trim())) {
      setError('יש להזין תיאור לפחות לפריט אחד במסמך');
      return;
    }
    if (calculatedTotals.totalAmount <= 0) {
      setError('סכום המסמך חייב להיות גדול מ-0');
      return;
    }

    if (docType === 'receipt') {
      if (paymentMethods.length === 0) {
        setError('יש לציין לפחות אמצעי תשלום אחד (העברה בנקאית, כרטיס אשראי, המחאה, מזומן)');
        return;
      }
      const methodsTotal = paymentMethods.reduce((sum, m) => sum + (Number(m.amount) || 0), 0);
      if (Math.abs(methodsTotal - calculatedTotals.totalAmount) > 0.01) {
        setError(`סכום אמצעי התשלום (${methodsTotal.toFixed(2)} ₪) חייב להיות תואם בדיוק לסך הקבלה (${calculatedTotals.totalAmount.toFixed(2)} ₪)`);
        return;
      }
      for (const m of paymentMethods) {
        if (m.type === 'check' && (!m.checkNumber || !m.checkNumber.trim())) {
          setError('עבור תשלום בהמחאה (צ\'ק), חובה לציין מספר המחאה');
          return;
        }
      }
    }

    setError('');
    setIsSubmitting(true);
    try {
      // First save draft with latest changes
      const payload = buildDocumentPayload();
      const draft = await saveDraft(payload);

      // Now issue officially (or test mode)
      const res = await issueDocument(draft.id);
      if (res.success && res.document) {
        showToast(
          res.document.isTestMode
            ? `הופק מסמך בדיקה ${res.document.documentNumber}`
            : `הופק מסמך רשמי ${res.document.documentNumber}`
        );
        if (onIssued) onIssued(res.document);
        onClose();
      } else {
        setError(res.error || 'שגיאה בהפקת המסמך');
      }
    } catch (err: any) {
      setError(err?.message || 'שגיאה בהפקת המסמך');
    } finally {
      setIsSubmitting(false);
    }
  };

  // Construct draft preview object
  const previewDoc: AppDocument = useMemo(() => {
    return {
      id: documentToEdit?.id || 'preview_id',
      type: docType,
      status: 'draft',
      deliveryStatus: 'not_sent',
      // While a document is a draft, leave the official number blank until successful issuance
      documentNumber: documentToEdit?.status !== 'draft' ? (documentToEdit?.documentNumber || null) : null,
      isOfficial: !isTestMode && sequences.isProductionActive,
      isTestMode: isTestMode || !sequences.isProductionActive,
      date: docDate,
      dueDate: effectiveDueDate,
      validUntilDate: validUntilDate,
      clientId: clientId,
      clientName: selectedClient?.name || 'לקוח לדוגמה',
      clientBusinessNumber: selectedClient?.businessNumber,
      clientAddress: selectedClient?.address,
      clientEmail: selectedClient?.email,
      clientContactPerson: selectedClient?.contactPerson,
      projectId: projectId,
      projectName: projects.find(p => p.id === projectId)?.name,
      currency: businessSettings.currency || '₪',
      customerRef: customerRef,
      lineItems: lineItems,
      subtotal: calculatedTotals.subtotal,
      discountTotal: calculatedTotals.discountTotal,
      vatTotal: calculatedTotals.vatTotal,
      totalAmount: calculatedTotals.totalAmount,
      paidAmount: 0,
      remainingBalance: calculatedTotals.totalAmount,
      notes: notes,
      paymentTerms: paymentTerms,
      customPaymentTermsDetails: customTermsDetails,
      dueDateExplanation: isDueDateManualOverride ? 'נקבע ידנית' : autoDueDateInfo?.explanation,
      isDueDateManualOverride: isDueDateManualOverride,
      title: quoteTitle,
      scopeAndDeliverables: scopeAndDeliverables,
      paymentSchedule: paymentSchedule,
      estimatedDelivery: estimatedDelivery,
      includedRevisions: includedRevisions,
      exclusions: exclusions,
      paymentReceivedDate: paymentReceivedDate,
      paymentMethods: docType === 'receipt' ? paymentMethods : undefined,
      paymentAllocations: docType === 'receipt' ? paymentAllocations : undefined,
      auditTrail: [],
      createdAt: new Date().toISOString(),
    };
  }, [
    documentToEdit,
    docType,
    isTestMode,
    sequences,
    docDate,
    effectiveDueDate,
    validUntilDate,
    clientId,
    selectedClient,
    projectId,
    projects,
    businessSettings,
    customerRef,
    lineItems,
    calculatedTotals,
    notes,
    paymentTerms,
    customTermsDetails,
    isDueDateManualOverride,
    autoDueDateInfo,
    quoteTitle,
    scopeAndDeliverables,
    paymentSchedule,
    estimatedDelivery,
    includedRevisions,
    exclusions,
    paymentReceivedDate,
    paymentMethods,
    paymentAllocations,
  ]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-5 md:p-6 overflow-y-auto bg-warm-950/25 backdrop-blur-md animate-fade-in font-heebo print:p-0 print:m-0 print:static print:bg-transparent print:backdrop-blur-none print:overflow-visible print:block print:z-auto">
      <div 
        role="dialog"
        aria-modal="true"
        className="relative w-full max-w-5xl rounded-[28px] shadow-[0_24px_70px_-15px_rgba(109,64,61,0.22)] border border-white/80 bg-gradient-to-br from-[#FFFDFC]/95 via-[#FDF5F2]/90 to-[#F9ECE7]/85 backdrop-blur-2xl flex flex-col max-h-[92vh] overflow-hidden my-auto text-warm-950 print:border-none print:shadow-none print:bg-transparent print:backdrop-blur-none print:max-h-none print:overflow-visible print:w-full print:max-w-none print:p-0 print:m-0"
        onClick={e => e.stopPropagation()}
      >
        {/* Header Bar */}
        <div className="px-7 py-4 border-b border-[#BC796F]/15 flex flex-wrap items-center justify-between gap-4 bg-white/55 shrink-0 backdrop-blur-md print-hide print:hidden">
          <div className="flex items-center gap-3.5">
            <div className="w-10 h-10 rounded-2xl bg-gradient-to-tr from-[#BC796F] to-[#E4AEA3] flex items-center justify-center text-white shadow-md shadow-[#BC796F]/20">
              <FileText className="w-5 h-5" />
            </div>
            <div>
              <div className="flex flex-wrap items-center gap-2.5">
                <h2 className="text-xl sm:text-2xl font-bold text-warm-950 tracking-tight">
                  {documentToEdit ? 'עריכת טיוטת מסמך' : 'הפקת מסמך חדש'}
                </h2>
                {isTestMode ? (
                  <span className="inline-flex items-center whitespace-nowrap shrink-0 text-xs font-bold font-heebo px-3.5 py-1 rounded-full bg-amber-100 text-amber-900 border border-amber-300 shadow-xs">
                    מצב בדיקה
                  </span>
                ) : (
                  <span className="inline-flex items-center whitespace-nowrap shrink-0 text-xs font-bold font-heebo px-3.5 py-1 rounded-full bg-[#BC796F]/15 text-[#88463F] border border-[#BC796F]/30 shadow-xs">
                    טיוטה — לא מסמך רשמי
                  </span>
                )}
              </div>
              <p className="text-xs text-[#7D5A56] font-medium mt-0.5">
                {getDocumentTypeTitle(docType)}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            {/* Update Business Details Button */}
            <button
              type="button"
              onClick={handleRefreshBusinessInEditor}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold text-[#88463F] bg-[#BC796F]/12 hover:bg-[#BC796F]/22 border border-[#BC796F]/30 transition-all shadow-xs"
              title="טעינת פרטי העסק המעודכנים (שם, עוסק, מע״מ, תנאי תשלום ובנק) לתוך הטיוטה"
            >
              <RefreshCw className="w-3.5 h-3.5 text-[#BC796F]" />
              <span>עדכון פרטי העסק</span>
            </button>

            {/* Tab Switcher: Form View vs Live A4 Preview */}
            <div className="flex items-center p-1 rounded-xl bg-white/70 border border-white/90 shadow-xs">
              <button
                type="button"
                onClick={() => setActiveTab('edit')}
                className={`flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg text-xs transition-all ${
                  activeTab === 'edit'
                    ? 'bg-[#BC796F] text-white shadow-sm font-bold'
                    : 'text-warm-800 hover:text-warm-950 hover:bg-white/50 font-semibold'
                }`}
              >
                <Edit3 className="w-3.5 h-3.5" />
                <span>עריכה</span>
              </button>

              <button
                type="button"
                onClick={() => setActiveTab('preview')}
                className={`flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg text-xs transition-all ${
                  activeTab === 'preview'
                    ? 'bg-[#BC796F] text-white shadow-sm font-bold'
                    : 'text-warm-800 hover:text-warm-950 hover:bg-white/50 font-semibold'
                }`}
              >
                <Eye className="w-3.5 h-3.5" />
                <span>תצוגה מקדימה</span>
              </button>
            </div>

            <button
              onClick={onClose}
              className="p-2 rounded-xl text-warm-600 hover:text-warm-950 hover:bg-white/60 transition-colors"
              aria-label="סגור"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Error Alert */}
        {error && (
          <div className="mx-7 mt-4 p-3.5 rounded-2xl bg-red-50/90 border border-red-200 text-red-700 text-xs font-medium flex items-center gap-2 animate-shake shadow-xs">
            <AlertCircle className="w-4 h-4 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        {/* Body Content */}
        <div className="flex-1 overflow-y-auto p-6 sm:p-7 scrollbar-none print:p-0 print:m-0 print:overflow-visible print:block">
          {activeTab === 'preview' ? (
            <div className="max-w-4xl mx-auto py-2 print:max-w-none print:w-full print:p-0 print:m-0">
              <div className="mb-3 flex items-center justify-between text-xs text-[#7D5A56] px-1 print-hide print:hidden">
                <span className="flex items-center gap-1.5">
                  <Sparkles className="w-3.5 h-3.5 text-[#BC796F]" />
                  <span>תצוגה מקדימה מיושרת לפורמט דפוס A4</span>
                </span>
                <div className="flex flex-wrap items-center gap-2">
                  <a
                    href="/api/documents/test-signed-pdf"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold text-[#88463F] bg-[#BC796F]/10 hover:bg-[#BC796F]/20 border border-[#BC796F]/30 shadow-xs transition-all"
                    title="הורדת קובץ בדיקה חתום דיגיטלית (receipt_TEST-1001_signed.pdf) לבדיקת חתימה עצמאית בתוכנת Adobe Acrobat Reader"
                  >
                    <ShieldCheck className="w-3.5 h-3.5 text-[#BC796F]" />
                    <span>קובץ בדיקה חתום</span>
                  </a>
                  <button
                    type="button"
                    onClick={() => downloadDocumentPdf(previewDoc, businessSettings, setIsExportingPdf, showToast)}
                    disabled={isExportingPdf}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold text-white bg-[#88463F] hover:bg-[#723832] shadow-xs transition-all disabled:opacity-60"
                    title="הורדת קובץ PDF ישירות ללא תפריטי הדפסה של הדפדפן"
                  >
                    <FileDown className={`w-3.5 h-3.5 ${isExportingPdf ? 'animate-bounce' : ''}`} />
                    <span>{isExportingPdf ? 'מייצא PDF...' : 'שמירת PDF'}</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => window.print()}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold text-warm-900 bg-white/85 hover:bg-white border border-[#BC796F]/30 shadow-xs transition-all"
                    title="הדפסה במדפסת (תבנית מסמך נקייה ללא סרגלי האפליקציה)"
                  >
                    <Printer className="w-3.5 h-3.5 text-[#BC796F]" />
                    <span>הדפסה</span>
                  </button>
                  <span className="hidden sm:inline">עיצוב רשמי AMIT TOUCH</span>
                </div>
              </div>
              <DocumentPdfPrintView document={previewDoc} business={businessSettings} />
            </div>
          ) : (
            <div className="flex flex-col gap-6 print:hidden">
              {/* Top Controls Card: Document Type, Client, Optional Project, Date */}
              <div className="p-5 sm:p-6 rounded-2xl bg-white/65 backdrop-blur-md border border-white/85 shadow-[0_4px_20px_-4px_rgba(188,121,111,0.06)] flex flex-col gap-4">
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  {/* Document Type Selector */}
                  <div className="flex flex-col gap-1.5">
                    <label className="text-xs font-bold text-warm-900">סוג המסמך *</label>
                    <CustomSelect
                      value={docType}
                      onChange={(val) => setDocType(val as DocumentType)}
                      disabled={!!documentToEdit}
                      options={[
                        { value: 'payment_request', label: 'חשבון עסקה / דרישת תשלום' },
                        { value: 'receipt', label: 'קבלה' },
                        { value: 'quote', label: 'הצעת מחיר' },
                      ]}
                      triggerClassName="h-11 bg-white/80"
                    />
                  </div>

                  {/* Client Selector with Quick Add */}
                  <div className="flex flex-col gap-1.5">
                    <div className="flex items-center justify-between">
                      <label className="text-xs font-bold text-warm-900">שם העסק / לקוח *</label>
                      <button
                        type="button"
                        onClick={() => setIsQuickAddClientOpen(true)}
                        className="text-[11px] font-bold text-[#88463F] hover:text-[#BC796F] flex items-center gap-1 transition-colors"
                      >
                        <UserPlus className="w-3 h-3" />
                        <span>לקוח חדש</span>
                      </button>
                    </div>

                    <CustomSelect
                      value={clientId}
                      onChange={handleClientChange}
                      placeholder="בחר לקוח..."
                      options={clients.map(c => ({
                        value: c.id,
                        label: c.name,
                        badge: c.businessNumber ? `ע.מ ${c.businessNumber}` : undefined,
                      }))}
                      triggerClassName="h-11 bg-white/80"
                    />
                  </div>

                  {/* Document Date */}
                  <div className="flex flex-col gap-1.5">
                    <label className="text-xs font-bold text-warm-900">תאריך המסמך *</label>
                    <CustomDatePicker
                      value={docDate}
                      onChange={setDocDate}
                    />
                  </div>
                </div>

                {/* Optional Project Selector (if client has projects) */}
                {clientProjects.length > 0 && (
                  <div className="flex flex-col gap-1.5 pt-2 border-t border-[#BC796F]/10">
                    <label className="text-xs font-bold text-warm-900">פרויקט משויך (אופציונלי)</label>
                    <CustomSelect
                      value={projectId}
                      onChange={setProjectId}
                      placeholder="ללא שיוך לפרויקט..."
                      options={[
                        { value: '', label: 'ללא שיוך לפרויקט' },
                        ...clientProjects.map(p => ({
                          value: p.id,
                          label: p.name,
                        })),
                      ]}
                      triggerClassName="h-11 bg-white/80"
                    />
                  </div>
                )}
              </div>

              {/* Quick Add Client Inline Drawer */}
              {isQuickAddClientOpen && (
                <div className="p-5 rounded-2xl bg-[#BC796F]/10 border border-[#BC796F]/30 shadow-xs flex flex-col gap-3 animate-fade-in">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-warm-950 flex items-center gap-1.5">
                      <UserPlus className="w-4 h-4 text-[#BC796F]" />
                      <span>הוספת לקוח חדש במהירות</span>
                    </span>
                    <button
                      type="button"
                      onClick={() => setIsQuickAddClientOpen(false)}
                      className="text-warm-600 hover:text-warm-950"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
                    <input
                      type="text"
                      placeholder="שם הלקוח / עסק *"
                      value={quickClientName}
                      onChange={e => setQuickClientName(e.target.value)}
                      className="h-10 px-3 rounded-xl text-xs bg-white text-warm-900 border border-warm-200 focus:border-[#BC796F]"
                    />
                    <input
                      type="text"
                      dir="ltr"
                      placeholder="מספר עוסק / ח.פ"
                      value={quickBusinessNumber}
                      onChange={e => setQuickBusinessNumber(e.target.value)}
                      className="h-10 px-3 rounded-xl text-xs bg-white text-warm-900 border border-warm-200 text-right focus:border-[#BC796F]"
                    />
                    <CustomSelect
                      value={quickPaymentTerms}
                      onChange={setQuickPaymentTerms}
                      options={[
                        { value: 'לתשלום מיידי', label: 'לתשלום מיידי' },
                        { value: 'שוטף', label: 'שוטף' },
                        { value: 'שוטף + 15', label: 'שוטף + 15' },
                        { value: 'שוטף + 30', label: 'שוטף + 30' },
                        { value: 'שוטף + 45', label: 'שוטף + 45' },
                        { value: 'שוטף + 60', label: 'שוטף + 60' },
                        { value: 'שוטף + 90', label: 'שוטף + 90' },
                      ]}
                      triggerClassName="h-10 bg-white"
                    />
                    <button
                      type="button"
                      onClick={handleQuickAddClient}
                      className="h-10 px-4 rounded-xl text-xs font-bold text-white bg-[#BC796F] hover:bg-[#A46A69] transition-colors shadow-xs"
                    >
                      הוסף לקוח ובחר בו
                    </button>
                  </div>
                </div>
              )}

              {/* Type-Specific Fields: Payment Request Terms & Due Date */}
              {docType === 'payment_request' && (
                <div className="p-5 sm:p-6 rounded-2xl bg-white/65 backdrop-blur-md border border-white/85 shadow-[0_4px_20px_-4px_rgba(188,121,111,0.06)] flex flex-col gap-4">
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    {/* Payment Terms Selector */}
                    <div className="flex flex-col gap-1.5">
                      <label className="text-xs font-bold text-warm-900">תנאי תשלום</label>
                      <CustomSelect
                        value={paymentTerms}
                        onChange={handlePaymentTermsChange}
                        options={[
                          { value: 'לתשלום מיידי', label: 'לתשלום מיידי' },
                          { value: 'שוטף', label: 'שוטף (סוף החודש)' },
                          { value: 'שוטף + 15', label: 'שוטף + 15' },
                          { value: 'שוטף + 30', label: 'שוטף + 30' },
                          { value: 'שוטף + 45', label: 'שוטף + 45' },
                          { value: 'שוטף + 60', label: 'שוטף + 60' },
                          { value: 'שוטף + 90', label: 'שוטף + 90' },
                          { value: 'אחר', label: 'אחר (פירוט ידני)' },
                        ]}
                        triggerClassName="h-11 bg-white/80"
                      />
                    </div>

                    {/* Due Date (מועד פירעון) with Manual Override & Return to Auto */}
                    <div className="flex flex-col gap-1.5">
                      <div className="flex items-center justify-between">
                        <label className="text-xs font-bold text-warm-900">מועד פירעון *</label>
                        {isDueDateManualOverride ? (
                          <div className="flex items-center gap-1.5">
                            <span className="text-[11px] font-semibold text-[#88463F] bg-[#BC796F]/12 px-2 py-0.5 rounded-md border border-[#BC796F]/25">
                              נקבע ידנית
                            </span>
                            <button
                              type="button"
                              onClick={handleResetToAutoDueDate}
                              className="text-[11px] font-bold text-[#88463F] hover:text-[#BC796F] underline flex items-center gap-1 transition-colors"
                              title="אפס חזרה לחישוב אוטומטי לפי תנאי התשלום"
                            >
                              <RotateCcw className="w-3 h-3" />
                              <span>חזרה לחישוב אוטומטי</span>
                            </button>
                          </div>
                        ) : (
                          <span className="text-[11px] text-emerald-800 font-semibold bg-emerald-50 px-2 py-0.5 rounded-md border border-emerald-200">
                            מחושב אוטומטית
                          </span>
                        )}
                      </div>

                      <CustomDatePicker
                        value={effectiveDueDate || docDate}
                        onChange={handleDueDateChange}
                      />

                      <div className="text-[11px] text-[#7D5A56] mt-0.5 leading-normal">
                        {isDueDateManualOverride ? (
                          <span>מועד הפירעון נקבע ידנית (לפי תנאי התשלום: {autoDueDateInfo?.explanation})</span>
                        ) : (
                          <span>{autoDueDateInfo?.explanation}</span>
                        )}
                      </div>
                    </div>

                    {/* PO / Customer Reference */}
                    <div className="flex flex-col gap-1.5">
                      <label className="text-xs font-bold text-warm-900">הזמנת רכש / אסמכתת לקוח (PO)</label>
                      <input
                        type="text"
                        value={customerRef}
                        onChange={e => setCustomerRef(e.target.value)}
                        placeholder="לדוגמה: PO-8902"
                        className="w-full h-11 px-4 rounded-xl text-sm font-medium text-warm-900 liquid-glass-input focus:bg-white"
                      />
                    </div>
                  </div>

                  {/* Custom Payment Terms Details Field (shown when 'אחר' is selected) */}
                  {paymentTerms === 'אחר' && (
                    <div className="flex flex-col gap-1.5 pt-3 border-t border-[#BC796F]/15 animate-fade-in">
                      <label className="text-xs font-bold text-warm-900">פירוט תנאי התשלום *</label>
                      <input
                        type="text"
                        value={customTermsDetails}
                        onChange={e => setCustomTermsDetails(e.target.value)}
                        placeholder="לדוגמה: תשלום תוך 7 ימי עסקים ממועד קבלת תוצרי הפרויקט"
                        className="w-full h-11 px-4 rounded-xl text-sm font-medium text-warm-900 liquid-glass-input focus:bg-white"
                      />
                    </div>
                  )}
                </div>
              )}

              {/* Receipt-Specific Fields: Payment Received Date, Breakdown of Payment Methods, Allocation */}
              {docType === 'receipt' && (
                <div className="p-5 sm:p-6 rounded-2xl bg-white/65 backdrop-blur-md border border-white/85 shadow-[0_4px_20px_-4px_rgba(188,121,111,0.06)] flex flex-col gap-5">
                  <div className="flex flex-wrap items-center justify-between border-b border-[#BC796F]/15 pb-3 gap-3">
                    <div className="flex items-center gap-2">
                      <Coins className="w-5 h-5 text-[#BC796F]" />
                      <div>
                        <h3 className="text-sm font-bold text-warm-950">פרטי קבלת התשלום ואמצעי תקבול</h3>
                        <p className="text-[11px] text-[#7D5A56]">פירוט חובה לפי הוראות ניהול פנקסים (סעיף 18ב(ד))</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-[#7D5A56] font-medium">תאריך קבלת התשלום בפועל:</span>
                      <div className="w-40">
                        <CustomDatePicker
                          value={paymentReceivedDate}
                          onChange={setPaymentReceivedDate}
                        />
                      </div>
                    </div>
                  </div>

                  {/* Workflow mode: Electronic vs Paper */}
                  <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between p-3 rounded-xl bg-warm-50/70 border border-warm-200/80 gap-3">
                    <div className="flex flex-col">
                      <span className="text-xs font-bold text-warm-900">מסלול הפקת הקבלה</span>
                      <span className="text-[11px] text-[#7D5A56]">
                        {isPaperReceipt 
                          ? 'מסלול נייר פיזי — ללא חתימה אלקטרונית (מתאים לתשלום במזומן או לקוחות ללא הסכמה אלקטרונית מראש)'
                          : 'מסמך ממוחשב — נדרשת חתימה אלקטרונית, הסכמת לקוח בכתב (סעיף 18ב(ג)) ואמצעי תשלום מורשים (סעיף 18ב(ד))'}
                      </span>
                    </div>
                    <div className="flex items-center gap-1.5 p-1 bg-white rounded-xl border border-warm-200 shrink-0 self-start sm:self-auto">
                      <button
                        type="button"
                        onClick={() => setIsPaperReceipt(false)}
                        className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
                          !isPaperReceipt
                            ? 'bg-[#BC796F] text-white shadow-sm'
                            : 'text-warm-700 hover:text-warm-950'
                        }`}
                      >
                        מסמך ממוחשב (אלקטרוני)
                      </button>
                      <button
                        type="button"
                        onClick={() => setIsPaperReceipt(true)}
                        className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
                          isPaperReceipt
                            ? 'bg-warm-800 text-white shadow-sm'
                            : 'text-warm-700 hover:text-warm-950'
                        }`}
                      >
                        קבלה מודפסת (מסלול נייר)
                      </button>
                    </div>
                  </div>

                  {/* Payment Methods List */}
                  <div className="flex flex-col gap-3">
                    <div className="flex items-center justify-between">
                      <label className="text-xs font-bold text-warm-900 flex items-center gap-1.5">
                        <span>אמצעי תשלום שהתקבלו</span>
                        <span className="text-[11px] font-normal text-warm-600">(לפחות אמצעי אחד)</span>
                      </label>
                      <button
                        type="button"
                        onClick={() => {
                          setPaymentMethods(prev => [
                            ...prev,
                            {
                              id: 'pm_' + Date.now(),
                              type: 'bank_transfer',
                              amount: 0,
                            }
                          ]);
                        }}
                        className="flex items-center gap-1 text-xs font-bold text-[#88463F] hover:text-[#BC796F] transition-colors"
                      >
                        <Plus className="w-3.5 h-3.5" />
                        <span>הוסף אמצעי תשלום</span>
                      </button>
                    </div>

                    <div className="space-y-3">
                      {paymentMethods.map((pm, idx) => (
                        <div key={pm.id || idx} className="p-3.5 rounded-xl bg-white/80 border border-[#BC796F]/20 flex flex-col gap-3">
                          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 items-center">
                            {/* Method Type */}
                            <div className="flex flex-col gap-1">
                              <span className="text-[11px] font-semibold text-warm-700">סוג תשלום</span>
                              <CustomSelect
                                value={pm.type}
                                onChange={(val) => {
                                  const newType = val as PaymentMethodType;
                                  setPaymentMethods(prev => prev.map((m, i) => i === idx ? { ...m, type: newType } : m));
                                }}
                                options={[
                                  { value: 'bank_transfer', label: 'העברה בנקאית' },
                                  { value: 'credit_card', label: 'כרטיס אשראי' },
                                  { value: 'check', label: 'המחאה (צ\'ק)' },
                                  { value: 'cash', label: 'מזומן' },
                                  { value: 'other', label: 'אחר / ביט / PayBox' },
                                ]}
                                triggerClassName="h-10 bg-white"
                              />
                            </div>

                            {/* Amount */}
                            <div className="flex flex-col gap-1">
                              <div className="flex items-center justify-between">
                                <span className="text-[11px] font-semibold text-warm-700">סכום (₪)</span>
                                {calculatedTotals.totalAmount > 0 && (
                                  <button
                                    type="button"
                                    onClick={() => {
                                      setPaymentMethods(prev => prev.map((m, i) => i === idx ? { ...m, amount: calculatedTotals.totalAmount } : m));
                                    }}
                                    className="text-[10px] text-[#88463F] hover:underline"
                                  >
                                    התאם לסך הקבלה
                                  </button>
                                )}
                              </div>
                              <input
                                type="number"
                                min="0"
                                step="0.01"
                                value={pm.amount || ''}
                                onChange={e => {
                                  const val = parseFloat(e.target.value) || 0;
                                  setPaymentMethods(prev => prev.map((m, i) => i === idx ? { ...m, amount: val } : m));
                                }}
                                placeholder="0.00"
                                className="w-full h-10 px-3 rounded-xl text-xs font-bold text-warm-900 bg-white border border-warm-200 focus:border-[#BC796F] tabular-nums"
                              />
                            </div>

                            {/* Remove button */}
                            <div className="flex items-center justify-end sm:pt-4">
                              {paymentMethods.length > 1 && (
                                <button
                                  type="button"
                                  onClick={() => {
                                    setPaymentMethods(prev => prev.filter((_, i) => i !== idx));
                                  }}
                                  className="p-2 text-warm-500 hover:text-red-700 rounded-lg transition-colors"
                                  title="הסר אמצעי תשלום"
                                >
                                  <Trash2 className="w-4 h-4" />
                                </button>
                              )}
                            </div>
                          </div>

                          {/* Type-specific inputs */}
                          {pm.type === 'bank_transfer' && (
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2 border-t border-warm-100">
                              <input
                                type="text"
                                placeholder="שם בנק מעביר"
                                value={pm.bankName || ''}
                                onChange={e => {
                                  const val = e.target.value;
                                  setPaymentMethods(prev => prev.map((m, i) => i === idx ? { ...m, bankName: val } : m));
                                }}
                                className="h-9 px-3 rounded-xl text-xs bg-white text-warm-900 border border-warm-200"
                              />
                              <input
                                type="text"
                                placeholder="מספר אסמכתא / העברה בנקאית (ראיה מוסדית תומכת)"
                                value={pm.referenceNumber || ''}
                                onChange={e => {
                                  const val = e.target.value;
                                  setPaymentMethods(prev => prev.map((m, i) => i === idx ? { ...m, referenceNumber: val } : m));
                                }}
                                className="h-9 px-3 rounded-xl text-xs bg-white text-warm-900 border border-warm-200"
                              />
                              <div className="sm:col-span-2 pt-1">
                                <label className="flex items-center gap-2 text-xs text-warm-800 cursor-pointer">
                                  <input
                                    type="checkbox"
                                    checked={pm.isDirectTransferConfirmed || false}
                                    onChange={e => {
                                      const checked = e.target.checked;
                                      setPaymentMethods(prev => prev.map((m, i) => i === idx ? { ...m, isDirectTransferConfirmed: checked } : m));
                                    }}
                                    className="w-4 h-4 rounded text-[#BC796F] focus:ring-[#BC796F]"
                                  />
                                  <span className="text-[11px] font-medium text-warm-900">
                                    אישור מתועד ע״י המשתמש: הכספים הועברו ישירות מחשבון הלקוח לחשבון העסק הרשמי במערכת (סעיף 18ב(ד))
                                  </span>
                                </label>
                              </div>
                            </div>
                          )}

                          {pm.type === 'credit_card' && (
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2 border-t border-warm-100">
                              <input
                                type="text"
                                maxLength={4}
                                dir="ltr"
                                placeholder="4 ספרות אחרונות בלבד"
                                value={pm.cardLast4 || ''}
                                onChange={e => {
                                  const val = e.target.value.replace(/\D/g, '').slice(0, 4);
                                  setPaymentMethods(prev => prev.map((m, i) => i === idx ? { ...m, cardLast4: val } : m));
                                }}
                                className="h-9 px-3 rounded-xl text-xs bg-white text-warm-900 border border-warm-200 text-left font-mono"
                              />
                              <input
                                type="text"
                                placeholder="מספר שובר / אישור עסקה"
                                value={pm.transactionReference || ''}
                                onChange={e => {
                                  const val = e.target.value;
                                  setPaymentMethods(prev => prev.map((m, i) => i === idx ? { ...m, transactionReference: val } : m));
                                }}
                                className="h-9 px-3 rounded-xl text-xs bg-white text-warm-900 border border-warm-200"
                              />
                            </div>
                          )}

                          {pm.type === 'check' && (
                            <div className="grid grid-cols-1 sm:grid-cols-4 gap-3 pt-2 border-t border-warm-100">
                              <input
                                type="text"
                                placeholder="מספר המחאה (חובה) *"
                                value={pm.checkNumber || ''}
                                onChange={e => {
                                  const val = e.target.value;
                                  setPaymentMethods(prev => prev.map((m, i) => i === idx ? { ...m, checkNumber: val } : m));
                                }}
                                className="h-9 px-3 rounded-xl text-xs bg-white text-warm-900 border border-warm-200"
                              />
                              <input
                                type="text"
                                placeholder="שם/קוד בנק"
                                value={pm.checkBank || ''}
                                onChange={e => {
                                  const val = e.target.value;
                                  setPaymentMethods(prev => prev.map((m, i) => i === idx ? { ...m, checkBank: val } : m));
                                }}
                                className="h-9 px-3 rounded-xl text-xs bg-white text-warm-900 border border-warm-200"
                              />
                              <input
                                type="text"
                                placeholder="סניף"
                                value={pm.checkBranch || ''}
                                onChange={e => {
                                  const val = e.target.value;
                                  setPaymentMethods(prev => prev.map((m, i) => i === idx ? { ...m, checkBranch: val } : m));
                                }}
                                className="h-9 px-3 rounded-xl text-xs bg-white text-warm-900 border border-warm-200"
                              />
                              <input
                                type="date"
                                placeholder="תאריך פירעון"
                                value={pm.checkMaturityDate || ''}
                                onChange={e => {
                                  const val = e.target.value;
                                  setPaymentMethods(prev => prev.map((m, i) => i === idx ? { ...m, checkMaturityDate: val } : m));
                                }}
                                className="h-9 px-3 rounded-xl text-xs bg-white text-warm-900 border border-warm-200"
                              />

                              <div className="sm:col-span-4 flex flex-wrap gap-4 pt-1 bg-warm-50/70 p-2.5 rounded-xl border border-warm-200/70">
                                <span className="w-full text-[11px] font-bold text-warm-900">
                                  אישורים מתועדים ע״י המשתמש לפי סעיף 18ב(ד) להוראות ניהול פנקסים:
                                </span>
                                <label className="flex items-center gap-1.5 text-xs text-warm-800 cursor-pointer">
                                  <input
                                    type="checkbox"
                                    checked={pm.checkIsCrossed || false}
                                    onChange={e => {
                                      const val = e.target.checked;
                                      setPaymentMethods(prev => prev.map((m, i) => i === idx ? { ...m, checkIsCrossed: val } : m));
                                    }}
                                    className="w-4 h-4 rounded text-[#BC796F] focus:ring-[#BC796F]"
                                  />
                                  <span className="text-[11px]">ההמחאה משורטטת (//)</span>
                                </label>
                                <label className="flex items-center gap-1.5 text-xs text-warm-800 cursor-pointer">
                                  <input
                                    type="checkbox"
                                    checked={pm.checkIsNonNegotiable || false}
                                    onChange={e => {
                                      const val = e.target.checked;
                                      setPaymentMethods(prev => prev.map((m, i) => i === idx ? { ...m, checkIsNonNegotiable: val } : m));
                                    }}
                                    className="w-4 h-4 rounded text-[#BC796F] focus:ring-[#BC796F]"
                                  />
                                  <span className="text-[11px]">מסומנת ״למוטב בלבד״ / לא סחירה</span>
                                </label>
                                <label className="flex items-center gap-1.5 text-xs text-warm-800 cursor-pointer">
                                  <input
                                    type="checkbox"
                                    checked={pm.checkIsPayableToBusinessOnly || false}
                                    onChange={e => {
                                      const val = e.target.checked;
                                      setPaymentMethods(prev => prev.map((m, i) => i === idx ? { ...m, checkIsPayableToBusinessOnly: val } : m));
                                    }}
                                    className="w-4 h-4 rounded text-[#BC796F] focus:ring-[#BC796F]"
                                  />
                                  <span className="text-[11px]">לפקודת העסק הרשמי בלבד</span>
                                </label>
                              </div>
                            </div>
                          )}

                          {pm.type === 'other' && (
                            <div className="flex flex-col gap-2 pt-2 border-t border-warm-100">
                              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                <input
                                  type="text"
                                  placeholder="תיאור (לדוגמה: ביט / פייבוקס / אחר)"
                                  value={pm.otherDescription || ''}
                                  onChange={e => {
                                    const val = e.target.value;
                                    setPaymentMethods(prev => prev.map((m, i) => i === idx ? { ...m, otherDescription: val } : m));
                                  }}
                                  className="h-9 px-3 rounded-xl text-xs bg-white text-warm-900 border border-warm-200"
                                />
                                <input
                                  type="text"
                                  placeholder="מספר מזהה / אסמכתא (ראיה תומכת)"
                                  value={pm.referenceNumber || pm.transactionReference || ''}
                                  onChange={e => {
                                    const val = e.target.value;
                                    setPaymentMethods(prev => prev.map((m, i) => i === idx ? { ...m, referenceNumber: val, transactionReference: val } : m));
                                  }}
                                  className="h-9 px-3 rounded-xl text-xs bg-white text-warm-900 border border-warm-200"
                                />
                              </div>
                              <div className="p-2.5 rounded-xl bg-amber-50 border border-amber-200 text-amber-900 text-[11px] leading-relaxed">
                                <strong>חסום לחתימה מאובטחת (סעיף 18ב(ד)):</strong> יישומי תשלום (ביט / פייבוקס) ואמצעי תשלום אחרים חסומים למשלוח דיגיטלי בחתימה מאובטחת עד לאימות תהליך סליקה מוסדי ייעודי או שימוש בחתימה מאושרת. עבור אמצעי זה יש לעבור ל<strong>קבלה מודפסת (מסלול נייר)</strong> בראש הטופס.
                              </div>
                            </div>
                          )}
                        </div>
                      ))}
                    </div>

                    {/* Methods Total vs Receipt Total reconciliation */}
                    {(() => {
                      const methodsTotal = paymentMethods.reduce((sum, m) => sum + (Number(m.amount) || 0), 0);
                      const diff = methodsTotal - calculatedTotals.totalAmount;
                      const isMatch = Math.abs(diff) < 0.01;
                      return (
                        <div className={`p-3 rounded-xl text-xs flex items-center justify-between border ${
                          isMatch 
                            ? 'bg-emerald-50/80 border-emerald-300 text-emerald-900' 
                            : 'bg-amber-50/80 border-amber-300 text-amber-900'
                        }`}>
                          <span className="font-semibold">
                            {isMatch 
                              ? '✓ סכום אמצעי התשלום תואם בדיוק לסך הקבלה' 
                              : diff > 0 
                                ? `סכום אמצעי התשלום עודף ב-${diff.toFixed(2)} ₪ מסך הקבלה` 
                                : `סכום אמצעי התשלום חסר ב-${Math.abs(diff).toFixed(2)} ₪ מסך הקבלה`}
                          </span>
                          <div className="flex items-center gap-2">
                            <span className="tabular-nums font-bold">
                              {methodsTotal.toFixed(2)} ₪ מתוך {calculatedTotals.totalAmount.toFixed(2)} ₪
                            </span>
                            {!isMatch && (
                              <button
                                type="button"
                                onClick={() => {
                                  if (paymentMethods.length > 0) {
                                    setPaymentMethods(prev => prev.map((m, i) => i === 0 ? { ...m, amount: calculatedTotals.totalAmount } : m));
                                  }
                                }}
                                className="px-2 py-0.5 rounded-lg bg-warm-900 text-white text-[11px] font-bold hover:bg-warm-800 transition-colors"
                              >
                                התאם אוטומטית
                              </button>
                            )}
                          </div>
                        </div>
                      );
                    })()}
                  </div>

                  {/* Allocations to open payment requests */}
                  {(() => {
                    const openRequests = documents.filter(d => 
                      d.type === 'payment_request' && 
                      d.clientId === clientId && 
                      (d.status === 'issued' || d.status === 'partially_paid') &&
                      (d.remainingBalance !== undefined ? d.remainingBalance > 0 : d.totalAmount > 0)
                    );
                    if (openRequests.length === 0) return null;

                    return (
                      <div className="pt-3 border-t border-[#BC796F]/15 flex flex-col gap-2.5">
                        <div className="flex items-center gap-2">
                          <Link2 className="w-4 h-4 text-[#BC796F]" />
                          <div>
                            <span className="text-xs font-bold text-warm-900 block">שיוך וסילוק חשבון עסקה קיים</span>
                            <span className="text-[11px] text-[#7D5A56]">סימון חשבונות שהקבלה מסלקת או משלמת על חשבונם</span>
                          </div>
                        </div>
                        <div className="space-y-2">
                          {openRequests.map(req => {
                            const allocation = paymentAllocations.find(a => a.paymentRequestId === req.id);
                            const isAllocated = !!allocation;
                            const rem = req.remainingBalance ?? req.totalAmount;

                            return (
                              <div key={req.id} className="p-3 rounded-xl bg-white/70 border border-warm-200 flex flex-wrap items-center justify-between text-xs gap-2">
                                <label className="flex items-center gap-2.5 cursor-pointer">
                                  <input
                                    type="checkbox"
                                    checked={isAllocated}
                                    onChange={e => {
                                      if (e.target.checked) {
                                        setPaymentAllocations(prev => [
                                          ...prev.filter(a => a.paymentRequestId !== req.id),
                                          {
                                            paymentRequestId: req.id,
                                            allocatedAmount: Math.min(rem, calculatedTotals.totalAmount),
                                          }
                                        ]);
                                      } else {
                                        setPaymentAllocations(prev => prev.filter(a => a.paymentRequestId !== req.id));
                                      }
                                    }}
                                    className="w-4 h-4 text-[#BC796F] rounded"
                                  />
                                  <div>
                                    <span className="font-bold text-warm-900">חשבון עסקה מס' {req.documentNumber || req.id}</span>
                                    <span className="text-[11px] text-[#7D5A56] mr-2">
                                      (יתרה פתוחה לתשלום: {rem.toFixed(2)} ₪)
                                    </span>
                                  </div>
                                </label>

                                {isAllocated && (
                                  <div className="flex items-center gap-2">
                                    <span className="text-[11px] text-[#7D5A56]">סכום להקצאה:</span>
                                    <input
                                      type="number"
                                      min="0"
                                      max={rem}
                                      step="0.01"
                                      value={allocation?.allocatedAmount || ''}
                                      onChange={e => {
                                        const val = parseFloat(e.target.value) || 0;
                                        setPaymentAllocations(prev => prev.map(a => 
                                          a.paymentRequestId === req.id ? { ...a, allocatedAmount: Math.min(rem, val) } : a
                                        ));
                                      }}
                                      className="w-24 h-8 px-2 rounded-lg text-xs font-bold text-warm-900 bg-white border border-warm-200 text-center tabular-nums"
                                    />
                                    <span>₪</span>
                                  </div>
                                )}
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    );
                  })()}
                </div>
              )}

              {/* Quote-Specific Fields */}
              {docType === 'quote' && (
                <div className="p-5 sm:p-6 rounded-2xl bg-white/65 backdrop-blur-md border border-white/85 shadow-[0_4px_20px_-4px_rgba(188,121,111,0.06)] flex flex-col gap-4">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="flex flex-col gap-1.5">
                      <label className="text-xs font-bold text-warm-900">נושא הצעת המחיר *</label>
                      <input
                        type="text"
                        value={quoteTitle}
                        onChange={e => setQuoteTitle(e.target.value)}
                        placeholder="לדוגמה: עיצוב זהות מותג ומערכת שפה חזותית"
                        className="w-full h-11 px-4 rounded-xl text-sm font-medium text-warm-900 liquid-glass-input focus:bg-white"
                      />
                    </div>

                    <div className="flex flex-col gap-1.5">
                      <label className="text-xs font-bold text-warm-900">תוקף ההצעה (ימים)</label>
                      <div className="flex items-center gap-3">
                        <input
                          type="number"
                          min="1"
                          max="180"
                          value={quoteValidityDays}
                          onChange={e => setQuoteValidityDays(Number(e.target.value) || 14)}
                          className="w-24 h-11 px-3 rounded-xl text-sm font-bold text-warm-900 liquid-glass-input text-center tabular-nums focus:bg-white"
                        />
                        <span className="text-xs text-warm-700 font-medium">
                          תקף עד: <strong className="text-warm-950 font-bold">{validUntilDate}</strong>
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Scope & Deliverables */}
                  <div className="flex flex-col gap-1.5">
                    <label className="text-xs font-bold text-warm-900">פירוט היקף העבודה ותוצרים (Scope)</label>
                    <textarea
                      rows={2}
                      value={scopeAndDeliverables}
                      onChange={e => setScopeAndDeliverables(e.target.value)}
                      placeholder="פירוט שלבי העבודה, שלבי מסירה, קבצי מקור שיועברו וכו'..."
                      className="w-full p-3.5 rounded-2xl text-xs font-medium text-warm-900 liquid-glass-input resize-y focus:bg-white"
                    />
                  </div>
                </div>
              )}

              {/* Line Items Section */}
              <div className="flex flex-col gap-3.5">
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-bold text-warm-950 flex items-center gap-1.5">
                    <span>פירוט סעיפי המסמך</span>
                    <span className="text-xs text-warm-500 font-normal">({lineItems.length})</span>
                  </h3>

                  <button
                    type="button"
                    onClick={handleAddLineItem}
                    className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-bold text-white bg-[#BC796F] hover:bg-[#A46A69] transition-all shadow-sm active:scale-95"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    <span>הוסף סעיף</span>
                  </button>
                </div>

                {/* Line Items Table */}
                <div className="overflow-x-auto rounded-2xl border border-white/85 bg-white/70 shadow-xs">
                  <table className="w-full text-right text-xs">
                    <thead>
                      <tr className="bg-white/90 border-b border-[#BC796F]/15 text-[#6D403D] font-bold">
                        <th className="py-3 px-3.5 w-10 text-center">#</th>
                        <th className="py-3 px-3.5">תיאור השירות / הפריט *</th>
                        <th className="py-3 px-3.5 w-24">יחידה</th>
                        <th className="py-3 px-3.5 w-24">כמות</th>
                        <th className="py-3 px-3.5 w-32">מחיר יח׳ ({businessSettings.currency})</th>
                        <th className="py-3 px-3.5 w-24">הנחה %</th>
                        <th className="py-3 px-3.5 w-32 text-left">סה״כ ({businessSettings.currency})</th>
                        <th className="py-3 px-2 w-10 text-center"></th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-white/60">
                      {lineItems.map((item, index) => (
                        <tr key={item.id} className="hover:bg-white/50 transition-colors">
                          <td className="py-2.5 px-3.5 text-center text-warm-500 font-bold">
                            {index + 1}
                          </td>

                          <td className="py-2.5 px-3.5">
                            <input
                              type="text"
                              value={item.description}
                              onChange={e => handleUpdateLineItem(item.id, { description: e.target.value })}
                              placeholder="תיאור העבודה או המוצר..."
                              className="w-full h-10 px-3 rounded-xl liquid-glass-input text-xs text-warm-900 focus:bg-white transition-all font-medium"
                            />
                          </td>

                          <td className="py-2.5 px-3.5">
                            <CustomSelect
                              value={item.unit}
                              onChange={val => handleUpdateLineItem(item.id, { unit: val })}
                              options={[
                                { value: 'שעות', label: 'שעות' },
                                { value: 'יחידות', label: 'יחידות' },
                                { value: 'ימים', label: 'ימים' },
                                { value: 'חודש', label: 'חודש' },
                                { value: 'פרויקט', label: 'פרויקט' },
                              ]}
                              triggerClassName="h-10 bg-white/80"
                            />
                          </td>

                          <td className="py-2.5 px-3.5">
                            <input
                              type="number"
                              min="0.1"
                              step="0.5"
                              value={item.quantity}
                              onChange={e => handleUpdateLineItem(item.id, { quantity: Number(e.target.value) || 0 })}
                              className="w-full h-10 px-3 rounded-xl text-xs font-bold text-warm-950 bg-white/80 border border-white/90 focus:border-[#BC796F] focus:bg-white text-center tabular-nums"
                            />
                          </td>

                          <td className="py-2.5 px-3.5">
                            <input
                              type="number"
                              min="0"
                              step="10"
                              dir="ltr"
                              value={item.unitPrice}
                              onChange={e => handleUpdateLineItem(item.id, { unitPrice: Number(e.target.value) || 0 })}
                              className="w-full h-10 px-3 rounded-xl text-xs font-bold text-warm-950 bg-white/80 border border-white/90 focus:border-[#BC796F] focus:bg-white text-right tabular-nums"
                            />
                          </td>

                          <td className="py-2.5 px-3.5">
                            <input
                              type="number"
                              min="0"
                              max="100"
                              value={item.discount || 0}
                              onChange={e => handleUpdateLineItem(item.id, { discount: Number(e.target.value) || 0 })}
                              className="w-full h-10 px-2 rounded-xl text-xs font-bold text-warm-950 bg-white/80 border border-white/90 focus:border-[#BC796F] focus:bg-white text-center tabular-nums"
                            />
                          </td>

                          <td className="py-2.5 px-3.5 text-left font-black text-warm-950 tabular-nums text-sm">
                            {formatCurrency(item.lineTotal, '')}
                          </td>

                          <td className="py-2.5 px-2 text-center">
                            <button
                              type="button"
                              onClick={() => handleRemoveLineItem(item.id)}
                              className="p-1.5 rounded-lg text-warm-400 hover:text-red-600 hover:bg-white/80 transition-colors"
                              title="מחק שורה"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Bottom Row: Notes & Totals Summary */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6 items-start">
                {/* Notes and Terms Textarea */}
                <div className="flex flex-col gap-1.5">
                  <label className="text-xs font-bold text-warm-900">הערות ותנאים למסמך</label>
                  <textarea
                    rows={4}
                    value={notes}
                    onChange={e => setNotes(e.target.value)}
                    placeholder="הערות שיופיעו בתחתית המסמך..."
                    className="w-full p-4 rounded-2xl text-xs font-medium text-warm-900 liquid-glass-input resize-y focus:bg-white"
                  />
                </div>

                {/* Totals Summary Card */}
                <div className="p-6 rounded-2xl bg-gradient-to-br from-white/90 via-[#FFF8F5]/85 to-[#FCEEEA]/75 border border-white/90 shadow-[0_6px_28px_-4px_rgba(188,121,111,0.12)] flex flex-col gap-3.5">
                  <div className="flex items-center justify-between text-xs text-warm-800">
                    <span className="font-medium">סכום ביניים:</span>
                    <span className="font-bold tabular-nums">
                      {formatCurrency(calculatedTotals.subtotal, businessSettings.currency)}
                    </span>
                  </div>

                  {calculatedTotals.discountTotal > 0 && (
                    <div className="flex items-center justify-between text-xs text-emerald-800">
                      <span className="font-medium">הנחה כוללת:</span>
                      <span className="font-bold tabular-nums">
                        -{formatCurrency(calculatedTotals.discountTotal, businessSettings.currency)}
                      </span>
                    </div>
                  )}

                  {businessSettings.businessType !== 'exempt' && (
                    <div className="flex items-center justify-between text-xs text-warm-800">
                      <span className="font-medium">מע״מ ({businessSettings.vatRate * 100}%):</span>
                      <span className="font-bold tabular-nums">
                        {formatCurrency(calculatedTotals.vatTotal, businessSettings.currency)}
                      </span>
                    </div>
                  )}

                  <div className="pt-3.5 border-t border-[#BC796F]/20 flex items-center justify-between">
                    <span className="text-sm font-bold text-warm-950">
                      {docType === 'receipt' ? 'סה״כ התקבל:' : docType === 'payment_request' ? 'סה״כ לתשלום:' : 'סה״כ:'}
                    </span>
                    <span className="text-2xl font-black text-[#88463F] tabular-nums">
                      {formatCurrency(calculatedTotals.totalAmount, businessSettings.currency)}
                    </span>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Footer Actions */}
        <div className="px-7 py-4 border-t border-[#BC796F]/15 bg-white/60 backdrop-blur-md flex items-center justify-between shrink-0 print-hide print:hidden">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2.5 rounded-xl text-xs font-semibold text-warm-800 hover:text-warm-950 hover:bg-white/60 transition-colors"
          >
            ביטול
          </button>

          <div className="flex items-center gap-3">
            <button
              type="button"
              disabled={isSubmitting}
              onClick={handleSaveDraft}
              className="flex items-center gap-1.5 px-5 py-2.5 rounded-xl text-xs font-bold text-warm-900 bg-white/85 hover:bg-white border border-warm-200/80 shadow-xs transition-all active:scale-95 disabled:opacity-50"
            >
              <Save className="w-3.5 h-3.5 text-[#BC796F]" />
              <span>שמור טיוטה</span>
            </button>

            <button
              type="button"
              disabled={isSubmitting}
              onClick={handleIssue}
              className="flex items-center gap-2 px-6 py-2.5 rounded-xl text-xs font-bold text-white liquid-glass-btn-primary shadow-md active:scale-95 transition-all disabled:opacity-50"
            >
              <Send className="w-3.5 h-3.5" />
              <span>{isTestMode ? 'הפק מסמך בדיקה' : 'הפק מסמך רשמי'}</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
