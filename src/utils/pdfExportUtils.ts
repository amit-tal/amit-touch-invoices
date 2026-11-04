import type { AppDocument, BusinessSettings } from '../types/documents';

/**
 * Downloads a clean, standalone PDF of the document directly,
 * with NO browser print dialog, NO browser headers/footers, and NO URLs.
 */
export async function downloadDocumentPdf(
  doc: AppDocument,
  business: BusinessSettings,
  onStatusChange?: (isExporting: boolean) => void,
  showToast?: (msg: string) => void
): Promise<boolean> {
  onStatusChange?.(true);
  try {
    const res = await fetch('/api/documents/export-pdf', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        documentId: doc.id,
        document: doc,
        business,
      }),
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error || 'שגיאה ביצירת קובץ ה-PDF');
    }

    const blob = await res.blob();
    const url = window.URL.createObjectURL(blob);
    const a = window.document.createElement('a');
    a.href = url;

    const typeLabel = doc.type === 'payment_request' ? 'חשבון_עסקה' : doc.type === 'receipt' ? 'קבלה' : 'הצעת_מחיר';
    const numLabel = doc.documentNumber || 'טיוטה';
    a.download = `${typeLabel}_${numLabel}.pdf`;

    window.document.body.appendChild(a);
    a.click();
    a.remove();
    window.URL.revokeObjectURL(url);

    showToast?.('קובץ ה-PDF הורד בהצלחה');
    return true;
  } catch (error: any) {
    console.error('Direct PDF export error:', error);
    showToast?.(error?.message || 'שגיאה בשמירת קובץ ה-PDF');
    return false;
  } finally {
    onStatusChange?.(false);
  }
}
