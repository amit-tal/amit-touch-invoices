import React from 'react';
import type { AppDocument, BusinessSettings } from '../../types/documents';
import { DOCUMENT_TITLES, formatCurrency } from '../../utils/moneyUtils';
import { useDocuments } from '../../context/DocumentsContext';
import { SIGNATURE_DATA_URI } from '../../assets/signatureDataUri';

interface DocumentPdfPrintViewProps {
  document: AppDocument;
  business?: BusinessSettings;
  isDraftOrTest?: boolean;
}

export const DocumentPdfPrintView: React.FC<DocumentPdfPrintViewProps> = ({
  document: doc,
  business: propBusiness,
  isDraftOrTest,
}) => {
  const { businessSettings } = useDocuments();

  // 1. If document was issued, strictly use its frozen immutable snapshot at issuance!
  // 2. Otherwise (for drafts and live editor previews), use the live shared business profile.
  const b = doc.snapshot?.business || propBusiness || businessSettings;

  const client = doc.snapshot?.client || {
    name: doc.clientName,
    businessNumber: doc.clientBusinessNumber,
    address: doc.clientAddress,
    email: doc.clientEmail,
    contactPerson: doc.clientContactPerson,
  };
  const totals = doc.snapshot?.totals || {
    subtotal: doc.subtotal,
    discountTotal: doc.discountTotal,
    vatTotal: b.businessType === 'exempt' ? 0 : doc.vatTotal,
    vatRate: b.businessType === 'exempt' ? 0 : (b.vatRate ?? 0.18),
    totalAmount: b.businessType === 'exempt' ? (doc.subtotal - doc.discountTotal) : doc.totalAmount,
    currency: doc.currency || b.currency,
  };
  const lines = doc.snapshot?.lineItems || doc.lineItems;

  const isDraft = !doc.status || doc.status === 'draft';
  const isCanceled = doc.status === 'canceled';
  const isIssued = doc.status === 'issued';
  const isOfficialIssued = isIssued && !doc.isTestMode;
  const isTestIssued = isIssued && doc.isTestMode;

  // Signature display rules:
  // - Show signature on new documents and existing editable drafts (isDraftOrNew)
  // - Resolves using embedded base64 data URI (SIGNATURE_DATA_URI), ensuring immediate synchronous loading in preview & PDF export.
  // - For previously issued documents, historical snapshot immutability is preserved: only shown if recorded in snapshot.
  const isDraftOrNew = !doc.status || doc.status === 'draft' || isDraftOrTest;
  const rawSignatureUrl = isDraftOrNew
    ? (b.signatureUrl || SIGNATURE_DATA_URI)
    : (doc.snapshot?.signatureUrl || doc.snapshot?.business?.signatureUrl);

  const signatureUrl = rawSignatureUrl === '/signiture.png' || rawSignatureUrl === '/signature.png'
    ? SIGNATURE_DATA_URI
    : rawSignatureUrl;

  const docTitle = DOCUMENT_TITLES[doc.type] || 'מסמך';

  return (
    <div
      dir="rtl"
      className="document-printable-wrapper document-pdf-view bg-white text-[#2D1816] font-heebo p-8 sm:p-12 max-w-[800px] mx-auto shadow-lg print:shadow-none print:p-0 print:max-w-none text-right relative overflow-hidden leading-relaxed"
      style={{ minHeight: '1050px' }}
    >
      {/* Draft Watermark (Shown strictly on drafts, removed on successfully issued documents) */}
      {isDraft && (
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none select-none z-10 opacity-[0.08] rotate-[-28deg]">
          <span className="text-7xl sm:text-8xl font-black text-[#BC796F] tracking-widest border-8 border-[#BC796F] p-6 rounded-3xl">
            טיוטה — לא מסמך רשמי
          </span>
        </div>
      )}

      {isCanceled && (
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none select-none z-10 opacity-[0.14] rotate-[-28deg]">
          <span className="text-8xl sm:text-9xl font-black text-red-700 tracking-widest border-8 border-red-700 p-8 rounded-3xl">
            מ ב ו ט ל
          </span>
        </div>
      )}

      {/* Top Header with AMIT TOUCH Branding & Document Header */}
      <div className="flex items-start justify-between border-b-2 border-[#BC796F]/30 pb-6 mb-8">
        {/* Right side (in RTL): Document Title, Number & Status */}
        <div className="flex flex-col">
          <div className="flex flex-wrap items-center gap-3">
            <h1 className="text-2xl sm:text-3xl font-bold text-warm-950 tracking-tight">
              {docTitle}
            </h1>
            {isOfficialIssued ? (
              <div className="flex items-center gap-1.5">
                {doc.type === 'receipt' && !doc.isPaperReceipt && (
                  <span className="inline-flex items-center whitespace-nowrap shrink-0 px-3.5 py-1 rounded-full bg-[#BC796F]/15 text-[#88463F] text-xs font-bold font-heebo border border-[#BC796F]/30 shadow-xs">
                    מסמך ממוחשב
                  </span>
                )}
                <span className="inline-flex items-center whitespace-nowrap shrink-0 px-3.5 py-1 rounded-full bg-stone-100 text-stone-800 text-xs font-bold font-heebo border border-stone-300 shadow-xs">
                  מקור
                </span>
              </div>
            ) : isTestIssued ? (
              <span className="inline-flex items-center whitespace-nowrap shrink-0 px-3.5 py-1 rounded-full bg-amber-100 text-amber-900 text-xs font-bold font-heebo border border-amber-300 shadow-xs">
                מסמך בדיקה (TEST)
              </span>
            ) : isCanceled ? (
              <span className="inline-flex items-center whitespace-nowrap shrink-0 px-3.5 py-1 rounded-full bg-red-100 text-red-800 text-xs font-bold font-heebo border border-red-300">
                מסמך מבוטל
              </span>
            ) : (
              <span className="inline-flex items-center whitespace-nowrap shrink-0 px-3.5 py-1 rounded-full bg-[#BC796F]/15 text-[#88463F] text-xs font-bold font-heebo border border-[#BC796F]/30 shadow-xs">
                טיוטה — לא מסמך רשמי
              </span>
            )}
          </div>

          <div className="flex items-center gap-3 mt-2 text-sm text-[#7D5A56]">
            <span>מספר מסמך:</span>
            <strong dir="ltr" className="font-bold text-warm-950 text-base tabular-nums">
              {!isDraft ? (doc.documentNumber || '') : ''}
            </strong>
          </div>

          <div className="flex items-center gap-4 mt-1 text-xs text-[#7D5A56]">
            <span>תאריך הפקה: <strong>{doc.date}</strong></span>
            {doc.type === 'receipt' && (
              <span>תאריך קבלת התשלום בפועל: <strong className="text-emerald-800">{doc.paymentReceivedDate || doc.snapshot?.paymentReceivedDate || doc.date}</strong></span>
            )}
            {doc.type === 'payment_request' && doc.dueDate && (
              <span>תאריך פירעון: <strong className="text-[#88463F]">{doc.dueDate}</strong></span>
            )}
            {doc.type === 'quote' && doc.validUntilDate && (
              <span>בתוקף עד: <strong className="text-[#88463F]">{doc.validUntilDate}</strong></span>
            )}
          </div>
        </div>

        {/* Left side (in RTL): Official Logo & Business Details */}
        <div className="flex flex-col items-end text-left">
          <img
            src={b.logoUrl || "/amit-touch-logo.png"}
            alt={b.tradingName || b.legalName || "AMIT TOUCH"}
            className="h-16 w-auto object-contain mb-2 select-none"
          />
          <div className="text-xs text-[#7D5A56] space-y-0.5 text-left">
            <div className="font-bold text-warm-900 text-sm">{b.tradingName || b.legalName}</div>
            {b.tradingName && b.legalName && b.tradingName !== b.legalName && (
              <div>{b.legalName}</div>
            )}
            <div dir="ltr">
              {b.businessType === 'exempt' ? 'עוסק פטור' : b.businessType === 'licensed' ? 'עוסק מורשה' : 'ח.פ'}: {b.businessNumber}
            </div>
            <div>{b.address}</div>
            <div dir="ltr">{b.phone} | {b.email}</div>
          </div>
        </div>
      </div>

      {/* Customer Info Box & Project Association */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 p-4 rounded-2xl bg-warm-50/70 border border-[#BC796F]/20 mb-8 text-xs">
        <div>
          <span className="text-[11px] font-bold text-[#88463F] block mb-1">
            {doc.type === 'receipt' ? 'התקבל מאת (המשלם):' : 'לכבוד / הלקוח:'}
          </span>
          <div className="text-sm font-bold text-warm-950">{client.name}</div>
          {client.businessNumber && (
            <div dir="ltr" className="text-right text-[#7D5A56] mt-0.5">
              ע.מ / ח.פ: <strong>{client.businessNumber}</strong>
            </div>
          )}
          {client.address && <div className="text-[#7D5A56] mt-0.5">{client.address}</div>}
          {client.contactPerson && <div className="text-[#7D5A56]">איש קשר: {client.contactPerson}</div>}
          {client.email && <div dir="ltr" className="text-right text-[#7D5A56]">{client.email}</div>}
        </div>

        <div className="flex flex-col justify-between sm:text-left text-right">
          <div>
            {doc.projectName && (
              <div className="mb-1">
                <span className="text-[11px] font-bold text-[#88463F] block">פרויקט:</span>
                <span className="text-sm font-semibold text-warm-900">{doc.projectName}</span>
              </div>
            )}
            {doc.customerRef && (
              <div className="mt-1">
                <span className="text-[11px] text-[#7D5A56]">אסמכתא / הזמנת רכש (PO):</span>
                <strong dir="ltr" className="block font-medium text-warm-900">{doc.customerRef}</strong>
              </div>
            )}
          </div>

          {doc.type === 'payment_request' && (doc.dueDateExplanation || doc.paymentTerms) && (
            <div className="mt-2 p-2 rounded-lg bg-white/80 border border-[#BC796F]/15 text-[11px] text-[#7D5A56]">
              <span className="font-bold text-[#88463F]">תנאי תשלום: </span>
              {doc.paymentTerms || b.defaultPaymentTerms}
              {doc.dueDateExplanation && (
                <div className="text-[10px] text-[#7D5A56]/90 mt-0.5">{doc.dueDateExplanation}</div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Quote Scope & Subject (if quote) */}
      {doc.type === 'quote' && (doc.title || doc.scopeAndDeliverables) && (
        <div className="mb-6 p-4 rounded-2xl bg-white border border-[#BC796F]/20 text-xs">
          {doc.title && <h3 className="text-sm font-bold text-warm-950 mb-1">{doc.title}</h3>}
          {doc.scopeAndDeliverables && (
            <p className="text-[#7D5A56] whitespace-pre-line leading-relaxed">{doc.scopeAndDeliverables}</p>
          )}
        </div>
      )}

      {/* Line Items Table */}
      <div className="mb-8 overflow-hidden rounded-2xl border border-[#BC796F]/20">
        <table className="w-full text-right text-xs">
          <thead>
            <tr className="bg-[#BC796F]/15 text-warm-950 border-b border-[#BC796F]/25 font-bold">
              <th className="py-2.5 px-3 w-10 text-center">#</th>
              <th className="py-2.5 px-3">תיאור השירות / הפריט</th>
              <th className="py-2.5 px-3 text-center w-20">כמות</th>
              <th className="py-2.5 px-3 text-center w-20">יחידה</th>
              <th className="py-2.5 px-3 text-left w-24">מחיר יחידה</th>
              {lines.some(l => l.discount > 0) && (
                <th className="py-2.5 px-3 text-center w-16">הנחה</th>
              )}
              <th className="py-2.5 px-3 text-left w-28">סה״כ</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[#BC796F]/10">
            {lines.map((line, idx) => (
              <tr key={line.id || idx} className="hover:bg-warm-50/40">
                <td className="py-2.5 px-3 text-center text-[#7D5A56] tabular-nums">{idx + 1}</td>
                <td className="py-2.5 px-3 font-medium text-warm-950 whitespace-pre-line">
                  {line.description}
                </td>
                <td className="py-2.5 px-3 text-center font-medium tabular-nums" dir="ltr">
                  {line.quantity}
                </td>
                <td className="py-2.5 px-3 text-center text-[#7D5A56]">{line.unit || 'יח׳'}</td>
                <td className="py-2.5 px-3 text-left font-medium tabular-nums" dir="ltr">
                  {formatCurrency(line.unitPrice, totals.currency)}
                </td>
                {lines.some(l => l.discount > 0) && (
                  <td className="py-2.5 px-3 text-center text-[#88463F] tabular-nums" dir="ltr">
                    {line.discount > 0 ? `${line.discount}${line.discountType === 'percent' ? '%' : '₪'}` : '—'}
                  </td>
                )}
                <td className="py-2.5 px-3 text-left font-bold text-warm-950 tabular-nums" dir="ltr">
                  {formatCurrency(line.lineTotal, totals.currency)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Totals Summary Block */}
      <div className="flex justify-end mb-8">
        <div className="w-72 space-y-2 p-4 rounded-2xl bg-warm-50/80 border border-[#BC796F]/20 text-xs">
          <div className="flex justify-between text-[#7D5A56]">
            <span>סכום ביניים:</span>
            <span dir="ltr" className="font-semibold text-warm-950 tabular-nums">
              {formatCurrency(totals.subtotal, totals.currency)}
            </span>
          </div>

          {totals.discountTotal > 0 && (
            <div className="flex justify-between text-emerald-800">
              <span>הנחה כוללת:</span>
              <span dir="ltr" className="font-semibold tabular-nums">
                -{formatCurrency(totals.discountTotal, totals.currency)}
              </span>
            </div>
          )}

          {b.businessType !== 'exempt' && totals.vatRate > 0 && (
            <div className="flex justify-between text-[#7D5A56]">
              <span>מע״מ ({(totals.vatRate * 100).toFixed(0)}%):</span>
              <span dir="ltr" className="font-semibold text-warm-950 tabular-nums">
                {formatCurrency(totals.vatTotal, totals.currency)}
              </span>
            </div>
          )}

          {b.businessType === 'exempt' && (
            <div className="text-[11px] text-[#7D5A56] border-t border-[#BC796F]/15 pt-1">
              עוסק פטור — לא נגבה מע״מ (פטור מתשלום מע״מ לפי סעיף 31(3) לחוק מע״מ).
            </div>
          )}

          <div className="flex justify-between items-center pt-2 border-t-2 border-[#BC796F]/30 text-sm font-bold text-[#88463F]">
            <span>{doc.type === 'receipt' ? 'סה״כ התקבל:' : doc.type === 'payment_request' ? 'סה״כ לתשלום:' : 'סה״כ:'}</span>
            <span dir="ltr" className="text-base text-warm-950 tabular-nums font-black">
              {formatCurrency(totals.totalAmount, totals.currency)}
            </span>
          </div>

          {/* Paid & Remaining Balance (For Payment Requests) */}
          {doc.type === 'payment_request' && doc.paidAmount > 0 && (
            <div className="pt-2 border-t border-[#BC796F]/15 space-y-1 text-[11px]">
              <div className="flex justify-between text-emerald-700">
                <span>סך ששולם עד כה:</span>
                <span dir="ltr" className="font-bold tabular-nums">
                  {formatCurrency(doc.paidAmount, totals.currency)}
                </span>
              </div>
              <div className="flex justify-between text-[#88463F] font-bold">
                <span>יתרה פתוחה לתשלום:</span>
                <span dir="ltr" className="font-bold tabular-nums">
                  {formatCurrency(doc.remainingBalance, totals.currency)}
                </span>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Receipt Specific: Payment Methods Received & Actual Payment Date */}
      {doc.type === 'receipt' && (
        <div className="mb-8 p-4 rounded-2xl bg-emerald-50/70 border border-emerald-300 text-xs shadow-xs">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-emerald-200/80 pb-2 mb-2.5">
            <h4 className="font-bold text-emerald-950 text-sm">פירוט תקבולים ואמצעי תשלום:</h4>
            {(doc.paymentReceivedDate || doc.snapshot?.paymentReceivedDate || doc.date) && (
              <span className="text-emerald-900 font-medium text-[11px]">
                תאריך קבלת התשלום בפועל: <strong>{doc.paymentReceivedDate || doc.snapshot?.paymentReceivedDate || doc.date}</strong>
              </span>
            )}
          </div>
          {((doc.paymentMethods && doc.paymentMethods.length > 0) || (doc.snapshot?.paymentMethods && doc.snapshot.paymentMethods.length > 0)) ? (
            <div className="space-y-2">
              {(doc.paymentMethods || doc.snapshot?.paymentMethods || []).map((m, i) => (
                <div key={m.id || i} className="flex justify-between items-center py-1.5 border-b border-emerald-200/60 last:border-0">
                  <div>
                    <div className="font-bold text-emerald-950 text-xs">
                      {m.type === 'bank_transfer' && 'העברה בנקאית'}
                      {m.type === 'credit_card' && `כרטיס אשראי (סיום: ${m.cardLast4 || '****'})`}
                      {m.type === 'check' && `המחאה (מס': ${m.checkNumber || ''})`}
                      {m.type === 'cash' && 'מזומן'}
                      {m.type === 'other' && (m.otherDescription || 'אמצעי תשלום אחר / יישום תשלום')}
                    </div>
                    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-emerald-800 mt-0.5">
                      {m.referenceNumber && (
                        <span>מספר אסמכתא: <strong>{m.referenceNumber}</strong></span>
                      )}
                      {m.transactionReference && (
                        <span>אישור עסקה: <strong>{m.transactionReference}</strong></span>
                      )}
                      {m.type === 'check' && (
                        <>
                          {m.bankName && <span>בנק: <strong>{m.bankName}</strong></span>}
                          {m.branch && <span>סניף: <strong>{m.branch}</strong></span>}
                          {(m as any).checkDueDate && <span>תאריך פירעון: <strong>{(m as any).checkDueDate}</strong></span>}
                        </>
                      )}
                    </div>
                  </div>
                  <span dir="ltr" className="font-bold text-emerald-950 tabular-nums text-sm">
                    {formatCurrency(m.amount, totals.currency)}
                  </span>
                </div>
              ))}
            </div>
          ) : (
            <div className="text-[11px] text-emerald-800 italic py-1">
              טרם הוזנו אמצעי תשלום
            </div>
          )}
        </div>
      )}

      {/* Bank Details & Payment Instructions (for Payment Requests and Quotes) */}
      {doc.type !== 'receipt' && b.bankDetails?.accountNumber && (
        <div className="mb-6 p-4 rounded-2xl bg-warm-50/70 border border-[#BC796F]/20 text-xs">
          <h4 className="font-bold text-[#88463F] mb-1.5">פרטי חשבון בנק להעברות:</h4>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-[#7D5A56]">
            <div>בנק: <strong className="text-warm-900">{b.bankDetails.bankName}</strong></div>
            <div>סניף: <strong className="text-warm-900">{b.bankDetails.branch}</strong></div>
            <div dir="ltr" className="text-right">חשבון: <strong className="text-warm-900">{b.bankDetails.accountNumber}</strong></div>
            <div>שם מוטב: <strong className="text-warm-900">{b.bankDetails.accountName}</strong></div>
          </div>
        </div>
      )}

      {/* Document Notes & Terms */}
      {(doc.notes || b.defaultNotes) && (
        <div className="mb-8 text-xs text-[#7D5A56] leading-relaxed border-t border-[#BC796F]/15 pt-4">
          <span className="font-bold text-warm-900 block mb-0.5">הערות ותנאים:</span>
          <p className="whitespace-pre-line">{doc.notes || b.defaultNotes}</p>
        </div>
      )}

      {/* Cancellation Banner & Reason if canceled */}
      {isCanceled && doc.cancelReason && (
        <div className="mb-6 p-4 rounded-xl bg-red-50 border border-red-300 text-xs text-red-900">
          <span className="font-bold block mb-0.5">סיבת ביטול המסמך:</span>
          <p>{doc.cancelReason}</p>
          {doc.canceledAt && <span className="text-[10px] text-red-700 mt-1 block">בוטל בתאריך: {doc.canceledAt}</span>}
        </div>
      )}

      {/* Signature & Stamp Area */}
      <div 
        className="mt-auto pt-8 border-t border-[#BC796F]/20 flex justify-between items-end text-xs text-[#7D5A56] break-inside-avoid"
        style={{ breakInside: 'avoid', pageBreakInside: 'avoid' }}
      >
        <div>
          <span>הופק באמצעות מערכת AMIT TOUCH Studio Management</span>
          {doc.type === 'receipt' && isIssued && !doc.isPaperReceipt && (
            <div className="mt-1.5 text-[11px] text-[#7D5A56] leading-relaxed" dir="rtl">
              <div className="font-bold text-[#88463F]">חתימה דיגיטלית מאובטחת</div>
              <div>מסמך ממוחשב הופק על ידי AMIT TOUCH</div>
            </div>
          )}
        </div>
        <div 
          className="text-center w-52 flex flex-col items-center justify-end break-inside-avoid"
          style={{ breakInside: 'avoid', pageBreakInside: 'avoid' }}
        >
          {signatureUrl ? (
            <div className="h-16 flex items-end justify-center mb-1">
              <img
                src={signatureUrl}
                alt="חתימת העסק"
                className="max-h-16 w-auto max-w-[190px] object-contain select-none pointer-events-none"
                style={{ imageRendering: 'auto' }}
              />
            </div>
          ) : (
            <div className="h-12" />
          )}
          <div className="w-full border-b border-warm-400 mb-1.5" />
          <span className="font-semibold text-warm-900">חתימה וחותמת העסק</span>
        </div>
      </div>
    </div>
  );
};
