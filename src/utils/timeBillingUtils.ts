import type { TimeEntry, Project } from '../types';
import type { DocumentLineItem } from '../types/documents';
import { formatDurationHHMM } from './dateUtils';
import { safeAdd } from './moneyUtils';

export type TimeBillingLayoutMode = 
  | 'detailed_lines'      // Option 1: “פירוט בשורות המסמך”
  | 'summary_with_notes'  // Option 2: “שורה מסכמת ופירוט בהערות”
  | 'detailed'            // Alias for detailed_lines
  | 'grouped';            // Alias for backward compatibility

export interface UnbilledTimeSummary {
  clientId: string;
  clientName: string;
  projectId?: string;
  projectName?: string;
  entryCount: number;
  totalDurationSeconds: number;
  totalHours: number;
  hourlyRate: number | null;
  estimatedAmount: number | null;
  entries: TimeEntry[];
}

export interface CalculatedTimeEntry {
  entry: TimeEntry;
  project?: Project;
  projectName: string;
  rate: number;
  isCustomRate: boolean;
  durationSeconds: number;
  hoursExact: number;
  hoursDecimal: number;
  lineTotal: number;
}

export interface TimeBillingAnalysis {
  calculations: CalculatedTimeEntry[];
  totalDurationSeconds: number;
  totalHours: number;
  combinedTotal: number;
  distinctRates: number[];
  hasMultipleRates: boolean;
  missingRatesCount: number;
  effectiveWeightedRate: number;
  displayWeightedRate: number;
  productAtDisplay: number;
  discrepancy: number;
  reconcilesCleanly: boolean;
  periodString: string;
}

export const BREAKDOWN_HEADER = '--- פירוט שעות העבודה ---';
export const BREAKDOWN_FOOTER = '--- סוף פירוט שעות העבודה ---';

/**
 * Format ISO date string YYYY-MM-DD to Israeli display format DD/MM/YYYY
 */
export function formatDateDisplay(isoDate: string): string {
  if (!isoDate) return '';
  const parts = isoDate.split('-');
  if (parts.length === 3) {
    return `${parts[2]}/${parts[1]}/${parts[0]}`;
  }
  return isoDate;
}

/**
 * Filter unbilled entries (entries not yet present in any issued document)
 */
export const getUnbilledEntries = (
  allEntries: TimeEntry[],
  billedEntryIds: Set<string>,
  filterClientId?: string,
  filterProjectId?: string,
  dateRange?: { from?: string; to?: string }
): TimeEntry[] => {
  return allEntries.filter(entry => {
    // Exclude already billed entries from issued documents
    if (billedEntryIds.has(entry.id)) return false;

    // Filter by client
    if (filterClientId && entry.clientId !== filterClientId) return false;

    // Filter by project
    if (filterProjectId && entry.projectId !== filterProjectId) return false;

    // Filter by date range
    if (dateRange?.from && entry.date < dateRange.from) return false;
    if (dateRange?.to && entry.date > dateRange.to) return false;

    return true;
  });
};

/**
 * Perform comprehensive analysis and monetary calculations with full duration precision
 */
export function analyzeTimeEntries(
  selectedEntries: TimeEntry[],
  projects: Project[],
  defaultHourlyRate: number = 350
): TimeBillingAnalysis {
  let missingRatesCount = 0;
  let totalDurationSeconds = 0;
  let combinedTotal = 0;

  // Sort chronologically (earliest to latest)
  const sortedEntries = [...selectedEntries].sort((a, b) => {
    const cmp = a.date.localeCompare(b.date);
    if (cmp !== 0) return cmp;
    return (a.startTime || '').localeCompare(b.startTime || '');
  });

  const calculations: CalculatedTimeEntry[] = sortedEntries.map(entry => {
    const project = projects.find(p => p.id === entry.projectId);
    const isCustomRate = typeof project?.hourlyRate === 'number';
    const rate = isCustomRate ? project.hourlyRate! : defaultHourlyRate;

    if (!isCustomRate) {
      missingRatesCount++;
    }

    const durationSeconds = entry.durationSeconds || 0;
    totalDurationSeconds += durationSeconds;

    const hoursExact = durationSeconds / 3600;
    const hoursDecimal = Math.round(hoursExact * 100) / 100;

    // Calculate line amount with full duration precision, rounding only at monetary stage
    const exactAmount = hoursExact * rate;
    const lineTotal = Math.round(exactAmount * 100) / 100;

    combinedTotal = safeAdd(combinedTotal, lineTotal);

    return {
      entry,
      project,
      projectName: project?.name || 'פרויקט כללי',
      rate,
      isCustomRate,
      durationSeconds,
      hoursExact,
      hoursDecimal,
      lineTotal,
    };
  });

  const totalHours = Math.round((totalDurationSeconds / 3600) * 100) / 100;
  const distinctRates = Array.from(new Set(calculations.map(c => c.rate))).sort((a, b) => a - b);
  const hasMultipleRates = distinctRates.length > 1;

  const effectiveWeightedRate = totalHours > 0 ? combinedTotal / totalHours : (distinctRates[0] || defaultHourlyRate);
  const displayWeightedRate = Math.round(effectiveWeightedRate * 100) / 100;

  const productAtDisplay = Math.round(totalHours * displayWeightedRate * 100) / 100;
  const discrepancy = Math.round(Math.abs(productAtDisplay - combinedTotal) * 100) / 100;
  const reconcilesCleanly = discrepancy < 0.005;

  // Calculate period string
  let periodString = '';
  if (sortedEntries.length > 0) {
    const minDate = sortedEntries[0].date;
    const maxDate = sortedEntries[sortedEntries.length - 1].date;
    if (minDate === maxDate) {
      periodString = formatDateDisplay(minDate);
    } else {
      periodString = `${formatDateDisplay(minDate)} — ${formatDateDisplay(maxDate)}`;
    }
  }

  return {
    calculations,
    totalDurationSeconds,
    totalHours,
    combinedTotal,
    distinctRates,
    hasMultipleRates,
    missingRatesCount,
    effectiveWeightedRate,
    displayWeightedRate,
    productAtDisplay,
    discrepancy,
    reconcilesCleanly,
    periodString,
  };
}

/**
 * Generate formatted notes breakdown text for Option 2: “שורה מסכמת ופירוט בהערות”
 */
export function generateNotesBreakdownText(analysis: TimeBillingAnalysis): string {
  const { calculations, totalDurationSeconds, combinedTotal, hasMultipleRates, displayWeightedRate } = analysis;

  if (calculations.length === 0) return '';

  // Group by project while preserving chronological order within each project
  const projectMap = new Map<string, CalculatedTimeEntry[]>();
  calculations.forEach(calc => {
    const pId = calc.entry.projectId || 'none';
    if (!projectMap.has(pId)) {
      projectMap.set(pId, []);
    }
    projectMap.get(pId)!.push(calc);
  });

  const sections: string[] = [];

  projectMap.forEach((pCalcs) => {
    const projName = pCalcs[0]?.projectName || 'פרויקט כללי';
    const lines: string[] = [`פרויקט: ${projName}`];

    let projSecs = 0;
    let projTotal = 0;

    pCalcs.forEach(calc => {
      projSecs += calc.durationSeconds;
      projTotal = safeAdd(projTotal, calc.lineTotal);

      const dateStr = formatDateDisplay(calc.entry.date);
      const timeHHMM = formatDurationHHMM(calc.durationSeconds);
      const taskDesc = calc.entry.task?.trim() || 'עבודה שוטפת';
      const decHours = (calc.durationSeconds / 3600).toFixed(2);

      if (hasMultipleRates) {
        lines.push(`• ${dateStr} | ${taskDesc} | משך: ${timeHHMM} (${decHours} שעות) | תעריף: ${calc.rate} ₪/שעה | סכום: ${calc.lineTotal.toLocaleString('he-IL', { minimumFractionDigits: 2 })} ₪`);
      } else {
        lines.push(`• ${dateStr} | ${taskDesc} | משך: ${timeHHMM} (${decHours} שעות)`);
      }
    });

    const projHHMM = formatDurationHHMM(projSecs);
    const projDecHours = (projSecs / 3600).toFixed(2);
    lines.push(`סה״כ לפרויקט "${projName}": ${projHHMM} (${projDecHours} שעות) | סה״כ: ${projTotal.toLocaleString('he-IL', { minimumFractionDigits: 2 })} ₪`);

    sections.push(lines.join('\n'));
  });

  // Overall summary block
  const totalHHMM = formatDurationHHMM(totalDurationSeconds);
  const totalDecHours = (totalDurationSeconds / 3600).toFixed(2);

  const summaryLines: string[] = [
    `סיכום כללי:`,
    `• סה״כ שעות עבודה: ${totalHHMM} (${totalDecHours} שעות)`,
    `• סה״כ לתשלום: ${combinedTotal.toLocaleString('he-IL', { minimumFractionDigits: 2 })} ₪`,
  ];

  if (hasMultipleRates) {
    summaryLines.push(`• תעריף משוקלל אפקטיבי: ${displayWeightedRate.toLocaleString('he-IL', { minimumFractionDigits: 2 })} ₪/שעה`);
  }

  sections.push(summaryLines.join('\n'));

  return sections.join('\n\n');
}

/**
 * Safely inject the breakdown into notes while preserving any manual notes
 */
export function injectTimeBreakdownIntoNotes(
  existingNotes: string | undefined,
  breakdownText: string
): string {
  const current = (existingNotes || '').trim();
  const startIdx = current.indexOf(BREAKDOWN_HEADER);
  const endIdx = current.indexOf(BREAKDOWN_FOOTER);

  const newSection = `${BREAKDOWN_HEADER}\n${breakdownText}\n${BREAKDOWN_FOOTER}`;

  if (startIdx !== -1 && endIdx !== -1 && endIdx >= startIdx) {
    const before = current.substring(0, startIdx).trim();
    const after = current.substring(endIdx + BREAKDOWN_FOOTER.length).trim();
    return [before, newSection, after].filter(Boolean).join('\n\n');
  }

  if (current) {
    return `${current}\n\n${newSection}`;
  }
  return newSection;
}

/**
 * Remove only the generated breakdown section, returning user's manual notes
 */
export function extractManualNotes(fullNotes: string | undefined): string {
  if (!fullNotes) return '';
  const startIdx = fullNotes.indexOf(BREAKDOWN_HEADER);
  const endIdx = fullNotes.indexOf(BREAKDOWN_FOOTER);
  if (startIdx !== -1 && endIdx !== -1 && endIdx >= startIdx) {
    const before = fullNotes.substring(0, startIdx).trim();
    const after = fullNotes.substring(endIdx + BREAKDOWN_FOOTER.length).trim();
    return [before, after].filter(Boolean).join('\n\n');
  }
  return fullNotes.trim();
}

/**
 * Generate DocumentLineItems and Notes for the requested layout option
 */
export function generateTimeBillingDocumentData(params: {
  selectedEntries: TimeEntry[];
  projects: Project[];
  defaultHourlyRate?: number;
  mode: TimeBillingLayoutMode;
  splitByRate?: boolean;
  manualNotes?: string;
  isVatExempt?: boolean;
}): {
  lineItems: DocumentLineItem[];
  notes: string;
  subtotal: number;
  vatTotal: number;
  totalAmount: number;
  analysis: TimeBillingAnalysis;
  missingRatesCount: number;
} {
  const {
    selectedEntries,
    projects,
    defaultHourlyRate = 350,
    mode,
    splitByRate = false,
    manualNotes = '',
    isVatExempt = true,
  } = params;

  const analysis = analyzeTimeEntries(selectedEntries, projects, defaultHourlyRate);
  const isTaxable = !isVatExempt;

  const normalizedMode: 'detailed_lines' | 'summary_with_notes' = 
    (mode === 'detailed_lines' || mode === 'detailed') 
      ? 'detailed_lines' 
      : 'summary_with_notes';

  let lineItems: DocumentLineItem[] = [];
  let notes = extractManualNotes(manualNotes);

  if (normalizedMode === 'detailed_lines') {
    // Option 1: “פירוט בשורות המסמך”
    // Separate document line for each selected entry
    lineItems = analysis.calculations.map((calc, idx) => {
      const dateDisplay = formatDateDisplay(calc.entry.date);
      const task = calc.entry.task?.trim() || 'עבודה שוטפת';

      return {
        id: `line_time_${calc.entry.id}_${idx}_${Date.now()}`,
        description: `${dateDisplay} • ${calc.projectName} • ${task}`,
        quantity: calc.hoursDecimal,
        unit: 'שעות',
        unitPrice: calc.rate,
        discount: 0,
        discountType: 'percent',
        isTaxable,
        lineTotal: calc.lineTotal,
      };
    });
  } else {
    // Option 2: “שורה מסכמת ופירוט בהערות”
    const breakdownText = generateNotesBreakdownText(analysis);
    notes = injectTimeBreakdownIntoNotes(manualNotes, breakdownText);

    if (splitByRate && analysis.hasMultipleRates) {
      // Separate summary lines per distinct hourly rate
      analysis.distinctRates.forEach((rate, idx) => {
        const calcsForRate = analysis.calculations.filter(c => c.rate === rate);
        const rateDurationSecs = calcsForRate.reduce((s, c) => s + c.durationSeconds, 0);
        const rateHours = Math.round((rateDurationSecs / 3600) * 100) / 100;
        const rateTotal = calcsForRate.reduce((sum, c) => safeAdd(sum, c.lineTotal), 0);

        lineItems.push({
          id: `line_time_summary_rate_${rate}_${idx}_${Date.now()}`,
          description: `שעות עבודה — תעריף ${rate} ₪/שעה (${analysis.periodString})`,
          quantity: rateHours,
          unit: 'שעות',
          unitPrice: rate,
          discount: 0,
          discountType: 'percent',
          isTaxable,
          lineTotal: rateTotal,
        });
      });
    } else {
      // Single summary line with effective weighted rate
      const rateToUse = analysis.hasMultipleRates 
        ? analysis.displayWeightedRate 
        : (analysis.distinctRates[0] || defaultHourlyRate);

      lineItems.push({
        id: `line_time_summary_${Date.now()}`,
        description: `שעות עבודה (${analysis.periodString})`,
        quantity: analysis.totalHours,
        unit: 'שעות',
        unitPrice: rateToUse,
        discount: 0,
        discountType: 'percent',
        isTaxable,
        lineTotal: analysis.combinedTotal,
      });
    }
  }

  // Combined subtotal from lines
  const subtotal = analysis.combinedTotal;
  const vatTotal = 0; // VAT-exempt business: do not add VAT
  const totalAmount = subtotal;

  return {
    lineItems,
    notes,
    subtotal,
    vatTotal,
    totalAmount,
    analysis,
    missingRatesCount: analysis.missingRatesCount,
  };
}

/**
 * Backward compatibility wrapper for existing callers
 */
export const timeEntriesToLineItems = (
  selectedEntries: TimeEntry[],
  projects: Project[],
  defaultHourlyRate: number = 350,
  mode: 'detailed' | 'grouped' = 'detailed'
): { lineItems: DocumentLineItem[]; missingRatesCount: number } => {
  const result = generateTimeBillingDocumentData({
    selectedEntries,
    projects,
    defaultHourlyRate,
    mode: mode === 'grouped' ? 'summary_with_notes' : 'detailed_lines',
    isVatExempt: true,
  });

  return {
    lineItems: result.lineItems,
    missingRatesCount: result.missingRatesCount,
  };
};
