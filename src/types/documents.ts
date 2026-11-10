// Document Types and Interfaces for AMIT TOUCH Document Management

export type DocumentType = 'payment_request' | 'receipt' | 'quote';

export type PaymentRequestStatus = 'draft' | 'issued' | 'partially_paid' | 'paid' | 'canceled';
export type ReceiptStatus = 'draft' | 'issued' | 'canceled';
export type QuoteStatus = 'draft' | 'issued' | 'accepted' | 'rejected' | 'canceled';

export type DocumentStatus = PaymentRequestStatus | ReceiptStatus | QuoteStatus;

export type DeliveryStatus =
  | 'not_sent'
  | 'sending'
  | 'sent'
  | 'delivered'
  | 'failed'
  | 'bounced'
  | 'manual_delivery'
  | 'unverified';

export type BusinessType = 'exempt' | 'licensed' | 'company'; // עוסק פטור | עוסק מורשה | חברה בע״מ

export type PaymentMethodType = 'bank_transfer' | 'credit_card' | 'cash' | 'check' | 'other';

export interface BankDetails {
  bankName: string;
  branch: string;
  accountNumber: string;
  accountName: string;
}

export interface BusinessSettings {
  legalName: string; // שם העסק הרשמי
  tradingName: string; // שם מסחרי / מותג (AMIT TOUCH)
  businessNumber: string; // מספר עוסק / ח.פ
  businessType: BusinessType; // עוסק פטור / מורשה / חברה
  address: string;
  phone: string;
  email: string;
  logoUrl?: string;
  signatureUrl?: string;
  currency: string;
  bankDetails: BankDetails;
  defaultPaymentTerms: string; // שוטף + 30 וכו'
  defaultQuoteValidityDays: number; // e.g. 14 or 30 days
  defaultNotes: string;
  vatRate: number; // e.g. 0.18 for current VAT, 0 for exempt
  isConfigured: boolean; // Flag indicating if required business profile is complete
}

export interface SequenceSettings {
  isProductionActive: boolean; // True only after one-time confirmation
  paymentRequestNext: number; // Official sequence: NEXT 40016
  receiptNext: number; // Official sequence: NEXT 250020
  quoteNext: number | null; // Unconfigured until user sets it
  testSequenceNext: number; // Starts at 1001 for test mode
  isLocked: boolean; // Locked after official documents are issued
  confirmedAt?: string;
}

export interface DocumentLineItem {
  id: string;
  description: string;
  quantity: number;
  unit: string; // שעות, יחידות, חודש, פרויקט
  unitPrice: number; // In currency units (e.g. 250.00)
  discount: number; // Discount value
  discountType: 'percent' | 'amount';
  isTaxable: boolean;
  lineTotal: number; // Calculated safe line total
}

export interface ReceiptPaymentMethod {
  id: string;
  type: PaymentMethodType;
  amount: number;
  // Conditional fields:
  // Bank transfer:
  bankName?: string;
  branch?: string;
  accountNumber?: string;
  referenceNumber?: string; // Institutional transfer reference as supporting evidence
  isDirectTransferConfirmed?: boolean; // User-recorded confirmation: funds transferred directly from customer's account to business account (Sec 18ב(ד))
  // Credit card (PCI compliant: last 4 digits only, NO full card / CVV):
  cardLast4?: string;
  cardDealType?: string;
  transactionReference?: string;
  // Check:
  checkNumber?: string;
  checkBank?: string;
  checkBranch?: string;
  checkMaturityDate?: string;
  checkIsCrossed?: boolean; // User-recorded documented condition: המחאה משורטטת (Sec 18ב(ד))
  checkIsNonNegotiable?: boolean; // User-recorded documented condition: למוטב בלבד / לא סחיר (Sec 18ב(ד))
  checkIsPayableToBusinessOnly?: boolean; // User-recorded documented condition: לפקודת העסק הרשמי בלבד (Sec 18ב(ד))
  // Other / Bit / PayBox:
  otherDescription?: string;
  subType?: 'bit' | 'paybox' | 'other';
  isVerified?: boolean; // Generic flag (insufficient for secured signature under 18ב(ד))
  evidenceType?: 'user_recorded' | 'institutional_provider'; // Clear distinction of evidence origin
}

export interface PaymentAllocation {
  paymentRequestId: string;
  allocatedAmount: number;
}

export interface DocumentSnapshot {
  business: BusinessSettings;
  client: {
    id: string;
    name: string;
    businessNumber?: string;
    address?: string;
    email?: string;
    phone?: string;
    contactPerson?: string;
  };
  projectName?: string;
  lineItems: DocumentLineItem[];
  totals: {
    subtotal: number;
    discountTotal: number;
    taxableAmount: number;
    vatTotal: number;
    vatRate: number;
    totalAmount: number;
    currency: string;
  };
  paymentTerms?: string;
  customPaymentTermsDetails?: string;
  dueDateExplanation?: string;
  isDueDateManualOverride?: boolean;
  notes?: string;
  paymentInstructions?: string;
  signatureUrl?: string;
  paymentMethods?: ReceiptPaymentMethod[];
  paymentAllocations?: PaymentAllocation[];
  paymentReceivedDate?: string;
  frozenAt: string;
}

export interface AuditLogEntry {
  id: string;
  documentId: string;
  action:
    | 'draft_created'
    | 'draft_updated'
    | 'issued'
    | 'delivered'
    | 'email_sent'
    | 'email_send_failed'
    | 'delivery_confirmed'
    | 'manual_delivery_recorded'
    | 'payment_applied'
    | 'accepted'
    | 'rejected'
    | 'canceled'
    | 'revision_created';
  timestamp: string;
  details: string;
  performedBy: string;
}

export interface EmailSendAttempt {
  id: string;
  timestamp: string;
  recipient: string;
  bcc?: string;
  subject: string;
  status: 'sent' | 'delivered' | 'failed' | 'bounced' | 'test_only';
  provider?: string;
  providerMessageId?: string;
  error?: string;
  pdfFilename?: string;
  isTestOnly?: boolean;
  testLabel?: string;
  isReminder?: boolean;
}

export interface DeliveryDetails {
  deliveredAt?: string;
  sentAt?: string;
  channel?: 'email' | 'manual';
  recipient?: string;
  bcc?: string;
  notes?: string;
  manualMethod?: 'whatsapp' | 'in_person' | 'courier' | 'other';
  provider?: string;
  providerMessageId?: string;
  deliveredConfirmedAt?: string;
  isUnverifiedLegacy?: boolean;
  sendAttempts?: EmailSendAttempt[];
}

export interface AppDocument {
  id: string; // Internal unique ID (e.g. doc_draft_123 or doc_40016)
  type: DocumentType;
  status: DocumentStatus;
  deliveryStatus: DeliveryStatus;
  deliveryDetails?: DeliveryDetails;
  documentNumber: string | null; // null for drafts, official number (e.g. "40016") or test number ("TEST-1001")
  isOfficial: boolean; // True if issued in production mode
  isTestMode: boolean; // True if issued in test mode
  date: string; // YYYY-MM-DD
  dueDate?: string; // For payment request
  validUntilDate?: string; // For quotes
  clientId: string;
  clientName: string;
  clientBusinessNumber?: string;
  clientAddress?: string;
  clientEmail?: string;
  clientContactPerson?: string;
  projectId?: string;
  projectName?: string;
  currency: string;
  customerRef?: string; // Purchase Order / PO number
  lineItems: DocumentLineItem[];
  subtotal: number;
  discountTotal: number;
  vatTotal: number;
  totalAmount: number;
  paidAmount: number; // For payment request (sum of linked receipts)
  remainingBalance: number; // For payment request: totalAmount - paidAmount
  notes?: string;
  paymentTerms?: string;
  customPaymentTermsDetails?: string;
  dueDateExplanation?: string;
  isDueDateManualOverride?: boolean;
  paymentInstructions?: string;

  // Receipt specific:
  paymentReceivedDate?: string;
  paymentMethods?: ReceiptPaymentMethod[];
  paymentAllocations?: PaymentAllocation[]; // Allocations against payment requests
  unallocatedAmount?: number; // Excess customer credit

  // Quote specific:
  title?: string; // Subject
  scopeAndDeliverables?: string;
  paymentSchedule?: string;
  estimatedDelivery?: string;
  includedRevisions?: string;
  exclusions?: string;
  linkedPaymentRequestId?: string; // If converted to payment request

  // Relations & Snapshots:
  relatedDocumentIds?: string[];
  revisions?: {
    revisionNumber: number;
    previousDocumentId: string;
    createdAt: string;
  };
  snapshot?: DocumentSnapshot; // Frozen immutable data at issuance
  auditTrail: AuditLogEntry[];

  // Time entries linked to this document:
  billedTimeEntryIds?: string[];

  createdAt: string;
  issuedAt?: string;
  canceledAt?: string;
  cancelReason?: string;
  deliveryMethod?: 'electronic' | 'paper';
  isPaperReceipt?: boolean;

  // Genuine Cryptographic Electronic Signature (Section 18ב):
  digitalSignature?: {
    isSigned: boolean;
    signatureCategory: 'certified' | 'secured' | 'none';
    signerName: string;
    signedAt: string;
    sha256Digest: string;
    certificateSubject?: string;
    certificateIssuer?: string;
    certificateValidTo?: string;
    certificateSerialNumber?: string;
    algorithm: string;
    retainedPdfFilename?: string;
  };
  signedPdfFilename?: string;
}

export interface ComplianceBlockers {
  hasDatabasePersistence: boolean;
  hasBusinessConfigured: boolean;
  hasSequenceConfirmed: boolean;
  isTaxSoftwareRegistered: boolean; // ITA software registration
  hasCertifiedDigitalSignature: boolean; // Comsign / PersonalSign e-sign
}
