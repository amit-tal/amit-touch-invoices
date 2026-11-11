// Decimal-safe monetary arithmetic and payment-term date utilities
import type { AppDocument, BusinessSettings } from '../types/documents.ts';

export const toCents = (amount: number): number => {
  if (isNaN(amount) || !isFinite(amount)) return 0;
  return Math.round(amount * 100);
};

export const fromCents = (cents: number): number => {
  return cents / 100;
};

export const safeAdd = (a: number, b: number): number => {
  return fromCents(toCents(a) + toCents(b));
};

export const safeSubtract = (a: number, b: number): number => {
  return fromCents(toCents(a) - toCents(b));
};

export const safeMultiply = (amount: number, multiplier: number): number => {
  return fromCents(Math.round(toCents(amount) * multiplier));
};

export const calculateLineTotal = (
  quantity: number,
  unitPrice: number,
  discount: number = 0,
  discountType: 'percent' | 'amount' = 'percent'
): { lineTotal: number; discountAmount: number } => {
  const q = isNaN(quantity) || quantity < 0 ? 0 : quantity;
  const priceCents = toCents(unitPrice);
  const rawTotalCents = Math.round(q * priceCents);

  let discountCents = 0;
  if (discount > 0) {
    if (discountType === 'percent') {
      const pct = Math.min(100, Math.max(0, discount));
      discountCents = Math.round((rawTotalCents * pct) / 100);
    } else {
      discountCents = Math.min(rawTotalCents, toCents(discount));
    }
  }

  const finalCents = Math.max(0, rawTotalCents - discountCents);
  return {
    lineTotal: fromCents(finalCents),
    discountAmount: fromCents(discountCents),
  };
};

export interface CalculatedTotals {
  subtotal: number;
  discountTotal: number;
  taxableAmount: number;
  vatTotal: number;
  totalAmount: number;
}

export const calculateTotals = (
  items: Array<{
    quantity: number;
    unitPrice: number;
    discount?: number;
    discountType?: 'percent' | 'amount';
    isTaxable?: boolean;
  }>,
  vatRate: number = 0.18
): CalculatedTotals => {
  let subtotalCents = 0;
  let discountTotalCents = 0;
  let taxableCents = 0;

  items.forEach(item => {
    const q = isNaN(item.quantity) || item.quantity < 0 ? 0 : item.quantity;
    const priceCents = toCents(item.unitPrice);
    const lineRawCents = Math.round(q * priceCents);
    subtotalCents += lineRawCents;

    let lineDiscountCents = 0;
    if (item.discount && item.discount > 0) {
      if (item.discountType === 'percent') {
        const pct = Math.min(100, Math.max(0, item.discount));
        lineDiscountCents = Math.round((lineRawCents * pct) / 100);
      } else {
        lineDiscountCents = Math.min(lineRawCents, toCents(item.discount));
      }
    }
    discountTotalCents += lineDiscountCents;

    const lineFinalCents = Math.max(0, lineRawCents - lineDiscountCents);
    if (item.isTaxable !== false) {
      taxableCents += lineFinalCents;
    }
  });

  const subtotal = fromCents(subtotalCents);
  const discountTotal = fromCents(discountTotalCents);
  const taxableAmount = fromCents(taxableCents);
  const netAfterDiscountCents = Math.max(0, subtotalCents - discountTotalCents);
  const vatTotalCents = Math.round(taxableCents * (vatRate || 0));
  const vatTotal = fromCents(vatTotalCents);
  const totalAmount = fromCents(netAfterDiscountCents + vatTotalCents);

  return {
    subtotal,
    discountTotal,
    taxableAmount,
    vatTotal,
    totalAmount,
  };
};

export const formatCurrency = (
  amount: number,
  currency: string = '₪',
  includeDecimals: boolean = true
): string => {
  if (isNaN(amount) || amount === null || amount === undefined) return `0 ${currency}`;
  const formatted = amount.toLocaleString('he-IL', {
    minimumFractionDigits: includeDecimals ? 2 : 0,
    maximumFractionDigits: 2,
  });
  return `${formatted} ${currency}`;
};

/**
 * Centrally calculates due date and human-readable explanation based on payment terms
 * "לתשלום מיידי" = document date
 * "שוטף" = last calendar day of document's month
 * "שוטף + N" = last calendar day of document's month plus N calendar days
 * "אחר" = custom terms, manual due date selection required
 * 
 * Uses pure UTC calendar arithmetic to prevent any timezone / DST off-by-one errors.
 */
export const calculateDueDate = (
  dateStr: string,
  terms: string = 'שוטף + 30',
  customExplanation?: string
): { dueDate: string; explanation: string } => {
  if (!dateStr) {
    const today = new Date();
    dateStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
  }

  const [y, m] = dateStr.split('-').map(Number);

  if (terms === 'לתשלום מיידי') {
    return {
      dueDate: dateStr,
      explanation: 'לתשלום מיידי במועד קבלת הדרישה',
    };
  }

  if (terms === 'אחר') {
    return {
      dueDate: dateStr,
      explanation: customExplanation || 'תנאי תשלום מותאמים אישית — יש לקבוע מועד פירעון ידני',
    };
  }

  // Get the last day of the document's month using UTC
  // Date.UTC(year, month, 0) gives the final day of `month` (since month is 1-based, passing m gives last day of month m)
  const lastDayOfMonth = new Date(Date.UTC(y, m, 0)).getUTCDate();

  let plusDays = 0;
  if (terms === 'שוטף') {
    plusDays = 0;
  } else if (terms.includes('+')) {
    const match = terms.match(/\+\s*(\d+)/);
    if (match) {
      plusDays = parseInt(match[1], 10);
    }
  } else {
    // Other / fallback
    const fallbackUtc = new Date(Date.UTC(y, m - 1, 15 + 14));
    const fbYear = fallbackUtc.getUTCFullYear();
    const fbMonth = fallbackUtc.getUTCMonth() + 1;
    const fbDate = fallbackUtc.getUTCDate();
    return {
      dueDate: `${fbYear}-${String(fbMonth).padStart(2, '0')}-${String(fbDate).padStart(2, '0')}`,
      explanation: customExplanation || 'תנאי תשלום מותאמים אישית',
    };
  }

  // Calculate target date by adding plusDays to the month's final day in pure UTC
  const targetUtc = new Date(Date.UTC(y, m - 1, lastDayOfMonth + plusDays));
  const dueYear = targetUtc.getUTCFullYear();
  const dueMonth = targetUtc.getUTCMonth() + 1;
  const dueDateNum = targetUtc.getUTCDate();

  const dueDateIso = `${dueYear}-${String(dueMonth).padStart(2, '0')}-${String(dueDateNum).padStart(2, '0')}`;

  let explanation = '';
  if (plusDays === 0) {
    explanation = 'סוף חודש המסמך (שוטף)';
  } else {
    explanation = `סוף חודש המסמך + ${plusDays} ימים`;
  }

  return {
    dueDate: dueDateIso,
    explanation,
  };
};

export const DOCUMENT_TITLES: Record<string, string> = {
  payment_request: 'חשבון עסקה / דרישת תשלום',
  receipt: 'קבלה',
  quote: 'הצעת מחיר',
};

export const getDocumentTypeTitle = (type: string): string => {
  return DOCUMENT_TITLES[type] || 'מסמך';
};

/**
 * Format ISO date string YYYY-MM-DD to DD/MM/YYYY
 */
export function formatIsoDateSlash(isoStr?: string): string {
  if (!isoStr) return '';
  const [y, m, d] = isoStr.split('-');
  if (!y || !m || !d) return isoStr;
  return `${d}/${m}/${y}`;
}

/**
 * Generate clean, professional Hebrew email content tailored to each document type
 */
export function getDefaultEmailContent(
  document: AppDocument,
  business: BusinessSettings
): { subject: string; messageBody: string } {
  const docNum = document.documentNumber || 'טיוטה';
  const customerName = document.clientName || 'לקוח/ה';
  const formattedTotal = `${(document.totalAmount || 0).toLocaleString('he-IL')} ${document.currency || '₪'}`;
  const senderName = business.legalName && !business.legalName.toUpperCase().includes('TOUCH')
    ? business.legalName
    : (business.tradingName || 'AMIT TOUCH');

  if (document.type === 'payment_request') {
    const subject = `AMIT TOUCH | חשבון עסקה מס׳ ${docNum}`;
    const formattedDueDate = formatIsoDateSlash(document.dueDate);
    const bodyLines = [
      `שלום ${customerName},`,
      ``,
      `מצורף חשבון עסקה מס׳ ${docNum}.`,
      ``,
      `סכום לתשלום: ${formattedTotal}`,
      ...(formattedDueDate ? [`מועד פירעון: ${formattedDueDate}`] : []),
      ``,
      `תודה על שיתוף הפעולה,`,
      senderName,
      `AMIT TOUCH`,
    ];
    return { subject, messageBody: bodyLines.join('\n') };
  }

  if (document.type === 'receipt') {
    const subject = `AMIT TOUCH | קבלה מס׳ ${docNum}`;
    const paidAmount = document.paidAmount || document.totalAmount || 0;
    const formattedPaid = `${paidAmount.toLocaleString('he-IL')} ${document.currency || '₪'}`;
    const bodyLines = [
      `שלום ${customerName},`,
      ``,
      `מצורפת קבלה מס׳ ${docNum} המאשרת את קבלת התשלום.`,
      ``,
      `סכום ששולם: ${formattedPaid}`,
      ``,
      `תודה על שיתוף הפעולה,`,
      senderName,
      `AMIT TOUCH`,
    ];
    return { subject, messageBody: bodyLines.join('\n') };
  }

  // Quote
  const subject = `AMIT TOUCH | הצעת מחיר מס׳ ${docNum}`;
  const formattedValidUntil = formatIsoDateSlash(document.validUntilDate);
  const bodyLines = [
    `שלום ${customerName},`,
    ``,
    `מצורפת הצעת מחיר מס׳ ${docNum} לעיונך.`,
    ``,
    `סכום ההצעה: ${formattedTotal}`,
    ...(formattedValidUntil ? [`בתוקף עד: ${formattedValidUntil}`] : []),
    ``,
    `תודה על שיתוף הפעולה,`,
    senderName,
    `AMIT TOUCH`,
  ];
  return { subject, messageBody: bodyLines.join('\n') };
}

export const getStatusBadgeInfo = (
  status: string,
  type?: string
): { label: string; bgClass: string; textClass: string } => {
  // 1. Receipts (קבלה - feminine in Hebrew)
  if (type === 'receipt') {
    if (status === 'draft') {
      return { label: 'טיוטה', bgClass: 'bg-warm-100', textClass: 'text-warm-700' };
    }
    if (status === 'canceled') {
      return { label: 'בוטלה', bgClass: 'bg-gray-100', textClass: 'text-gray-600' };
    }
    // Any issued receipt (including partial payment receipts) displays "הופקה"
    return {
      label: 'הופקה',
      bgClass: 'bg-emerald-100',
      textClass: 'text-emerald-800',
    };
  }

  // 2. Payment Requests (חשבון עסקה / דרישת תשלום)
  if (type === 'payment_request') {
    switch (status) {
      case 'draft':
        return { label: 'טיוטה', bgClass: 'bg-warm-100', textClass: 'text-warm-700' };
      case 'issued':
        return {
          label: 'ממתין לתשלום',
          bgClass: 'bg-rose-100/70',
          textClass: 'text-[#88463F]',
        };
      case 'partially_paid':
        return { label: 'שולם חלקית', bgClass: 'bg-amber-100', textClass: 'text-amber-800' };
      case 'paid':
        return { label: 'שולם במלואו', bgClass: 'bg-emerald-100', textClass: 'text-emerald-800' };
      case 'canceled':
        return { label: 'בוטל', bgClass: 'bg-gray-100', textClass: 'text-gray-600' };
      default:
        return { label: status, bgClass: 'bg-warm-100', textClass: 'text-warm-700' };
    }
  }

  // 3. Quotes (הצעת מחיר)
  if (type === 'quote') {
    switch (status) {
      case 'draft':
        return { label: 'טיוטה', bgClass: 'bg-warm-100', textClass: 'text-warm-700' };
      case 'issued':
        return { label: 'הופקה', bgClass: 'bg-blue-100', textClass: 'text-blue-800' };
      case 'accepted':
        return { label: 'הצעה אושרה', bgClass: 'bg-emerald-100', textClass: 'text-emerald-800' };
      case 'rejected':
        return { label: 'הצעה נדחתה', bgClass: 'bg-red-100', textClass: 'text-red-800' };
      case 'canceled':
        return { label: 'בוטלה', bgClass: 'bg-gray-100', textClass: 'text-gray-600' };
      default:
        return { label: status, bgClass: 'bg-warm-100', textClass: 'text-warm-700' };
    }
  }

  // Fallback for general status
  switch (status) {
    case 'draft':
      return { label: 'טיוטה', bgClass: 'bg-warm-100', textClass: 'text-warm-700' };
    case 'issued':
      return { label: 'הופק', bgClass: 'bg-rose-100/70', textClass: 'text-[#88463F]' };
    case 'partially_paid':
      return { label: 'שולם חלקית', bgClass: 'bg-amber-100', textClass: 'text-amber-800' };
    case 'paid':
      return { label: 'שולם במלואו', bgClass: 'bg-emerald-100', textClass: 'text-emerald-800' };
    case 'canceled':
      return { label: 'בוטל', bgClass: 'bg-gray-100', textClass: 'text-gray-600' };
    default:
      return { label: status, bgClass: 'bg-warm-100', textClass: 'text-warm-700' };
  }
};

export const DOCUMENT_STATUS_LABELS: Record<string, { label: string; color: string; bg: string }> = {
  draft: { label: 'טיוטה', color: '#7D5A56', bg: 'rgba(125, 90, 86, 0.12)' },
  issued: { label: 'הופק / ממתין לתשלום', color: '#BC796F', bg: 'rgba(188, 121, 111, 0.15)' },
  partially_paid: { label: 'שולם חלקית', color: '#D97706', bg: 'rgba(217, 119, 6, 0.15)' },
  paid: { label: 'שולם במלואו', color: '#15803D', bg: 'rgba(21, 128, 61, 0.15)' },
  accepted: { label: 'אושרה', color: '#15803D', bg: 'rgba(21, 128, 61, 0.15)' },
  rejected: { label: 'נדחתה', color: '#B91C1C', bg: 'rgba(185, 28, 28, 0.15)' },
  canceled: { label: 'בוטל', color: '#6B7280', bg: 'rgba(107, 114, 128, 0.15)' },
};

export const getDeliveryStatusBadge = (
  doc: AppDocument
): { label: string; bgClass: string; textClass: string; tooltip: string; shortLabel: string } => {
  switch (doc.deliveryStatus) {
    case 'sending':
      return {
        label: 'שולח...',
        shortLabel: 'שולח...',
        bgClass: 'bg-[#BC796F]/10 border border-[#BC796F]/30',
        textClass: 'text-[#88463F] animate-pulse',
        tooltip: 'שליחת המסמך מבוצעת כעת מול שרת הדוא״ל',
      };
    case 'sent':
      return {
        label: 'נשלח',
        shortLabel: 'נשלח',
        bgClass: 'bg-[#BC796F]/15 border border-[#BC796F]/30',
        textClass: 'text-[#88463F]',
        tooltip: doc.deliveryDetails?.recipient
          ? `נשלח אל ${doc.deliveryDetails.recipient}`
          : 'המסמך נשלח בהצלחה',
      };
    case 'failed':
      return {
        label: 'השליחה נכשלה',
        shortLabel: 'השליחה נכשלה',
        bgClass: 'bg-red-50 border border-red-200',
        textClass: 'text-red-800',
        tooltip: doc.deliveryDetails?.sendAttempts?.[0]?.error || 'השליחה נכשלה',
      };
    case 'bounced':
      return {
        label: 'לא נמסר',
        shortLabel: 'לא נמסר',
        bgClass: 'bg-red-50 border border-red-200',
        textClass: 'text-red-800',
        tooltip: 'הודעת הדוא״ל לא נמסרה (Bounce)',
      };
    case 'manual_delivery':
      return {
        label: `נמסר ידנית (${doc.deliveryDetails?.manualMethod === 'whatsapp' ? 'וואטסאפ' : doc.deliveryDetails?.manualMethod === 'in_person' ? 'אישית' : 'שליח'})`,
        shortLabel: 'מסירה ידנית',
        bgClass: 'bg-warm-100/70 border border-warm-200/60',
        textClass: 'text-warm-800',
        tooltip: 'נמסר ידנית ללא שליחה דרך שרת דוא״ל',
      };
    case 'not_sent':
    default:
      return {
        label: 'טרם נשלח',
        shortLabel: 'טרם נשלח',
        bgClass: 'bg-warm-100/70 border border-warm-200/60',
        textClass: 'text-[#7D5A56]',
        tooltip: 'המסמך טרם נשלח',
      };
  }
};
