export const HEBREW_DAYS = [
  'יום ראשון',
  'יום שני',
  'יום שלישי',
  'יום רביעי',
  'יום חמישי',
  'יום שישי',
  'שבת',
];

export const HEBREW_MONTHS = [
  'ינואר',
  'פברואר',
  'מרץ',
  'אפריל',
  'מאי',
  'יוני',
  'יולי',
  'אוגוסט',
  'ספטמבר',
  'אוקטובר',
  'נובמבר',
  'דצמבר',
];

/**
 * Format a Date object to Hebrew string: e.g. "יום חמישי, 29 באוקטובר 2026"
 */
export function formatHebrewFullDate(date: Date = new Date()): string {
  const dayName = HEBREW_DAYS[date.getDay()];
  const dayNum = date.getDate();
  const monthName = HEBREW_MONTHS[date.getMonth()];
  const year = date.getFullYear();
  return `${dayName}, ${dayNum} ב${monthName} ${year}`;
}

/**
 * Format Date to YYYY-MM-DD
 */
export function toISODateString(date: Date = new Date()): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

/**
 * Format Date to HH:mm
 */
export function toTimeString(date: Date = new Date()): string {
  const h = String(date.getHours()).padStart(2, '0');
  const m = String(date.getMinutes()).padStart(2, '0');
  return `${h}:${m}`;
}

/**
 * Format duration in seconds to tabular HH:MM:SS (used strictly for live active timer)
 */
export function formatDurationHHMMSS(totalSeconds: number): string {
  if (isNaN(totalSeconds) || totalSeconds < 0) totalSeconds = 0;
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = Math.floor(totalSeconds % 60);

  const hStr = String(hours).padStart(2, '0');
  const mStr = String(minutes).padStart(2, '0');
  const sStr = String(seconds).padStart(2, '0');

  return `${hStr}:${mStr}:${sStr}`;
}

/**
 * Format duration in seconds to tabular HH:MM (used for summaries, totals, and tables)
 * Supports values > 24 hours (e.g. 38:15)
 */
export function formatDurationHHMM(totalSeconds: number): string {
  if (isNaN(totalSeconds) || totalSeconds < 0) totalSeconds = 0;
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);

  const hStr = String(hours).padStart(2, '0');
  const mStr = String(minutes).padStart(2, '0');

  return `${hStr}:${mStr}`;
}

/**
 * Format duration in seconds to friendly Hebrew string
 * e.g. "19 שעות ו-30 דק׳"
 */
export function formatDurationHebrew(totalSeconds: number): string {
  if (isNaN(totalSeconds) || totalSeconds <= 0) return '0 דק׳';
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);

  if (hours === 0) {
    return `${minutes} דק׳`;
  }
  if (minutes === 0) {
    return `${hours} שעות`;
  }
  return `${hours} שעות ו-${minutes} דק׳`;
}

/**
 * Format duration to hours with 1 decimal place (e.g. 12.5 שעות)
 */
export function formatHoursDecimal(totalSeconds: number): string {
  const hours = totalSeconds / 3600;
  return hours.toFixed(1);
}

/**
 * Parse HH:mm to minutes from start of day
 */
export function parseTimeToMinutes(timeStr: string): number {
  const [h, m] = timeStr.split(':').map(Number);
  if (isNaN(h) || isNaN(m)) return 0;
  return h * 60 + m;
}

/**
 * Calculate difference in seconds between two HH:mm strings on same day
 */
export function calculateDurationFromTimes(startTime: string, endTime: string): number {
  const startMin = parseTimeToMinutes(startTime);
  const endMin = parseTimeToMinutes(endTime);
  if (endMin <= startMin) return 0;
  return (endMin - startMin) * 60;
}

/**
 * Check if a date string (YYYY-MM-DD) is within this week (starting Sunday)
 */
export function isDateInThisWeek(dateStr: string, referenceDate: Date = new Date()): boolean {
  const [y, m, d] = dateStr.split('-').map(Number);
  const target = new Date(y, m - 1, d);

  // Find start of week (Sunday)
  const startOfWeek = new Date(referenceDate);
  startOfWeek.setDate(referenceDate.getDate() - referenceDate.getDay());
  startOfWeek.setHours(0, 0, 0, 0);

  // End of week (Saturday night)
  const endOfWeek = new Date(startOfWeek);
  endOfWeek.setDate(startOfWeek.getDate() + 7);

  return target >= startOfWeek && target < endOfWeek;
}

/**
 * Get current year, month, and YYYY-MM in Asia/Jerusalem timezone
 */
export function getJerusalemCurrentYearMonth(): { year: number; month: number; yearMonth: string } {
  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Jerusalem',
    year: 'numeric',
    month: '2-digit',
  });
  const parts = formatter.formatToParts(new Date());
  const year = parseInt(parts.find(p => p.type === 'year')?.value || '1970', 10);
  const month = parseInt(parts.find(p => p.type === 'month')?.value || '1', 10);
  const yearMonth = `${year}-${String(month).padStart(2, '0')}`;
  return { year, month, yearMonth };
}

/**
 * Check if a date string (YYYY-MM-DD) belongs to the current calendar month in Asia/Jerusalem
 */
export function isDateInCurrentJerusalemMonth(dateStr: string): boolean {
  if (!dateStr) return false;
  const { yearMonth } = getJerusalemCurrentYearMonth();
  return dateStr.startsWith(yearMonth);
}

/**
 * Check if a date string (YYYY-MM-DD) is within this month
 */
export function isDateInThisMonth(dateStr: string, referenceDate: Date = new Date()): boolean {
  const [y, m] = dateStr.split('-').map(Number);
  return y === referenceDate.getFullYear() && m === (referenceDate.getMonth() + 1);
}

/**
 * Check if a date string is today
 */
export function isDateToday(dateStr: string, referenceDate: Date = new Date()): boolean {
  return dateStr === toISODateString(referenceDate);
}

/**
 * Format timestamp to concise Hebrew delivery string:
 * "בתאריך 01.11.2026 בשעה 12:18" (Asia/Jerusalem timezone)
 */
export function formatDeliveryTimestamp(dateOrIso?: string | Date | null): string {
  if (!dateOrIso) return '';
  const d = typeof dateOrIso === 'string' ? new Date(dateOrIso) : dateOrIso;
  if (isNaN(d.getTime())) return '';
  const formatter = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Asia/Jerusalem',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });
  const parts = formatter.formatToParts(d);
  const day = parts.find(p => p.type === 'day')?.value || '01';
  const month = parts.find(p => p.type === 'month')?.value || '01';
  const year = parts.find(p => p.type === 'year')?.value || '2026';
  const hour = parts.find(p => p.type === 'hour')?.value || '12';
  const minute = parts.find(p => p.type === 'minute')?.value || '00';
  return `בתאריך ${day}.${month}.${year} בשעה ${hour}:${minute}`;
}
