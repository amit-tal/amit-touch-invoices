import type { Client, Project, TimeEntry, Settings } from '../types';
import type { AppDocument } from '../types/documents';

export interface CurrencyAmountGroup {
  currency: string;
  amount: number;
}

export interface CustomerFinancialOverview {
  clientId: string;
  clientName: string;
  // Unbilled time
  unbilledSeconds: number;
  unbilledHoursDecimal: number;
  unbilledEstimatedAmounts: CurrencyAmountGroup[]; // Grouped by currency
  unbilledHoursWithoutRate: number;
  hasMissingHourlyRates: boolean;
  unbilledEntryCount: number;

  // Open payment requests (issued / partially_paid, non-canceled)
  openPaymentRequestsCount: number;
  openPaymentRequestsAmounts: CurrencyAmountGroup[]; // Grouped by currency (remainingBalance)

  // Overdue balances
  overduePaymentRequestsCount: number;
  overdueAmounts: CurrencyAmountGroup[]; // Grouped by currency

  // Payments received (receipts, non-canceled, non-draft)
  paymentsReceivedCount: number;
  paymentsReceivedAmounts: CurrencyAmountGroup[]; // Grouped by currency

  // Unallocated credit (excess payments)
  unallocatedCreditAmounts: CurrencyAmountGroup[];

  // Drafts notice
  draftDocumentsCount: number;

  // Underlying records for drill-down
  unbilledEntries: TimeEntry[];
  openPaymentRequests: AppDocument[];
  overduePaymentRequests: AppDocument[];
  receipts: AppDocument[];
  draftDocuments: AppDocument[];
}

/**
 * Calculate comprehensive financial overview for a specific customer
 * Enforces:
 * - Exclude canceled documents
 * - Account for partial payments and allocations
 * - Avoid counting receipts twice when linked to payment requests
 * - Keep draft documents separate from issued debt
 * - Distinguish estimated unbilled hours from actual outstanding requests
 * - Show missing hourly rates explicitly
 * - Never combine different currencies without a conversion policy
 * - Do not add VAT (business is "עוסק פטור")
 */
export function getCustomerFinancialOverview(
  clientId: string,
  clients: Client[],
  projects: Project[],
  entries: TimeEntry[],
  documents: AppDocument[],
  settings: Settings
): CustomerFinancialOverview {
  const client = clients.find(c => c.id === clientId);
  const clientName = client?.name || 'לקוח';
  const defaultCurrency = settings.currency || '₪';

  // 1. Identify all billed time entry IDs from non-canceled documents
  const billedEntryIds = new Set<string>();
  for (const doc of documents) {
    if (doc.status !== 'canceled' && doc.billedTimeEntryIds && doc.billedTimeEntryIds.length > 0) {
      for (const id of doc.billedTimeEntryIds) {
        billedEntryIds.add(id);
      }
    }
  }

  // 2. Unbilled entries for this client
  const clientEntries = entries.filter(e => e.clientId === clientId);
  const unbilledEntries = clientEntries.filter(e => !billedEntryIds.has(e.id));
  const unbilledSeconds = unbilledEntries.reduce((s, e) => s + (e.durationSeconds || 0), 0);
  const unbilledHoursDecimal = Math.round((unbilledSeconds / 3600) * 100) / 100;

  // Calculate estimated unbilled value per project / currency
  let unbilledHoursWithoutRate = 0;
  const unbilledAmountsMap = new Map<string, number>();

  for (const entry of unbilledEntries) {
    const proj = projects.find(p => p.id === entry.projectId);
    const entryHours = (entry.durationSeconds || 0) / 3600;
    
    // Check if project has a defined rate, or fall back to default
    let rate: number | null = null;
    if (typeof proj?.hourlyRate === 'number' && proj.hourlyRate > 0) {
      rate = proj.hourlyRate;
    } else if (typeof settings.defaultHourlyRate === 'number' && settings.defaultHourlyRate > 0) {
      rate = settings.defaultHourlyRate;
    }

    if (rate !== null && rate > 0) {
      const entryValue = Math.round(entryHours * rate * 100) / 100;
      const curr = defaultCurrency;
      unbilledAmountsMap.set(curr, (unbilledAmountsMap.get(curr) || 0) + entryValue);
    } else {
      unbilledHoursWithoutRate += entryHours;
    }
  }

  const unbilledEstimatedAmounts: CurrencyAmountGroup[] = Array.from(unbilledAmountsMap.entries()).map(
    ([currency, amount]) => ({ currency, amount: Math.round(amount * 100) / 100 })
  );
  if (unbilledEstimatedAmounts.length === 0 && unbilledSeconds > 0) {
    unbilledEstimatedAmounts.push({ currency: defaultCurrency, amount: 0 });
  }

  const hasMissingHourlyRates = unbilledHoursWithoutRate > 0;

  // 3. Customer documents (excluding canceled)
  const clientDocs = documents.filter(d => d.clientId === clientId);
  const activeDocs = clientDocs.filter(d => d.status !== 'canceled');

  // Drafts
  const draftDocuments = clientDocs.filter(d => d.status === 'draft');
  const draftDocumentsCount = draftDocuments.length;

  // Today in Asia/Jerusalem (YYYY-MM-DD)
  const todayStr = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Jerusalem' }).format(new Date());

  // Open payment requests
  const openPaymentRequestsMap = new Map<string, number>();
  const overdueAmountsMap = new Map<string, number>();

  const openPaymentRequests: AppDocument[] = [];
  const overduePaymentRequests: AppDocument[] = [];

  for (const doc of activeDocs) {
    if (doc.type === 'payment_request' && doc.status !== 'draft') {
      const remaining = typeof doc.remainingBalance === 'number' ? doc.remainingBalance : doc.totalAmount;
      if (remaining > 0 && doc.status !== 'paid') {
        openPaymentRequests.push(doc);
        const curr = doc.currency || defaultCurrency;
        openPaymentRequestsMap.set(curr, (openPaymentRequestsMap.get(curr) || 0) + remaining);

        // Check if overdue
        if (doc.dueDate && doc.dueDate < todayStr) {
          overduePaymentRequests.push(doc);
          overdueAmountsMap.set(curr, (overdueAmountsMap.get(curr) || 0) + remaining);
        }
      }
    }
  }

  const openPaymentRequestsAmounts: CurrencyAmountGroup[] = Array.from(openPaymentRequestsMap.entries()).map(
    ([currency, amount]) => ({ currency, amount: Math.round(amount * 100) / 100 })
  );

  const overdueAmounts: CurrencyAmountGroup[] = Array.from(overdueAmountsMap.entries()).map(
    ([currency, amount]) => ({ currency, amount: Math.round(amount * 100) / 100 })
  );

  // 4. Payments received (receipts issued)
  const receiptsMap = new Map<string, number>();
  const unallocatedMap = new Map<string, number>();
  const receipts: AppDocument[] = [];

  for (const doc of activeDocs) {
    if (doc.type === 'receipt' && doc.status !== 'draft') {
      receipts.push(doc);
      const curr = doc.currency || defaultCurrency;
      const total = doc.totalAmount || 0;
      receiptsMap.set(curr, (receiptsMap.get(curr) || 0) + total);

      if (doc.unallocatedAmount && doc.unallocatedAmount > 0) {
        unallocatedMap.set(curr, (unallocatedMap.get(curr) || 0) + doc.unallocatedAmount);
      }
    }
  }

  const paymentsReceivedAmounts: CurrencyAmountGroup[] = Array.from(receiptsMap.entries()).map(
    ([currency, amount]) => ({ currency, amount: Math.round(amount * 100) / 100 })
  );

  const unallocatedCreditAmounts: CurrencyAmountGroup[] = Array.from(unallocatedMap.entries()).map(
    ([currency, amount]) => ({ currency, amount: Math.round(amount * 100) / 100 })
  );

  return {
    clientId,
    clientName,
    unbilledSeconds,
    unbilledHoursDecimal,
    unbilledEstimatedAmounts,
    unbilledHoursWithoutRate: Math.round(unbilledHoursWithoutRate * 100) / 100,
    hasMissingHourlyRates,
    unbilledEntryCount: unbilledEntries.length,
    openPaymentRequestsCount: openPaymentRequests.length,
    openPaymentRequestsAmounts,
    overduePaymentRequestsCount: overduePaymentRequests.length,
    overdueAmounts,
    paymentsReceivedCount: receipts.length,
    paymentsReceivedAmounts,
    unallocatedCreditAmounts,
    draftDocumentsCount,
    unbilledEntries,
    openPaymentRequests,
    overduePaymentRequests,
    receipts,
    draftDocuments,
  };
}

/**
 * Format currency amount groups into readable Hebrew string
 * E.g. "8,925 ₪" or "8,925 ₪ + 200 $"
 */
export function formatCurrencyAmountGroups(groups: CurrencyAmountGroup[], fallbackCurrency = '₪'): string {
  if (!groups || groups.length === 0) {
    return `0 ${fallbackCurrency}`;
  }
  return groups
    .map(g => `${new Intl.NumberFormat('he-IL', { maximumFractionDigits: 2 }).format(g.amount)} ${g.currency}`)
    .join(' + ');
}
