import type { Client, Project, TimeEntry } from '../types';
import type { AppDocument } from '../types/documents';

export interface MonthlyExportOptions {
  year: number;
  month: number; // 1-12
  scope: 'all' | 'entries' | 'documents';
  format: 'xlsx' | 'csv';
}

/**
 * Sanitize cell values to prevent CSV / Spreadsheet formula injection
 */
export function sanitizeSpreadsheetText(value: any): string {
  if (value === null || value === undefined) return '';
  let str = String(value).trim();
  // If text starts with =, +, -, @, \t, or \r prepend single quote
  if (/^[=+\-@\t\r]/.test(str)) {
    str = "'" + str;
  }
  return str;
}

/**
 * Escape XML special characters
 */
function escapeXml(str: string): string {
  if (!str) return '';
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

/**
 * Format CSV field (proper quotes and BOM)
 */
function formatCsvField(val: any): string {
  const sanitized = sanitizeSpreadsheetText(val);
  if (sanitized.includes(',') || sanitized.includes('"') || sanitized.includes('\n') || sanitized.includes('\r')) {
    return `"${sanitized.replace(/"/g, '""')}"`;
  }
  return sanitized;
}

/**
 * Trigger browser file download
 */
export function downloadFile(content: string, filename: string, mimeType: string): void {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/**
 * Build CSV string for monthly export
 */
export function generateMonthlyCsv(
  entries: TimeEntry[],
  documents: AppDocument[],
  clients: Client[],
  projects: Project[],
  options: MonthlyExportOptions
): string {
  const { year, month, scope } = options;
  const monthPad = String(month).padStart(2, '0');
  const monthPrefix = `${year}-${monthPad}`;

  const rows: string[] = [];
  // UTF-8 BOM
  const BOM = '\uFEFF';

  // Disclaimer header
  rows.push(formatCsvField('AMIT TOUCH - דוח ייצוא חודשי'));
  rows.push(formatCsvField(`תקופה: ${monthPad}/${year} (בסיס זמן: שעון ישראל Asia/Jerusalem)`));
  rows.push(formatCsvField('הודעה משפטית: ייצוא זה נועד לצורכי ניהול ומעקב פנימי בלבד ואינו מהווה דיווח מס רשמי או תחליף לקובץ במבנה אחיד (BKMVD).'));
  rows.push('');

  // 1. Time Entries (by work date)
  if (scope === 'all' || scope === 'entries') {
    const monthEntries = entries.filter(e => e.date.startsWith(monthPrefix));
    rows.push(formatCsvField(`=== דיווחי שעות (בסיס: תאריך ביצוע העבודה) - סה״כ ${monthEntries.length} רשומות ===`));
    rows.push([
      'תאריך',
      'לקוח',
      'פרויקט',
      'תיאור משימה',
      'משך (HH:mm)',
      'שעות עשרוניות',
      'תעריף שעתי',
      'סכום לחיוב',
      'סטטוס חיוב',
      'מספר מסמך מקושר'
    ].map(formatCsvField).join(','));

    for (const e of monthEntries) {
      const client = clients.find(c => c.id === e.clientId);
      const proj = projects.find(p => p.id === e.projectId);
      const hours = Math.round(((e.durationSeconds || 0) / 3600) * 100) / 100;
      const rate = typeof proj?.hourlyRate === 'number' ? proj.hourlyRate : '';
      const amount = typeof rate === 'number' ? Math.round(hours * rate * 100) / 100 : '';
      
      // Check if billed
      const linkedDoc = documents.find(d => d.status !== 'canceled' && d.billedTimeEntryIds?.includes(e.id));
      const billingStatus = linkedDoc ? 'חויב במסמך' : 'פתוח לחיוב';
      const docNum = linkedDoc?.documentNumber || (linkedDoc ? 'טיוטה' : '');

      const h = Math.floor((e.durationSeconds || 0) / 3600);
      const m = Math.floor(((e.durationSeconds || 0) % 3600) / 60);
      const durationStr = `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;

      rows.push([
        e.date,
        client?.name || 'לא צוין',
        proj?.name || 'כללי',
        e.task || '',
        durationStr,
        hours,
        rate,
        amount,
        billingStatus,
        docNum
      ].map(formatCsvField).join(','));
    }
    rows.push('');
  }

  // 2. Document Register (by issue date)
  if (scope === 'all' || scope === 'documents') {
    const monthDocs = documents.filter(d => {
      const dateToCheck = d.issuedAt ? d.issuedAt.split('T')[0] : d.date;
      return dateToCheck.startsWith(monthPrefix) && d.status !== 'canceled';
    });

    rows.push(formatCsvField(`=== ספר מסמכים שהופקו (בסיס: תאריך הפקה) - סה״כ ${monthDocs.length} מסמכים ===`));
    rows.push([
      'סוג מסמך',
      'מספר מסמך',
      'תאריך הפקה',
      'לקוח',
      'מועד פירעון',
      'מטבע',
      'סה״כ לפני מע״מ',
      'סה״כ לתשלום',
      'שולם בפועל',
      'יתרה לתשלום',
      'סטטוס',
      'מסמכים מקושרים'
    ].map(formatCsvField).join(','));

    for (const d of monthDocs) {
      const typeHebrew = d.type === 'payment_request' ? 'חשבון עסקה' : d.type === 'receipt' ? 'קבלה' : 'הצעת מחיר';
      const statusHebrew = d.status === 'paid' ? 'שולם במלואו' : d.status === 'partially_paid' ? 'שולם חלקית' : d.status === 'issued' ? 'הופק - ממתין לתשלום' : d.status;
      const related = (d.relatedDocumentIds || []).join('; ');

      rows.push([
        typeHebrew,
        d.documentNumber || 'טיוטה',
        d.date,
        d.clientName,
        d.dueDate || '',
        d.currency || '₪',
        d.subtotal || d.totalAmount,
        d.totalAmount,
        d.paidAmount || 0,
        d.remainingBalance !== undefined ? d.remainingBalance : (d.type === 'payment_request' ? d.totalAmount : 0),
        statusHebrew,
        related
      ].map(formatCsvField).join(','));
    }
    rows.push('');

    // 3. Receipts Sheet (by payment received date)
    const monthReceipts = documents.filter(d => {
      if (d.type !== 'receipt' || d.status === 'canceled') return false;
      const rDate = d.paymentReceivedDate || d.date;
      return rDate.startsWith(monthPrefix);
    });

    rows.push(formatCsvField(`=== תקבולים שנגבו בפועל (בסיס: תאריך קבלת התשלום) - סה״כ ${monthReceipts.length} קבלות ===`));
    rows.push([
      'מספר קבלה',
      'תאריך קבלת התשלום',
      'לקוח',
      'סכום ששולם',
      'מטבע',
      'אמצעי תשלום',
      'פרטי אסמכתא / העברה',
      'שויך לחשבון עסקה',
      'סכום שלא שויך (יתרת זכות)'
    ].map(formatCsvField).join(','));

    for (const r of monthReceipts) {
      const methods = (r.paymentMethods || []).map(m => {
        const typeStr = m.type === 'bank_transfer' ? 'העברה בנקאית' : m.type === 'credit_card' ? 'כרטיס אשראי' : m.type === 'cash' ? 'מזומן' : m.type === 'check' ? 'המחאה' : 'אחר';
        return `${typeStr}: ${m.amount} ${r.currency || '₪'}`;
      }).join('; ');

      const references = (r.paymentMethods || []).map(m => m.referenceNumber || m.transactionReference || m.checkNumber || '').filter(Boolean).join('; ');
      const linkedPr = (r.paymentAllocations || []).map(a => a.paymentRequestId).join('; ');

      rows.push([
        r.documentNumber || 'טיוטה',
        r.paymentReceivedDate || r.date,
        r.clientName,
        r.totalAmount,
        r.currency || '₪',
        methods || 'העברה בנקאית',
        references,
        linkedPr,
        r.unallocatedAmount || 0
      ].map(formatCsvField).join(','));
    }
  }

  return BOM + rows.join('\r\n');
}

/**
 * Generate Multi-sheet Excel XML Workbook (.xls / .xml)
 * Natively opens in Excel with separate worksheets, RTL layout, styled headers, and typed numbers
 */
export function generateMonthlyExcelXml(
  entries: TimeEntry[],
  documents: AppDocument[],
  clients: Client[],
  projects: Project[],
  options: MonthlyExportOptions
): string {
  const { year, month, scope } = options;
  const monthPad = String(month).padStart(2, '0');
  const monthPrefix = `${year}-${monthPad}`;

  let worksheetsXml = '';

  // 1. Time Entries Worksheet
  if (scope === 'all' || scope === 'entries') {
    const monthEntries = entries.filter(e => e.date.startsWith(monthPrefix));
    let rowsXml = `
      <Row ss:Height="26">
        <Cell ss:MergeAcross="9" ss:StyleID="TitleStyle">
          <Data ss:Type="String">דיווחי שעות - חודש ${monthPad}/${year} (בסיס: תאריך ביצוע העבודה)</Data>
        </Cell>
      </Row>
      <Row ss:Height="18">
        <Cell ss:MergeAcross="9" ss:StyleID="NoticeStyle">
          <Data ss:Type="String">מעקב פנימי AMIT TOUCH. אינו מהווה דיווח מס רשמי או תחליף לקובץ במבנה אחיד (BKMVD).</Data>
        </Cell>
      </Row>
      <Row ss:Height="22">
        <Cell ss:StyleID="HeaderStyle"><Data ss:Type="String">תאריך</Data></Cell>
        <Cell ss:StyleID="HeaderStyle"><Data ss:Type="String">לקוח</Data></Cell>
        <Cell ss:StyleID="HeaderStyle"><Data ss:Type="String">פרויקט</Data></Cell>
        <Cell ss:StyleID="HeaderStyle"><Data ss:Type="String">תיאור משימה</Data></Cell>
        <Cell ss:StyleID="HeaderStyle"><Data ss:Type="String">משך (HH:mm)</Data></Cell>
        <Cell ss:StyleID="HeaderStyle"><Data ss:Type="String">שעות עשרוניות</Data></Cell>
        <Cell ss:StyleID="HeaderStyle"><Data ss:Type="String">תעריף שעתי</Data></Cell>
        <Cell ss:StyleID="HeaderStyle"><Data ss:Type="String">סכום לחיוב</Data></Cell>
        <Cell ss:StyleID="HeaderStyle"><Data ss:Type="String">סטטוס חיוב</Data></Cell>
        <Cell ss:StyleID="HeaderStyle"><Data ss:Type="String">מספר מסמך מקושר</Data></Cell>
      </Row>`;

    let totalSecs = 0;
    let totalAmt = 0;

    for (const e of monthEntries) {
      totalSecs += (e.durationSeconds || 0);
      const client = clients.find(c => c.id === e.clientId);
      const proj = projects.find(p => p.id === e.projectId);
      const hours = Math.round(((e.durationSeconds || 0) / 3600) * 100) / 100;
      const rate = typeof proj?.hourlyRate === 'number' ? proj.hourlyRate : null;
      const amount = rate !== null ? Math.round(hours * rate * 100) / 100 : null;
      if (amount !== null) totalAmt += amount;

      const linkedDoc = documents.find(d => d.status !== 'canceled' && d.billedTimeEntryIds?.includes(e.id));
      const billingStatus = linkedDoc ? 'חויב במסמך' : 'פתוח לחיוב';
      const docNum = linkedDoc?.documentNumber || (linkedDoc ? 'טיוטה' : '');

      const h = Math.floor((e.durationSeconds || 0) / 3600);
      const m = Math.floor(((e.durationSeconds || 0) % 3600) / 60);
      const durationStr = `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;

      rowsXml += `
        <Row ss:Height="18">
          <Cell ss:StyleID="CenterStyle"><Data ss:Type="String">${escapeXml(e.date)}</Data></Cell>
          <Cell ss:StyleID="TextStyle"><Data ss:Type="String">${escapeXml(sanitizeSpreadsheetText(client?.name || 'לא צוין'))}</Data></Cell>
          <Cell ss:StyleID="TextStyle"><Data ss:Type="String">${escapeXml(sanitizeSpreadsheetText(proj?.name || 'כללי'))}</Data></Cell>
          <Cell ss:StyleID="TextStyle"><Data ss:Type="String">${escapeXml(sanitizeSpreadsheetText(e.task || ''))}</Data></Cell>
          <Cell ss:StyleID="CenterStyle"><Data ss:Type="String">${escapeXml(durationStr)}</Data></Cell>
          <Cell ss:StyleID="NumberStyle"><Data ss:Type="Number">${hours}</Data></Cell>
          <Cell ss:StyleID="NumberStyle"><Data ss:Type="${rate !== null ? 'Number' : 'String'}">${rate !== null ? rate : '-'}</Data></Cell>
          <Cell ss:StyleID="NumberStyle"><Data ss:Type="${amount !== null ? 'Number' : 'String'}">${amount !== null ? amount : '-'}</Data></Cell>
          <Cell ss:StyleID="CenterStyle"><Data ss:Type="String">${escapeXml(billingStatus)}</Data></Cell>
          <Cell ss:StyleID="CenterStyle"><Data ss:Type="String">${escapeXml(sanitizeSpreadsheetText(docNum))}</Data></Cell>
        </Row>`;
    }

    // Summary row
    const totalHours = Math.round((totalSecs / 3600) * 100) / 100;
    rowsXml += `
      <Row ss:Height="20" ss:StyleID="SummaryStyle">
        <Cell ss:MergeAcross="4"><Data ss:Type="String">סה״כ לחודש ${monthPad}/${year}:</Data></Cell>
        <Cell ss:StyleID="SummaryNumberStyle"><Data ss:Type="Number">${totalHours}</Data></Cell>
        <Cell><Data ss:Type="String">-</Data></Cell>
        <Cell ss:StyleID="SummaryNumberStyle"><Data ss:Type="Number">${Math.round(totalAmt * 100) / 100}</Data></Cell>
        <Cell ss:MergeAcross="1"><Data ss:Type="String">-</Data></Cell>
      </Row>`;

    worksheetsXml += `
      <Worksheet ss:Name="דיווחי שעות">
        <Table ss:DefaultColumnWidth="90">
          <Column ss:Width="80" />
          <Column ss:Width="130" />
          <Column ss:Width="120" />
          <Column ss:Width="180" />
          <Column ss:Width="80" />
          <Column ss:Width="90" />
          <Column ss:Width="80" />
          <Column ss:Width="90" />
          <Column ss:Width="90" />
          <Column ss:Width="100" />
          ${rowsXml}
        </Table>
        <WorksheetOptions xmlns="urn:schemas-microsoft-com:office:excel">
          <DisplayRightToLeft />
        </WorksheetOptions>
      </Worksheet>`;
  }

  // 2. Document Register Worksheet
  if (scope === 'all' || scope === 'documents') {
    const monthDocs = documents.filter(d => {
      const dateToCheck = d.issuedAt ? d.issuedAt.split('T')[0] : d.date;
      return dateToCheck.startsWith(monthPrefix) && d.status !== 'canceled';
    });

    let docRowsXml = `
      <Row ss:Height="26">
        <Cell ss:MergeAcross="9" ss:StyleID="TitleStyle">
          <Data ss:Type="String">ספר מסמכים - חודש ${monthPad}/${year} (בסיס: תאריך הפקה)</Data>
        </Cell>
      </Row>
      <Row ss:Height="18">
        <Cell ss:MergeAcross="9" ss:StyleID="NoticeStyle">
          <Data ss:Type="String">ספר כרונולוגי של מסמכים שהופקו. אינו כולל מסמכים שבוטלו. סכומים מופרדים לפי מטבע.</Data>
        </Cell>
      </Row>
      <Row ss:Height="22">
        <Cell ss:StyleID="HeaderStyle"><Data ss:Type="String">סוג מסמך</Data></Cell>
        <Cell ss:StyleID="HeaderStyle"><Data ss:Type="String">מספר מסמך</Data></Cell>
        <Cell ss:StyleID="HeaderStyle"><Data ss:Type="String">תאריך הפקה</Data></Cell>
        <Cell ss:StyleID="HeaderStyle"><Data ss:Type="String">לקוח</Data></Cell>
        <Cell ss:StyleID="HeaderStyle"><Data ss:Type="String">מועד פירעון</Data></Cell>
        <Cell ss:StyleID="HeaderStyle"><Data ss:Type="String">מטבע</Data></Cell>
        <Cell ss:StyleID="HeaderStyle"><Data ss:Type="String">סה״כ לתשלום</Data></Cell>
        <Cell ss:StyleID="HeaderStyle"><Data ss:Type="String">שולם בפועל</Data></Cell>
        <Cell ss:StyleID="HeaderStyle"><Data ss:Type="String">יתרה לתשלום</Data></Cell>
        <Cell ss:StyleID="HeaderStyle"><Data ss:Type="String">סטטוס</Data></Cell>
      </Row>`;

    let sumTotal = 0;
    let sumPaid = 0;
    let sumRemaining = 0;

    for (const d of monthDocs) {
      const typeHebrew = d.type === 'payment_request' ? 'חשבון עסקה' : d.type === 'receipt' ? 'קבלה' : 'הצעת מחיר';
      const statusHebrew = d.status === 'paid' ? 'שולם במלואו' : d.status === 'partially_paid' ? 'שולם חלקית' : d.status === 'issued' ? 'הופק - ממתין לתשלום' : d.status;
      const rem = d.remainingBalance !== undefined ? d.remainingBalance : (d.type === 'payment_request' ? d.totalAmount : 0);

      sumTotal += d.totalAmount || 0;
      sumPaid += d.paidAmount || 0;
      sumRemaining += rem;

      docRowsXml += `
        <Row ss:Height="18">
          <Cell ss:StyleID="CenterStyle"><Data ss:Type="String">${escapeXml(typeHebrew)}</Data></Cell>
          <Cell ss:StyleID="CenterStyle"><Data ss:Type="String">${escapeXml(sanitizeSpreadsheetText(d.documentNumber || 'טיוטה'))}</Data></Cell>
          <Cell ss:StyleID="CenterStyle"><Data ss:Type="String">${escapeXml(d.date)}</Data></Cell>
          <Cell ss:StyleID="TextStyle"><Data ss:Type="String">${escapeXml(sanitizeSpreadsheetText(d.clientName))}</Data></Cell>
          <Cell ss:StyleID="CenterStyle"><Data ss:Type="String">${escapeXml(d.dueDate || '-')}</Data></Cell>
          <Cell ss:StyleID="CenterStyle"><Data ss:Type="String">${escapeXml(d.currency || '₪')}</Data></Cell>
          <Cell ss:StyleID="NumberStyle"><Data ss:Type="Number">${d.totalAmount || 0}</Data></Cell>
          <Cell ss:StyleID="NumberStyle"><Data ss:Type="Number">${d.paidAmount || 0}</Data></Cell>
          <Cell ss:StyleID="NumberStyle"><Data ss:Type="Number">${rem}</Data></Cell>
          <Cell ss:StyleID="CenterStyle"><Data ss:Type="String">${escapeXml(statusHebrew)}</Data></Cell>
        </Row>`;
    }

    docRowsXml += `
      <Row ss:Height="20" ss:StyleID="SummaryStyle">
        <Cell ss:MergeAcross="5"><Data ss:Type="String">סה״כ מסמכים (${monthDocs.length}):</Data></Cell>
        <Cell ss:StyleID="SummaryNumberStyle"><Data ss:Type="Number">${Math.round(sumTotal * 100) / 100}</Data></Cell>
        <Cell ss:StyleID="SummaryNumberStyle"><Data ss:Type="Number">${Math.round(sumPaid * 100) / 100}</Data></Cell>
        <Cell ss:StyleID="SummaryNumberStyle"><Data ss:Type="Number">${Math.round(sumRemaining * 100) / 100}</Data></Cell>
        <Cell><Data ss:Type="String">-</Data></Cell>
      </Row>`;

    worksheetsXml += `
      <Worksheet ss:Name="ספר מסמכים">
        <Table ss:DefaultColumnWidth="90">
          <Column ss:Width="100" />
          <Column ss:Width="90" />
          <Column ss:Width="80" />
          <Column ss:Width="150" />
          <Column ss:Width="80" />
          <Column ss:Width="50" />
          <Column ss:Width="90" />
          <Column ss:Width="90" />
          <Column ss:Width="90" />
          <Column ss:Width="130" />
          ${docRowsXml}
        </Table>
        <WorksheetOptions xmlns="urn:schemas-microsoft-com:office:excel">
          <DisplayRightToLeft />
        </WorksheetOptions>
      </Worksheet>`;

    // 3. Receipts Worksheet (by payment received date)
    const monthReceipts = documents.filter(d => {
      if (d.type !== 'receipt' || d.status === 'canceled') return false;
      const rDate = d.paymentReceivedDate || d.date;
      return rDate.startsWith(monthPrefix);
    });

    let receiptRowsXml = `
      <Row ss:Height="26">
        <Cell ss:MergeAcross="7" ss:StyleID="TitleStyle">
          <Data ss:Type="String">תקבולים שנגבו - חודש ${monthPad}/${year} (בסיס: תאריך קבלת התשלום בפועל)</Data>
        </Cell>
      </Row>
      <Row ss:Height="18">
        <Cell ss:MergeAcross="7" ss:StyleID="NoticeStyle">
          <Data ss:Type="String">קבלות ואישורי תשלום שנגבו בפועל בחודש זה. מציג פירוט אמצעי תשלום ושיוך לחשבונות עסקה.</Data>
        </Cell>
      </Row>
      <Row ss:Height="22">
        <Cell ss:StyleID="HeaderStyle"><Data ss:Type="String">מספר קבלה</Data></Cell>
        <Cell ss:StyleID="HeaderStyle"><Data ss:Type="String">תאריך קבלת התשלום</Data></Cell>
        <Cell ss:StyleID="HeaderStyle"><Data ss:Type="String">לקוח</Data></Cell>
        <Cell ss:StyleID="HeaderStyle"><Data ss:Type="String">סכום ששולם</Data></Cell>
        <Cell ss:StyleID="HeaderStyle"><Data ss:Type="String">מטבע</Data></Cell>
        <Cell ss:StyleID="HeaderStyle"><Data ss:Type="String">אמצעי תשלום</Data></Cell>
        <Cell ss:StyleID="HeaderStyle"><Data ss:Type="String">פרטי אסמכתא</Data></Cell>
        <Cell ss:StyleID="HeaderStyle"><Data ss:Type="String">שויך לחשבון עסקה מס׳</Data></Cell>
      </Row>`;

    let sumReceipts = 0;
    for (const r of monthReceipts) {
      sumReceipts += r.totalAmount || 0;
      const methods = (r.paymentMethods || []).map(m => {
        const typeStr = m.type === 'bank_transfer' ? 'העברה בנקאית' : m.type === 'credit_card' ? 'כרטיס אשראי' : m.type === 'cash' ? 'מזומן' : m.type === 'check' ? 'המחאה' : 'אחר';
        return `${typeStr}: ${m.amount} ${r.currency || '₪'}`;
      }).join('; ');
      const references = (r.paymentMethods || []).map(m => m.referenceNumber || m.transactionReference || m.checkNumber || '').filter(Boolean).join('; ');
      const linkedPr = (r.paymentAllocations || []).map(a => a.paymentRequestId).join('; ');

      receiptRowsXml += `
        <Row ss:Height="18">
          <Cell ss:StyleID="CenterStyle"><Data ss:Type="String">${escapeXml(sanitizeSpreadsheetText(r.documentNumber || 'טיוטה'))}</Data></Cell>
          <Cell ss:StyleID="CenterStyle"><Data ss:Type="String">${escapeXml(r.paymentReceivedDate || r.date)}</Data></Cell>
          <Cell ss:StyleID="TextStyle"><Data ss:Type="String">${escapeXml(sanitizeSpreadsheetText(r.clientName))}</Data></Cell>
          <Cell ss:StyleID="NumberStyle"><Data ss:Type="Number">${r.totalAmount || 0}</Data></Cell>
          <Cell ss:StyleID="CenterStyle"><Data ss:Type="String">${escapeXml(r.currency || '₪')}</Data></Cell>
          <Cell ss:StyleID="TextStyle"><Data ss:Type="String">${escapeXml(sanitizeSpreadsheetText(methods || 'העברה בנקאית'))}</Data></Cell>
          <Cell ss:StyleID="TextStyle"><Data ss:Type="String">${escapeXml(sanitizeSpreadsheetText(references))}</Data></Cell>
          <Cell ss:StyleID="CenterStyle"><Data ss:Type="String">${escapeXml(sanitizeSpreadsheetText(linkedPr))}</Data></Cell>
        </Row>`;
    }

    receiptRowsXml += `
      <Row ss:Height="20" ss:StyleID="SummaryStyle">
        <Cell ss:MergeAcross="2"><Data ss:Type="String">סה״כ תקבולים (${monthReceipts.length}):</Data></Cell>
        <Cell ss:StyleID="SummaryNumberStyle"><Data ss:Type="Number">${Math.round(sumReceipts * 100) / 100}</Data></Cell>
        <Cell ss:MergeAcross="3"><Data ss:Type="String">-</Data></Cell>
      </Row>`;

    worksheetsXml += `
      <Worksheet ss:Name="תקבולים שנגבו">
        <Table ss:DefaultColumnWidth="90">
          <Column ss:Width="90" />
          <Column ss:Width="90" />
          <Column ss:Width="150" />
          <Column ss:Width="90" />
          <Column ss:Width="50" />
          <Column ss:Width="160" />
          <Column ss:Width="120" />
          <Column ss:Width="110" />
          ${receiptRowsXml}
        </Table>
        <WorksheetOptions xmlns="urn:schemas-microsoft-com:office:excel">
          <DisplayRightToLeft />
        </WorksheetOptions>
      </Worksheet>`;
  }

  return `<?xml version="1.0" encoding="UTF-8"?>
<?mso-application progid="Excel.Sheet"?>
<Workbook xmlns="urn:schemas-microsoft-com:office:spreadsheet"
 xmlns:o="urn:schemas-microsoft-com:office:office"
 xmlns:x="urn:schemas-microsoft-com:office:excel"
 xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet"
 xmlns:html="http://www.w3.org/TR/REC-html40">
 <Styles>
  <Style ss:ID="Default" ss:Name="Normal">
   <Alignment ss:Vertical="Center" ss:ReadingOrder="RightToLeft" />
   <Font ss:FontName="Heebo" x:CharSet="177" ss:Size="10" ss:Color="#2B1816" />
  </Style>
  <Style ss:ID="TitleStyle">
   <Font ss:FontName="Heebo" x:CharSet="177" ss:Size="14" ss:Bold="1" ss:Color="#88463F" />
   <Alignment ss:Horizontal="Right" ss:Vertical="Center" />
  </Style>
  <Style ss:ID="NoticeStyle">
   <Font ss:FontName="Heebo" x:CharSet="177" ss:Size="9" ss:Italic="1" ss:Color="#7D5A56" />
   <Alignment ss:Horizontal="Right" ss:Vertical="Center" />
  </Style>
  <Style ss:ID="HeaderStyle">
   <Font ss:FontName="Heebo" x:CharSet="177" ss:Size="10" ss:Bold="1" ss:Color="#88463F" />
   <Interior ss:Color="#FAF4F2" ss:Pattern="Solid" />
   <Borders>
    <Border ss:Position="Bottom" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#BC796F" />
    <Border ss:Position="Top" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#EAE1DF" />
    <Border ss:Position="Left" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#EAE1DF" />
    <Border ss:Position="Right" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#EAE1DF" />
   </Borders>
   <Alignment ss:Horizontal="Center" ss:Vertical="Center" />
  </Style>
  <Style ss:ID="TextStyle">
   <Alignment ss:Horizontal="Right" ss:Vertical="Center" />
   <Borders>
    <Border ss:Position="Bottom" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#EAE1DF" />
   </Borders>
  </Style>
  <Style ss:ID="CenterStyle">
   <Alignment ss:Horizontal="Center" ss:Vertical="Center" />
   <Borders>
    <Border ss:Position="Bottom" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#EAE1DF" />
   </Borders>
  </Style>
  <Style ss:ID="NumberStyle">
   <Alignment ss:Horizontal="Right" ss:Vertical="Center" />
   <NumberFormat ss:Format="#,##0.00" />
   <Borders>
    <Border ss:Position="Bottom" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#EAE1DF" />
   </Borders>
  </Style>
  <Style ss:ID="SummaryStyle">
   <Font ss:FontName="Heebo" x:CharSet="177" ss:Size="10" ss:Bold="1" ss:Color="#88463F" />
   <Interior ss:Color="#F4ECE9" ss:Pattern="Solid" />
   <Borders>
    <Border ss:Position="Top" ss:LineStyle="Continuous" ss:Weight="2" ss:Color="#BC796F" />
    <Border ss:Position="Bottom" ss:LineStyle="Double" ss:Weight="3" ss:Color="#BC796F" />
   </Borders>
   <Alignment ss:Horizontal="Right" ss:Vertical="Center" />
  </Style>
  <Style ss:ID="SummaryNumberStyle">
   <Font ss:FontName="Heebo" x:CharSet="177" ss:Size="10" ss:Bold="1" ss:Color="#88463F" />
   <Interior ss:Color="#F4ECE9" ss:Pattern="Solid" />
   <Borders>
    <Border ss:Position="Top" ss:LineStyle="Continuous" ss:Weight="2" ss:Color="#BC796F" />
    <Border ss:Position="Bottom" ss:LineStyle="Double" ss:Weight="3" ss:Color="#BC796F" />
   </Borders>
   <Alignment ss:Horizontal="Right" ss:Vertical="Center" />
   <NumberFormat ss:Format="#,##0.00" />
  </Style>
 </Styles>
 ${worksheetsXml}
</Workbook>`;
}
