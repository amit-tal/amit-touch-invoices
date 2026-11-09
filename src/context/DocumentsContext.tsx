import React, { createContext, useContext, useState, useEffect, useCallback, useMemo } from 'react';
import type { 
  AppDocument, 
  SequenceSettings, 
  BusinessSettings, 
  AuditLogEntry, 
  ReceiptPaymentMethod,
  PaymentAllocation,
  ComplianceBlockers
} from '../types/documents';
import { useApp } from './AppContext';
import { 
  generateTimeBillingDocumentData,
  type TimeBillingLayoutMode 
} from '../utils/timeBillingUtils';
import { calculateDueDate, safeAdd, safeSubtract } from '../utils/moneyUtils';

interface DocumentsContextType {
  documents: AppDocument[];
  sequences: SequenceSettings;
  businessSettings: BusinessSettings;
  auditLogs: AuditLogEntry[];
  isTestMode: boolean;
  setIsTestMode: (val: boolean) => void;
  isLoading: boolean;
  complianceBlockers: ComplianceBlockers;
  saveDraft: (doc: Partial<AppDocument>) => Promise<AppDocument>;
  deleteDraft: (docId: string) => Promise<boolean>;
  issueDocument: (documentId: string, options?: { isPaperReceipt?: boolean }) => Promise<{ success: boolean; document?: AppDocument; error?: string }>;
  cancelDocument: (documentId: string, reason: string) => Promise<boolean>;
  recordDelivery: (documentId: string, channel: 'email' | 'manual', recipient?: string, notes?: string) => Promise<boolean>;
  checkEmailProviderStatus: () => Promise<{
    isConfigured: boolean;
    provider: string;
    fromEmail?: string;
    fromName?: string;
    missingRequirements: string[];
    smtpHost?: string;
  }>;
  sendDocumentEmail: (params: {
    documentId: string;
    recipient: string;
    subject: string;
    messageBody: string;
    isReminder?: boolean;
  }) => Promise<{ success: boolean; error?: string; document?: AppDocument }>;
  recordManualDelivery: (params: {
    documentId: string;
    manualMethod: 'whatsapp' | 'in_person' | 'courier' | 'other';
    recipient?: string;
    notes?: string;
    deliveredAt?: string;
  }) => Promise<boolean>;
  confirmDelivery: (params: {
    documentId: string;
    notes?: string;
  }) => Promise<boolean>;
  recordPaymentReceipt: (params: {
    paymentRequestId?: string;
    clientId: string;
    amount: number;
    paymentMethods: ReceiptPaymentMethod[];
    paymentReceivedDate: string;
    description: string;
    allocations?: PaymentAllocation[];
    isPaperReceipt?: boolean;
  }) => Promise<AppDocument>;
  convertQuoteToPaymentRequest: (quoteId: string) => Promise<AppDocument>;
  createDraftFromTimeEntries: (
    clientId: string,
    projectId: string | undefined,
    selectedEntryIds: string[],
    mode: TimeBillingLayoutMode,
    options?: {
      splitByRate?: boolean;
      manualNotes?: string;
    }
  ) => Promise<AppDocument>;
  updateBusinessSettings: (settings: Partial<BusinessSettings>) => Promise<void>;
  updateDraftWithLatestBusiness: (draftId: string) => Promise<AppDocument>;
  confirmProductionSequences: (params: { quoteNextStarting?: number }) => Promise<void>;
  downloadBackup: () => void;
  getBackupStatus: () => Promise<any>;
  validateBackup: (backupData: any) => Promise<any>;
  restoreBackup: (backupData: any) => Promise<any>;
  triggerAutoBackup: () => Promise<any>;
  sendPaymentReminder: (params: {
    documentId: string;
    recipient: string;
    subject: string;
    messageBody: string;
  }) => Promise<{ success: boolean; error?: string; document?: AppDocument }>;
  getBilledTimeEntryIds: () => Set<string>;
  isClientReferencedInIssuedDocs: (clientId: string) => boolean;
  isProjectReferencedInIssuedDocs: (projectId: string) => boolean;
  refreshDocuments: () => Promise<void>;
}

const DocumentsContext = createContext<DocumentsContextType | undefined>(undefined);

const BUSINESS_STORAGE_KEY = 'amit_business_settings';
const DOCUMENTS_STORAGE_KEY = 'amit_documents_cache';
const SEQUENCES_STORAGE_KEY = 'amit_sequences_cache';

const DEFAULT_BUSINESS_SETTINGS: BusinessSettings = {
  legalName: 'אמית טאץ׳ בע״מ',
  tradingName: 'AMIT TOUCH',
  businessNumber: '515234567',
  businessType: 'licensed',
  address: 'הברזל 24, רמת החייל, תל אביב',
  phone: '03-6821456',
  email: 'contact@amittouch.co.il',
  logoUrl: '/amit-touch-logo.png',
  signatureUrl: '/signiture.png',
  currency: '₪',
  bankDetails: {
    bankName: 'בנק הפועלים (12)',
    branch: '610 — רמת החייל',
    accountNumber: '489201',
    accountName: 'אמית טאץ׳ סטודיו לעיצוב בע״מ',
  },
  defaultPaymentTerms: 'שוטף + 30',
  defaultQuoteValidityDays: 14,
  defaultNotes: 'תודה על שיתוף הפעולה. תנאי תשלום כפי שצוין בדרישה זו.',
  vatRate: 0.18,
  isConfigured: true,
};

export const DocumentsProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { clients, projects, entries, settings, showToast } = useApp();

  const [documents, setDocuments] = useState<AppDocument[]>(() => {
    try {
      const cached = localStorage.getItem(DOCUMENTS_STORAGE_KEY);
      if (cached) {
        const parsed = JSON.parse(cached);
        if (Array.isArray(parsed)) return parsed;
      }
    } catch {}
    return [];
  });
  const [sequences, setSequences] = useState<SequenceSettings>(() => {
    try {
      const cached = localStorage.getItem(SEQUENCES_STORAGE_KEY);
      if (cached) {
        const parsed = JSON.parse(cached);
        if (parsed && typeof parsed === 'object') return parsed;
      }
    } catch {}
    return {
      isProductionActive: false,
      paymentRequestNext: 40016,
      receiptNext: 250020,
      quoteNext: null,
      testSequenceNext: 1001,
      isLocked: false,
    };
  });
  const [businessSettings, setBusinessSettings] = useState<BusinessSettings>(() => {
    try {
      const cached = localStorage.getItem(BUSINESS_STORAGE_KEY);
      if (cached) {
        const parsed = JSON.parse(cached);
        if (parsed && typeof parsed === 'object') return parsed;
      }
    } catch (e) {
      console.error('Error reading cached business settings:', e);
    }
    return DEFAULT_BUSINESS_SETTINGS;
  });
  const [auditLogs, setAuditLogs] = useState<AuditLogEntry[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isTestMode, setIsTestMode] = useState(false);

  // Sync documents and sequences to client localStorage cache
  useEffect(() => {
    try {
      localStorage.setItem(DOCUMENTS_STORAGE_KEY, JSON.stringify(documents));
    } catch {}
  }, [documents]);

  useEffect(() => {
    try {
      localStorage.setItem(SEQUENCES_STORAGE_KEY, JSON.stringify(sequences));
    } catch {}
  }, [sequences]);

  // Fetch all documents from server API
  const refreshDocuments = useCallback(async () => {
    try {
      const res = await fetch('/api/documents');
      if (res.ok) {
        const data = await res.json();
        if (Array.isArray(data.documents)) {
          setDocuments(data.documents);
        }
        if (data.sequences) setSequences(data.sequences);
        if (data.business) {
          setBusinessSettings(data.business);
          try {
            localStorage.setItem(BUSINESS_STORAGE_KEY, JSON.stringify(data.business));
          } catch (e) {}
        }
        if (data.audit) setAuditLogs(data.audit);
      }
    } catch (err) {
      console.error('Error fetching documents from server:', err);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    refreshDocuments();
  }, [refreshDocuments]);

  // Set of all billed time entry IDs from issued documents
  const billedTimeEntryIds = useMemo(() => {
    const set = new Set<string>();
    documents.forEach(doc => {
      if (doc.status !== 'draft' && doc.status !== 'canceled' && doc.billedTimeEntryIds) {
        doc.billedTimeEntryIds.forEach(id => set.add(id));
      }
    });
    return set;
  }, [documents]);

  const getBilledTimeEntryIds = useCallback(() => {
    return billedTimeEntryIds;
  }, [billedTimeEntryIds]);

  // Check if a client or project is referenced in issued documents (must NOT be deleted, only archived)
  const isClientReferencedInIssuedDocs = useCallback((clientId: string) => {
    return documents.some(d => d.clientId === clientId && d.status !== 'draft');
  }, [documents]);

  const isProjectReferencedInIssuedDocs = useCallback((projectId: string) => {
    return documents.some(d => d.projectId === projectId && d.status !== 'draft');
  }, [documents]);

  // Save or update draft document
  const saveDraft = async (docData: Partial<AppDocument>): Promise<AppDocument> => {
    try {
      const client = clients.find(c => c.id === docData.clientId);
      const project = projects.find(p => p.id === docData.projectId);

      const draftPayload: Partial<AppDocument> = {
        ...docData,
        clientName: client?.name || docData.clientName || 'לקוח ללא שם',
        clientBusinessNumber: client?.businessNumber || docData.clientBusinessNumber,
        projectName: project?.name || docData.projectName,
        currency: docData.currency || businessSettings.currency || '₪',
      };

      const res = await fetch('/api/documents/draft', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(draftPayload),
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || 'שגיאה בשמירת טיוטה');
      }

      const saved: AppDocument = await res.json();
      await refreshDocuments();
      showToast('הטיוטה נשמרה בהצלחה');
      return saved;
    } catch (err: any) {
      showToast(err.message || 'שגיאה בשמירת טיוטה');
      throw err;
    }
  };

  // Delete a draft document permanently
  const deleteDraft = async (docId: string): Promise<boolean> => {
    const doc = documents.find(d => d.id === docId);
    if (!doc) {
      showToast('טיוטת המסמך לא נמצאה');
      return false;
    }
    if (doc.status !== 'draft') {
      showToast('לא ניתן למחוק מסמך שהופק רשמית. מסמכים רשמיים ניתן לבטל בלבד.');
      return false;
    }

    try {
      const res = await fetch('/api/documents/draft/delete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ documentId: docId }),
      });

      if (!res.ok) {
        const errJson = await res.json().catch(() => ({}));
        throw new Error(errJson.error || 'שגיאה במחיקת הטיוטה מהשרת');
      }

      // Persist in local state after server confirms
      setDocuments(prev => prev.filter(d => d.id !== docId));
      showToast('הטיוטה נמחקה בהצלחה');
      return true;
    } catch (err: any) {
      console.error('Error deleting draft:', err);
      showToast(err.message || 'שגיאה במחיקת הטיוטה');
      return false;
    }
  };

  // Atomic issuance of official document
  const issueDocument = async (
    documentId: string,
    options?: { isPaperReceipt?: boolean }
  ): Promise<{ success: boolean; document?: AppDocument; error?: string }> => {
    try {
      const idempotencyKey = `issue_${documentId}_${Date.now()}`;
      const res = await fetch('/api/documents/issue', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          documentId,
          idempotencyKey,
          isTestMode,
          isPaperReceipt: options?.isPaperReceipt,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        showToast(data.error || 'שגיאה בהפקת המסמך');
        return { success: false, error: data.error };
      }

      await refreshDocuments();
      showToast(`המסמך הופק בהצלחה! מספר מסמך: ${data.documentNumber}`);
      return { success: true, document: data };
    } catch (err: any) {
      showToast(err.message || 'שגיאה בהפקת המסמך');
      return { success: false, error: err.message };
    }
  };

  // Traceable cancellation
  const cancelDocument = async (documentId: string, reason: string): Promise<boolean> => {
    if (!reason.trim()) {
      showToast('יש להזין סיבת ביטול מפורטת');
      return false;
    }

    try {
      const res = await fetch('/api/documents/cancel', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ documentId, reason: reason.trim() }),
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || 'שגיאה בביטול המסמך');
      }

      await refreshDocuments();
      showToast('המסמך בוטל ונרשם ביומן הפעולות');
      return true;
    } catch (err: any) {
      showToast(err.message || 'שגיאה בביטול המסמך');
      return false;
    }
  };

  // Check email provider status
  const checkEmailProviderStatus = async () => {
    try {
      const res = await fetch('/api/documents/email-provider-status');
      if (res.ok) {
        return await res.json();
      }
      return { isConfigured: false, provider: 'none', missingRequirements: ['שגיאה בתקשורת עם השרת'] };
    } catch {
      return { isConfigured: false, provider: 'none', missingRequirements: ['שגיאה בתקשורת עם השרת'] };
    }
  };

  // Send document email with PDF attachment
  const sendDocumentEmail = async (params: {
    documentId: string;
    recipient: string;
    subject: string;
    messageBody: string;
    isReminder?: boolean;
  }): Promise<{ success: boolean; error?: string; document?: AppDocument }> => {
    try {
      const res = await fetch('/api/documents/send-email', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(params),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'שגיאה בשליחת הדוא״ל');
      }

      await refreshDocuments();
      showToast('המסמך נשלח בהצלחה לספק הדוא״ל');
      return { success: true, document: data.document };
    } catch (err: any) {
      const errMsg = err.message || 'שגיאה בשליחת הדוא״ל';
      showToast(errMsg);
      await refreshDocuments();
      return { success: false, error: errMsg };
    }
  };

  // Record manual delivery
  const recordManualDelivery = async (params: {
    documentId: string;
    manualMethod: 'whatsapp' | 'in_person' | 'courier' | 'other';
    recipient?: string;
    notes?: string;
    deliveredAt?: string;
  }): Promise<boolean> => {
    try {
      const res = await fetch('/api/documents/delivery-manual', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(params),
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || 'שגיאה ברישום מסירה ידנית');
      }

      await refreshDocuments();
      showToast('המסירה הידנית תועדה בהצלחה');
      return true;
    } catch (err: any) {
      showToast(err.message || 'שגיאה ברישום מסירה ידנית');
      return false;
    }
  };

  // Confirm delivery
  const confirmDelivery = async (params: {
    documentId: string;
    notes?: string;
  }): Promise<boolean> => {
    try {
      const res = await fetch('/api/documents/delivery-confirm', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(params),
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || 'שגיאה באישור מסירה');
      }

      await refreshDocuments();
      showToast('מסירת המסמך אושרה בהצלחה');
      return true;
    } catch (err: any) {
      showToast(err.message || 'שגיאה באישור מסירה');
      return false;
    }
  };

  // Record delivery (legacy fallback alias)
  const recordDelivery = async (
    documentId: string,
    channel: 'email' | 'manual',
    recipient?: string,
    notes?: string
  ): Promise<boolean> => {
    if (channel === 'manual') {
      return recordManualDelivery({
        documentId,
        manualMethod: 'other',
        recipient,
        notes,
      });
    }
    // For email, redirect to sendDocumentEmail with defaults if called
    const doc = documents.find(d => d.id === documentId);
    const result = await sendDocumentEmail({
      documentId,
      recipient: recipient || doc?.clientEmail || '',
      subject: `${doc?.type === 'payment_request' ? 'חשבון עסקה' : 'מסמך'} מס׳ ${doc?.documentNumber || ''}`,
      messageBody: notes || 'שלום, מצורף המסמך.',
    });
    return result.success;
  };

  // Record payment and create linked receipt
  const recordPaymentReceipt = async (params: {
    paymentRequestId?: string;
    clientId: string;
    amount: number;
    paymentMethods: ReceiptPaymentMethod[];
    paymentReceivedDate: string;
    description: string;
    allocations?: PaymentAllocation[];
    isPaperReceipt?: boolean;
  }): Promise<AppDocument> => {
    const client = clients.find(c => c.id === params.clientId);
    const linkedPr = params.paymentRequestId ? documents.find(d => d.id === params.paymentRequestId) : undefined;

    // Validate methods total matches amount
    const methodsSum = params.paymentMethods.reduce((s, m) => s + m.amount, 0);
    if (Math.abs(methodsSum - params.amount) > 0.01) {
      throw new Error(`סכום אמצעי התשלום (${methodsSum} ₪) אינו תואם לסכום הקבלה הכולל (${params.amount} ₪)`);
    }

    // Prepare allocations
    let finalAllocations = params.allocations || [];
    if (params.paymentRequestId && finalAllocations.length === 0) {
      finalAllocations = [{ paymentRequestId: params.paymentRequestId, allocatedAmount: params.amount }];
    }

    // Check for excess amount (unallocated customer payment)
    const totalAllocated = finalAllocations.reduce((s, a) => s + a.allocatedAmount, 0);
    const unallocated = Math.max(0, safeSubtract(params.amount, totalAllocated));

    const receiptDraft: Partial<AppDocument> = {
      type: 'receipt',
      status: 'draft',
      deliveryStatus: 'not_sent',
      date: new Date().toISOString().split('T')[0],
      paymentReceivedDate: params.paymentReceivedDate || new Date().toISOString().split('T')[0],
      clientId: params.clientId,
      clientName: client?.name || linkedPr?.clientName || 'לקוח ללא שם',
      clientBusinessNumber: client?.businessNumber || linkedPr?.clientBusinessNumber,
      currency: linkedPr?.currency || businessSettings.currency || '₪',
      lineItems: [
        {
          id: `line_receipt_${Date.now()}`,
          description: params.description || `קבלה על חשבון דרישת תשלום ${linkedPr?.documentNumber || ''}`,
          quantity: 1,
          unit: 'יחידה',
          unitPrice: params.amount,
          discount: 0,
          discountType: 'percent',
          isTaxable: false,
          lineTotal: params.amount,
        },
      ],
      subtotal: params.amount,
      discountTotal: 0,
      vatTotal: 0,
      totalAmount: params.amount,
      paidAmount: params.amount,
      remainingBalance: 0,
      paymentMethods: params.paymentMethods,
      paymentAllocations: finalAllocations,
      unallocatedAmount: unallocated,
      relatedDocumentIds: params.paymentRequestId ? [params.paymentRequestId] : [],
      notes: unallocated > 0 ? `לתשומת לב: תשלום ביתר בסך ${unallocated} ₪ נרשם כזכות ללקוח.` : undefined,
    };

    const savedDraft = await saveDraft(receiptDraft);
    // Issue the receipt automatically
    const issuedResult = await issueDocument(savedDraft.id, { isPaperReceipt: params.isPaperReceipt });
    if (!issuedResult.success || !issuedResult.document) {
      throw new Error(issuedResult.error || 'שגיאה בהפקת הקבלה');
    }

    return issuedResult.document;
  };

  // Convert Quote to Payment Request draft
  const convertQuoteToPaymentRequest = async (quoteId: string): Promise<AppDocument> => {
    const quote = documents.find(d => d.id === quoteId);
    if (!quote) throw new Error('הצעת מחיר לא נמצאה');

    const todayStr = new Date().toISOString().split('T')[0];
    const { dueDate, explanation } = calculateDueDate(todayStr, businessSettings.defaultPaymentTerms);

    const prDraft: Partial<AppDocument> = {
      type: 'payment_request',
      status: 'draft',
      deliveryStatus: 'not_sent',
      date: todayStr,
      dueDate,
      dueDateExplanation: explanation,
      clientId: quote.clientId,
      clientName: quote.clientName,
      clientBusinessNumber: quote.clientBusinessNumber,
      clientAddress: quote.clientAddress,
      clientEmail: quote.clientEmail,
      projectId: quote.projectId,
      projectName: quote.projectName,
      currency: quote.currency,
      lineItems: quote.lineItems.map(l => ({ ...l, id: `line_conv_${Date.now()}_${Math.random()}` })),
      subtotal: quote.subtotal,
      discountTotal: quote.discountTotal,
      vatTotal: quote.vatTotal,
      totalAmount: quote.totalAmount,
      paidAmount: 0,
      remainingBalance: quote.totalAmount,
      paymentTerms: businessSettings.defaultPaymentTerms,
      notes: `הופק על בסיס הצעת מחיר מס' ${quote.documentNumber || quote.id}.`,
      relatedDocumentIds: [quote.id],
    };

    const saved = await saveDraft(prDraft);

    // Update quote with linked payment request ID
    setDocuments(prev =>
      prev.map(d =>
        d.id === quote.id
          ? {
              ...d,
              linkedPaymentRequestId: saved.id,
              relatedDocumentIds: Array.from(new Set([...(d.relatedDocumentIds || []), saved.id])),
            }
          : d
      )
    );

    showToast('נוצרה טיוטת חשבון עסקה מקושרת להצעת המחיר');
    return saved;
  };

  // Create Payment Request draft from time entries
  const createDraftFromTimeEntries = async (
    clientId: string,
    projectId: string | undefined,
    selectedEntryIds: string[],
    mode: TimeBillingLayoutMode,
    options?: {
      splitByRate?: boolean;
      manualNotes?: string;
    }
  ): Promise<AppDocument> => {
    const client = clients.find(c => c.id === clientId);
    const selectedEntries = entries.filter(e => selectedEntryIds.includes(e.id));
    if (selectedEntries.length === 0) {
      throw new Error('לא נבחרו דיווחי שעות להפקה');
    }

    const isExempt = businessSettings.businessType === 'exempt';
    const { 
      lineItems, 
      notes, 
      subtotal, 
      vatTotal, 
      totalAmount, 
      missingRatesCount 
    } = generateTimeBillingDocumentData({
      selectedEntries,
      projects,
      defaultHourlyRate: settings.defaultHourlyRate || 350,
      mode,
      splitByRate: options?.splitByRate,
      manualNotes: options?.manualNotes !== undefined ? options.manualNotes : (businessSettings.defaultNotes || ''),
      isVatExempt: isExempt,
    });

    if (missingRatesCount > 0) {
      showToast(`לתשומת לבך: עבור ${missingRatesCount} דיווחים לא הוגדר תעריף שעתי ייעודי לפרויקט. נעשה שימוש בתעריף ברירת המחדל (${settings.defaultHourlyRate || 350} ₪).`);
    }

    const todayStr = new Date().toISOString().split('T')[0];
    const { dueDate, explanation } = calculateDueDate(todayStr, client?.paymentTerms || businessSettings.defaultPaymentTerms);

    const prDraft: Partial<AppDocument> = {
      type: 'payment_request',
      status: 'draft',
      deliveryStatus: 'not_sent',
      date: todayStr,
      dueDate,
      dueDateExplanation: explanation,
      clientId,
      clientName: client?.name || 'לקוח ללא שם',
      clientBusinessNumber: client?.businessNumber,
      projectId,
      projectName: projects.find(p => p.id === projectId)?.name,
      currency: businessSettings.currency || '₪',
      lineItems,
      subtotal,
      discountTotal: 0,
      vatTotal, // 0 for VAT-exempt
      totalAmount,
      paidAmount: 0,
      remainingBalance: totalAmount,
      paymentTerms: client?.paymentTerms || businessSettings.defaultPaymentTerms,
      notes,
      billedTimeEntryIds: selectedEntryIds,
    };

    const saved = await saveDraft(prDraft);
    showToast(`נוצרה טיוטת חשבון עסקה עבור ${selectedEntries.length} דיווחי שעות`);
    return saved;
  };

  // Refresh existing draft with latest business profile settings
  const updateDraftWithLatestBusiness = async (draftId: string): Promise<AppDocument> => {
    const draft = documents.find(d => d.id === draftId);
    if (!draft || draft.status !== 'draft') {
      throw new Error('מסמך זה אינו טיוטה שניתן לעדכן');
    }

    const isExempt = businessSettings.businessType === 'exempt';
    const effectiveVatRate = isExempt ? 0 : (businessSettings.vatRate || 0.18);

    // Update taxability of items according to business exemption status
    const updatedLineItems = draft.lineItems.map(item => ({
      ...item,
      isTaxable: !isExempt,
    }));

    const subtotal = updatedLineItems.reduce((acc, item) => acc + item.lineTotal, 0);
    const vatTotal = isExempt ? 0 : Math.round(subtotal * effectiveVatRate * 100) / 100;
    const totalAmount = safeAdd(subtotal, vatTotal);

    const updatedDraft: Partial<AppDocument> = {
      ...draft,
      currency: businessSettings.currency || draft.currency || '₪',
      lineItems: updatedLineItems,
      subtotal,
      vatTotal,
      totalAmount,
      remainingBalance: draft.type === 'payment_request' ? totalAmount : draft.remainingBalance,
    };

    const saved = await saveDraft(updatedDraft);
    showToast('פרטי העסק עודכנו בטיוטה בהצלחה');
    return saved;
  };

  // Update business profile
  const updateBusinessSettings = async (newSettings: Partial<BusinessSettings>): Promise<void> => {
    try {
      const merged: BusinessSettings = {
        ...businessSettings,
        ...newSettings,
        isConfigured: true,
      };

      const res = await fetch('/api/documents/business', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(merged),
      });

      if (!res.ok) {
        const errJson = await res.json().catch(() => ({}));
        throw new Error(errJson.error || 'שגיאה בשמירת פרטי העסק');
      }

      const savedData = await res.json().catch(() => merged);
      setBusinessSettings(savedData);
      try {
        localStorage.setItem(BUSINESS_STORAGE_KEY, JSON.stringify(savedData));
      } catch (e) {}

      showToast('פרטי העסק נשמרו בהצלחה');
    } catch (err: any) {
      showToast(err.message || 'שגיאה בשמירת פרטי העסק');
      throw err;
    }
  };

  // Confirm production sequences one-time setup
  const confirmProductionSequences = async (params: { quoteNextStarting?: number }): Promise<void> => {
    try {
      const updated: SequenceSettings = {
        ...sequences,
        isProductionActive: true,
        paymentRequestNext: 40016,
        receiptNext: 250020,
        quoteNext: params.quoteNextStarting || 1001,
        confirmedAt: new Date().toISOString(),
      };

      const res = await fetch('/api/documents/sequences', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updated),
      });

      if (!res.ok) throw new Error('שגיאה באישור סדרת המספרים');
      setSequences(updated);
      showToast('סדרת המסמכים הרשמית הופעלה ואושרה לשימוש');
    } catch (err: any) {
      showToast(err.message || 'שגיאה בהפעלת סדרת המסמכים');
      throw err;
    }
  };

  // Download backup package
  const downloadBackup = () => {
    window.location.href = '/api/backup/download';
  };

  const getBackupStatus = async () => {
    try {
      const res = await fetch('/api/backup/status');
      if (res.ok) return await res.json();
    } catch {}
    return {
      lastBackupAt: new Date().toISOString(),
      status: 'success',
      totalSnapshots: 0,
      storageArchitecture: 'local_persistent_server_filesystem',
      isGuaranteedWhileClosed: false,
      description: 'גיבויים אוטומטיים מבוצעים ומאוחסנים במערכת הקבצים של השרת. גיבוי מתוזמן אינו מובטח כאשר היישום סגור.'
    };
  };

  const validateBackup = async (backupData: any) => {
    const res = await fetch('/api/backup/validate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ backupData }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'קובץ גיבוי לא תקין');
    return data;
  };

  const restoreBackup = async (backupData: any) => {
    const res = await fetch('/api/backup/restore', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ backupData }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'שגיאה בשחזור הגיבוי');
    await refreshDocuments();
    showToast('הנתונים שוחזרו בהצלחה מהגיבוי');
    return data;
  };

  const triggerAutoBackup = async () => {
    try {
      const res = await fetch('/api/backup/snapshot', { method: 'POST' });
      if (res.ok) {
        showToast('נוצר גיבוי אוטומטי חדש במערכת הקבצים');
        return await res.json();
      }
    } catch {}
  };

  const sendPaymentReminder = async (params: {
    documentId: string;
    recipient: string;
    subject: string;
    messageBody: string;
  }): Promise<{ success: boolean; error?: string; document?: AppDocument }> => {
    const doc = documents.find(d => d.id === params.documentId);
    if (!doc) {
      const err = 'המסמך לא נמצא';
      showToast(err);
      return { success: false, error: err };
    }
    if (doc.status === 'paid' || doc.status === 'canceled' || (doc.remainingBalance !== undefined && doc.remainingBalance <= 0)) {
      const err = 'לא ניתן לשלוח תזכורת: חשבון העסקה כבר שולם במלואו או בוטל.';
      showToast(err);
      return { success: false, error: err };
    }

    const res = await sendDocumentEmail({
      ...params,
      isReminder: true,
    });
    if (res.success) {
      showToast('תזכורת התשלום נשלחה בהצלחה לספק הדוא״ל');
    }
    return res;
  };

  // Compliance blockers status
  const complianceBlockers: ComplianceBlockers = useMemo(() => {
    return {
      hasDatabasePersistence: true, // Powered by server middleware and JSON storage
      hasBusinessConfigured: Boolean(businessSettings.legalName && businessSettings.businessNumber),
      hasSequenceConfirmed: sequences.isProductionActive,
      isTaxSoftwareRegistered: false, // Legal blocker: Needs ITA registration number
      hasCertifiedDigitalSignature: false, // Legal blocker: Needs external e-signature certificate (Comsign / PersonalSign)
    };
  }, [businessSettings, sequences]);

  return (
    <DocumentsContext.Provider
      value={{
        documents,
        sequences,
        businessSettings,
        auditLogs,
        isTestMode,
        setIsTestMode,
        isLoading,
        complianceBlockers,
        saveDraft,
        deleteDraft,
        issueDocument,
        cancelDocument,
        recordDelivery,
        checkEmailProviderStatus,
        sendDocumentEmail,
        recordManualDelivery,
        confirmDelivery,
        recordPaymentReceipt,
        convertQuoteToPaymentRequest,
        createDraftFromTimeEntries,
        updateBusinessSettings,
        updateDraftWithLatestBusiness,
        confirmProductionSequences,
        downloadBackup,
        getBackupStatus,
        validateBackup,
        restoreBackup,
        triggerAutoBackup,
        sendPaymentReminder,
        getBilledTimeEntryIds,
        isClientReferencedInIssuedDocs,
        isProjectReferencedInIssuedDocs,
        refreshDocuments,
      }}
    >
      {children}
    </DocumentsContext.Provider>
  );
};

export const useDocuments = (): DocumentsContextType => {
  const context = useContext(DocumentsContext);
  if (!context) {
    throw new Error('useDocuments must be used within a DocumentsProvider');
  }
  return context;
};
