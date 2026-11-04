import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';
import type { AppDocument, BusinessSettings } from '../src/types/documents.ts';
import { SIGNATURE_DATA_URI } from '../src/assets/signatureDataUri.ts';

function formatCurrency(amount: number | string, currency = '₪'): string {
  const num = typeof amount === 'number' ? amount : parseFloat(amount) || 0;
  return `${num.toLocaleString('he-IL', { minimumFractionDigits: 0, maximumFractionDigits: 2 })} ${currency}`;
}

export function generateDocumentHtml(doc: AppDocument, businessSettings?: BusinessSettings): string {
  const defaultBusiness: BusinessSettings = {
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
      accountName: 'אמית טאץ׳ בע״מ'
    },
    defaultPaymentTerms: 'שוטף + 30',
    defaultQuoteValidityDays: 14,
    defaultNotes: 'תודה על שיתוף הפעולה. תנאי תשלום כפי שצוין בדרישה זו.',
    vatRate: 0.18,
    isConfigured: true,
  };

  const b: BusinessSettings = (doc.snapshot?.business || businessSettings || defaultBusiness) as BusinessSettings;

  // Convert logo to base64 if local file exists
  let logoDataUri = b.logoUrl || '/amit-touch-logo.png';
  const localLogoPath = path.resolve(process.cwd(), 'public/amit-touch-logo.png');
  if (fs.existsSync(localLogoPath)) {
    try {
      const logoBuf = fs.readFileSync(localLogoPath);
      logoDataUri = `data:image/png;base64,${logoBuf.toString('base64')}`;
    } catch (e) {}
  }

  const isDraft = !doc.status || doc.status === 'draft';
  const isCanceled = doc.status === 'canceled';
  const isIssued = doc.status === 'issued';
  const isOfficialIssued = isIssued && !doc.isTestMode;
  const isTestIssued = isIssued && doc.isTestMode;
  const isElectronicReceipt = doc.type === 'receipt' && isIssued && !doc.isPaperReceipt;

  const rawSig = isDraft
    ? (b.signatureUrl || SIGNATURE_DATA_URI)
    : (doc.snapshot?.signatureUrl || doc.snapshot?.business?.signatureUrl || SIGNATURE_DATA_URI);
  const signatureUrl = rawSig === '/signiture.png' || rawSig === '/signature.png' ? SIGNATURE_DATA_URI : rawSig;

  const client = doc.snapshot?.client || {
    name: doc.clientName,
    businessNumber: doc.clientBusinessNumber,
    address: doc.clientAddress,
    email: doc.clientEmail,
    contactPerson: doc.clientContactPerson
  };

  const totals = doc.snapshot?.totals || {
    subtotal: doc.subtotal,
    discountTotal: doc.discountTotal,
    vatTotal: doc.vatTotal,
    vatRate: doc.snapshot?.totals?.vatRate ?? 0.18,
    totalAmount: doc.totalAmount,
    currency: doc.currency || b.currency || '₪'
  };

  const lines = doc.snapshot?.lineItems || doc.lineItems || [];
  const docTitle = doc.type === 'payment_request' ? 'חשבון עסקה / דרישת תשלום' : doc.type === 'receipt' ? 'קבלה' : 'הצעת מחיר';

  return `<!DOCTYPE html>
<html dir="rtl" lang="he">
<head>
  <meta charset="utf-8">
  <title>${docTitle} ${doc.documentNumber ? '#' + doc.documentNumber : ''}</title>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Heebo:wght@300;400;500;600;700;800;900&display=swap" rel="stylesheet">
  <style>
    @page {
      size: A4 portrait;
      margin: 10mm 12mm;
    }
    * {
      box-sizing: border-box;
      -webkit-print-color-adjust: exact !important;
      print-color-adjust: exact !important;
    }
    body {
      margin: 0;
      padding: 0;
      background: #ffffff;
      color: #2D1816;
      font-family: 'Heebo', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      direction: rtl;
      font-size: 12px;
      line-height: 1.5;
    }
    .document-wrapper {
      width: 100%;
      max-width: 100%;
      margin: 0 auto;
      background: #ffffff;
      position: relative;
    }
    .header-bar {
      display: flex;
      justify-content: space-between;
      align-items: flex-start;
      border-bottom: 2px solid rgba(188, 121, 111, 0.3);
      padding-bottom: 18px;
      margin-bottom: 22px;
    }
    .doc-meta {
      display: flex;
      flex-direction: column;
    }
    .title-row {
      display: flex;
      align-items: center;
      gap: 12px;
    }
    h1 {
      margin: 0;
      font-size: 24px;
      font-weight: 700;
      color: #1a0f0e;
      letter-spacing: -0.5px;
    }
    .badge {
      display: inline-block;
      padding: 3px 12px;
      border-radius: 9999px;
      font-size: 11px;
      font-weight: 700;
      white-space: nowrap;
    }
    .badge-rose {
      background: rgba(188, 121, 111, 0.15);
      color: #88463F;
      border: 1px solid rgba(188, 121, 111, 0.3);
    }
    .badge-red {
      background: #fee2e2;
      color: #991b1b;
      border: 1px solid #fca5a5;
    }
    .meta-line {
      margin-top: 6px;
      font-size: 13px;
      color: #7D5A56;
      display: flex;
      align-items: center;
      gap: 8px;
    }
    .meta-dates {
      margin-top: 4px;
      font-size: 11px;
      color: #7D5A56;
      display: flex;
      align-items: center;
      gap: 16px;
    }
    .business-info {
      display: flex;
      flex-direction: column;
      align-items: flex-end;
      text-align: left;
    }
    .logo-img {
      height: 56px;
      width: auto;
      max-width: 200px;
      object-fit: contain;
      margin-bottom: 6px;
    }
    .biz-details {
      font-size: 11px;
      color: #7D5A56;
      line-height: 1.4;
      text-align: left;
    }
    .biz-name {
      font-size: 13px;
      font-weight: 700;
      color: #1a0f0e;
    }
    .customer-card {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 16px;
      padding: 14px 16px;
      border-radius: 14px;
      background: #faf7f6;
      border: 1px solid rgba(188, 121, 111, 0.2);
      margin-bottom: 22px;
    }
    .cust-title {
      font-size: 11px;
      font-weight: 700;
      color: #88463F;
      margin-bottom: 2px;
      display: block;
    }
    .cust-name {
      font-size: 14px;
      font-weight: 700;
      color: #1a0f0e;
    }
    .cust-sub {
      color: #7D5A56;
      font-size: 11px;
      margin-top: 2px;
    }
    .items-table {
      width: 100%;
      border-collapse: collapse;
      margin-bottom: 22px;
      border-radius: 14px;
      overflow: hidden;
      border: 1px solid rgba(188, 121, 111, 0.2);
    }
    .items-table th {
      background: rgba(188, 121, 111, 0.14);
      color: #1a0f0e;
      font-weight: 700;
      padding: 9px 12px;
      border-bottom: 1px solid rgba(188, 121, 111, 0.25);
      text-align: right;
    }
    .items-table td {
      padding: 8px 12px;
      border-bottom: 1px solid rgba(188, 121, 111, 0.1);
      vertical-align: top;
    }
    .items-table tr {
      page-break-inside: avoid;
      break-inside: avoid;
    }
    .text-center { text-align: center; }
    .text-left { text-align: left; }
    .totals-area {
      display: flex;
      justify-content: flex-end;
      margin-bottom: 22px;
    }
    .totals-card {
      width: 270px;
      padding: 14px 16px;
      border-radius: 14px;
      background: #faf7f6;
      border: 1px solid rgba(188, 121, 111, 0.2);
      font-size: 12px;
    }
    .total-row {
      display: flex;
      justify-content: space-between;
      margin-bottom: 6px;
      color: #7D5A56;
    }
    .total-final {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-top: 8px;
      padding-top: 8px;
      border-top: 2px solid rgba(188, 121, 111, 0.3);
      font-size: 14px;
      font-weight: 700;
      color: #88463F;
    }
    .total-final strong {
      font-size: 16px;
      color: #1a0f0e;
      font-weight: 900;
    }
    .info-box {
      padding: 12px 14px;
      border-radius: 12px;
      background: #faf7f6;
      border: 1px solid rgba(188, 121, 111, 0.2);
      margin-bottom: 20px;
      font-size: 11px;
      color: #7D5A56;
    }
    .info-box h4 {
      margin: 0 0 6px 0;
      font-size: 12px;
      font-weight: 700;
      color: #88463F;
    }
    .bank-grid {
      display: grid;
      grid-template-columns: repeat(4, 1fr);
      gap: 8px;
    }
    .notes-box {
      border-top: 1px solid rgba(188, 121, 111, 0.15);
      padding-top: 14px;
      margin-bottom: 22px;
      font-size: 11px;
      color: #7D5A56;
      line-height: 1.6;
    }
    .notes-title {
      font-weight: 700;
      color: #1a0f0e;
      margin-bottom: 4px;
      display: block;
    }
    .footer-area {
      margin-top: 28px;
      padding-top: 18px;
      border-top: 1px solid rgba(188, 121, 111, 0.2);
      display: flex;
      justify-content: space-between;
      align-items: flex-end;
      font-size: 11px;
      color: #7D5A56;
      page-break-inside: avoid;
      break-inside: avoid;
    }
    .sig-container {
      width: 200px;
      text-align: center;
      display: flex;
      flex-direction: column;
      align-items: center;
    }
    .sig-img {
      max-height: 56px;
      width: auto;
      max-width: 180px;
      object-fit: contain;
      margin-bottom: 4px;
    }
    .sig-line {
      width: 100%;
      border-bottom: 1px solid #c2b5b3;
      margin-bottom: 6px;
    }
    .sig-label {
      font-weight: 600;
      color: #1a0f0e;
    }
  </style>
</head>
<body>
  <div class="document-wrapper" style="position: relative;">
    ${isDraft ? `
      <div style="position: absolute; top: 40%; left: 8%; right: 8%; text-align: center; font-size: 56px; font-weight: 900; color: rgba(188,121,111,0.08); transform: rotate(-25deg); border: 6px solid rgba(188,121,111,0.08); border-radius: 24px; padding: 14px; pointer-events: none; z-index: 0;">
        טיוטה — לא מסמך רשמי
      </div>
    ` : isCanceled ? `
      <div style="position: absolute; top: 40%; left: 8%; right: 8%; text-align: center; font-size: 64px; font-weight: 900; color: rgba(185,28,28,0.1); transform: rotate(-25deg); border: 6px solid rgba(185,28,28,0.1); border-radius: 24px; padding: 14px; pointer-events: none; z-index: 0;">
        מ ב ו ט ל
      </div>
    ` : ''}

    <div class="header-bar" style="position: relative; z-index: 1;">
      <div class="doc-meta">
        <div class="title-row">
          <h1>${docTitle}</h1>
          ${isOfficialIssued ? `
            ${doc.type === 'receipt' && !doc.isPaperReceipt ? `
              <span class="badge badge-rose" style="background: rgba(188, 121, 111, 0.15); color: #88463F; font-weight: 700;">
                מסמך ממוחשב
              </span>
            ` : ''}
            <span class="badge" style="background: #f3f4f6; color: #374151;">
              מקור
            </span>
          ` : isTestIssued ? `
            <span class="badge" style="background: #fef3c7; color: #92400e; font-weight: 700;">
              מסמך בדיקה (TEST)
            </span>
          ` : `
            <span class="badge ${isCanceled ? 'badge-red' : 'badge-rose'}">
              ${isDraft ? 'טיוטה — לא מסמך רשמי' : 'מסמך מבוטל'}
            </span>
          `}
        </div>
        <div class="meta-line">
          <span>מספר מסמך:</span>
          <strong dir="ltr" style="font-size: 15px; color: #1a0f0e;">${!isDraft ? (doc.documentNumber || '') : ''}</strong>
        </div>
        <div class="meta-dates">
          <span>תאריך הפקה: <strong>${doc.date}</strong></span>
          ${doc.type === 'receipt' ? `<span>תאריך קבלת התשלום בפועל: <strong style="color: #14532d;">${doc.paymentReceivedDate || doc.snapshot?.paymentReceivedDate || doc.date}</strong></span>` : ''}
          ${doc.type === 'payment_request' && doc.dueDate ? `<span>תאריך פירעון: <strong style="color: #88463F;">${doc.dueDate}</strong></span>` : ''}
          ${doc.type === 'quote' && doc.validUntilDate ? `<span>בתוקף עד: <strong style="color: #88463F;">${doc.validUntilDate}</strong></span>` : ''}
        </div>
      </div>

      <div class="business-info">
        <img src="${logoDataUri}" alt="${b.tradingName || b.legalName || 'AMIT TOUCH'}" class="logo-img">
        <div class="biz-details">
          <div class="biz-name">${b.tradingName || b.legalName}</div>
          ${b.tradingName && b.legalName && b.tradingName !== b.legalName ? `<div>${b.legalName}</div>` : ''}
          <div dir="ltr">${b.businessType === 'exempt' ? 'עוסק פטור' : b.businessType === 'licensed' ? 'עוסק מורשה' : 'ח.פ'}: ${b.businessNumber}</div>
          <div>${b.address}</div>
          <div dir="ltr">${b.phone} | ${b.email}</div>
        </div>
      </div>
    </div>

    <div class="customer-card">
      <div>
        <span class="cust-title">${doc.type === 'receipt' ? 'התקבל מאת (המשלם):' : 'לכבוד / הלקוח:'}</span>
        <div class="cust-name">${client.name}</div>
        ${client.businessNumber ? `<div class="cust-sub" dir="ltr" style="text-align: right;">ע.מ / ח.פ / ת.ז: <strong>${client.businessNumber}</strong></div>` : ''}
        ${client.address ? `<div class="cust-sub">${client.address}</div>` : ''}
        ${client.contactPerson ? `<div class="cust-sub">איש קשר: ${client.contactPerson}</div>` : ''}
        ${client.email ? `<div class="cust-sub" dir="ltr" style="text-align: right;">${client.email}</div>` : ''}
      </div>

      <div style="display: flex; flex-direction: column; justify-content: space-between;">
        <div>
          ${doc.projectName ? `<div><span class="cust-title">פרויקט:</span><span style="font-weight: 600; color: #1a0f0e;">${doc.projectName}</span></div>` : ''}
          ${doc.customerRef ? `<div style="margin-top: 4px;"><span class="cust-sub">אסמכתא / הזמנת רכש (PO):</span> <strong dir="ltr">${doc.customerRef}</strong></div>` : ''}
        </div>
        ${doc.type === 'payment_request' && (doc.dueDateExplanation || doc.paymentTerms) ? `
          <div style="margin-top: 6px; padding: 6px 8px; border-radius: 8px; background: #ffffff; border: 1px solid rgba(188, 121, 111, 0.15); font-size: 11px;">
            <span style="font-weight: 700; color: #88463F;">תנאי תשלום: </span>${doc.paymentTerms || b.defaultPaymentTerms || 'שוטף + 30'}
            ${doc.dueDateExplanation ? `<div style="font-size: 10px; color: #7D5A56; margin-top: 2px;">${doc.dueDateExplanation}</div>` : ''}
          </div>
        ` : ''}
      </div>
    </div>

    ${doc.type === 'quote' && (doc.title || doc.scopeAndDeliverables) ? `
      <div class="info-box">
        ${doc.title ? `<div style="font-weight: 700; font-size: 13px; color: #1a0f0e; margin-bottom: 4px;">${doc.title}</div>` : ''}
        ${doc.scopeAndDeliverables ? `<div style="white-space: pre-line;">${doc.scopeAndDeliverables}</div>` : ''}
      </div>
    ` : ''}

    <table class="items-table">
      <thead>
        <tr>
          <th class="text-center" style="width: 36px;">#</th>
          <th>תיאור השירות / הפריט</th>
          <th class="text-center" style="width: 70px;">כמות</th>
          <th class="text-center" style="width: 60px;">יחידה</th>
          <th class="text-left" style="width: 90px;">מחיר יחידה</th>
          ${lines.some(l => l.discount > 0) ? `<th class="text-center" style="width: 65px;">הנחה</th>` : ''}
          <th class="text-left" style="width: 100px;">סה״כ</th>
        </tr>
      </thead>
      <tbody>
        ${lines.map((line, idx) => `
          <tr>
            <td class="text-center" style="color: #7D5A56;">${idx + 1}</td>
            <td style="font-weight: 500; color: #1a0f0e; white-space: pre-line;">${line.description}</td>
            <td class="text-center" dir="ltr">${line.quantity}</td>
            <td class="text-center" style="color: #7D5A56;">${line.unit || 'שעות'}</td>
            <td class="text-left" dir="ltr">${formatCurrency(line.unitPrice, totals.currency)}</td>
            ${lines.some(l => l.discount > 0) ? `<td class="text-center" dir="ltr" style="color: #88463F;">${line.discount > 0 ? `${line.discount}${line.discountType === 'percent' ? '%' : '₪'}` : '—'}</td>` : ''}
            <td class="text-left" dir="ltr" style="font-weight: 700; color: #1a0f0e;">${formatCurrency(line.lineTotal, totals.currency)}</td>
          </tr>
        `).join('')}
      </tbody>
    </table>

    <div class="totals-area">
      <div class="totals-card">
        <div class="total-row">
          <span>סכום ביניים:</span>
          <span dir="ltr" style="font-weight: 600; color: #1a0f0e;">${formatCurrency(totals.subtotal, totals.currency)}</span>
        </div>

        ${totals.discountTotal > 0 ? `
          <div class="total-row" style="color: #065f46;">
            <span>הנחה כוללת:</span>
            <span dir="ltr">-${formatCurrency(totals.discountTotal, totals.currency)}</span>
          </div>
        ` : ''}

        ${b.businessType !== 'exempt' && totals.vatRate > 0 ? `
          <div class="total-row">
            <span>מע״מ (${(totals.vatRate * 100).toFixed(0)}%):</span>
            <span dir="ltr" style="font-weight: 600; color: #1a0f0e;">${formatCurrency(totals.vatTotal, totals.currency)}</span>
          </div>
        ` : ''}

        ${b.businessType === 'exempt' ? `
          <div style="font-size: 10px; color: #7D5A56; border-top: 1px solid rgba(188, 121, 111, 0.15); padding-top: 4px; margin-top: 4px;">
            עוסק פטור — לא נגבה מע״מ (פטור מתשלום מע״מ לפי סעיף 31(3) לחוק מע״מ).
          </div>
        ` : ''}

        <div class="total-final">
          <span>${doc.type === 'receipt' ? 'סה״כ התקבל:' : doc.type === 'payment_request' ? 'סה״כ לתשלום:' : 'סה״כ:'}</span>
          <strong dir="ltr">${formatCurrency(totals.totalAmount, totals.currency)}</strong>
        </div>

        ${doc.type === 'payment_request' && doc.paidAmount > 0 ? `
          <div style="border-top: 1px solid rgba(188, 121, 111, 0.15); padding-top: 6px; margin-top: 6px; font-size: 11px;">
            <div class="total-row" style="color: #047857; font-weight: 600;">
              <span>סך ששולם עד כה:</span>
              <span dir="ltr">${formatCurrency(doc.paidAmount, totals.currency)}</span>
            </div>
            <div class="total-row" style="color: #88463F; font-weight: 700;">
              <span>יתרה פתוחה לתשלום:</span>
              <span dir="ltr">${formatCurrency(doc.remainingBalance, totals.currency)}</span>
            </div>
          </div>
        ` : ''}
      </div>
    </div>

    ${doc.type === 'receipt' && ((doc.paymentMethods && doc.paymentMethods.length > 0) || (doc.snapshot?.paymentMethods && doc.snapshot.paymentMethods.length > 0) || doc.paymentReceivedDate) ? `
      <div class="info-box" style="background: #f0fdf4; border-color: #bbf7d0;">
        <div style="display: flex; justify-content: space-between; align-items: center; border-bottom: 1px solid #bbf7d0; padding-bottom: 6px; margin-bottom: 6px;">
          <h4 style="color: #166534; margin: 0;">פירוט תקבולים ואמצעי תשלום:</h4>
          ${(doc.paymentReceivedDate || doc.snapshot?.paymentReceivedDate || doc.date) ? `
            <span style="font-size: 11px; color: #15803d;">תאריך קבלת התשלום בפועל: <strong>${doc.paymentReceivedDate || doc.snapshot?.paymentReceivedDate || doc.date}</strong></span>
          ` : ''}
        </div>
        <div style="display: flex; flex-direction: column; gap: 4px;">
          ${(doc.paymentMethods || doc.snapshot?.paymentMethods || []).map(m => `
            <div style="display: flex; justify-content: space-between; border-bottom: 1px solid #dcfce7; padding: 4px 0;">
              <div>
                <span style="font-weight: 600; color: #14532d;">
                  ${m.type === 'bank_transfer' ? 'העברה בנקאית' :
                    m.type === 'credit_card' ? `כרטיס אשראי (סיום: ${m.cardLast4 || '****'})` :
                    m.type === 'check' ? `המחאה (מס': ${m.checkNumber || ''})` :
                    m.type === 'cash' ? 'מזומן' : (m.otherDescription || 'אמצעי תשלום')}
                </span>
                ${m.referenceNumber ? `<span style="font-size: 10px; color: #166534; margin-right: 6px;">אסמכתא: ${m.referenceNumber}</span>` : ''}
                ${m.transactionReference ? `<span style="font-size: 10px; color: #166534; margin-right: 6px;">אישור עסקה: ${m.transactionReference}</span>` : ''}
                ${m.type === 'check' ? `
                  <div style="font-size: 10px; color: #15803d; margin-top: 2px;">
                    ${m.bankName ? `בנק: ${m.bankName} ` : ''}
                    ${m.branch ? `סניף: ${m.branch} ` : ''}
                    ${(m as any).checkDueDate ? `תאריך פירעון: <strong>${(m as any).checkDueDate}</strong>` : ''}
                  </div>
                ` : ''}
              </div>
              <span dir="ltr" style="font-weight: 700; color: #14532d;">${formatCurrency(m.amount, totals.currency)}</span>
            </div>
          `).join('')}
        </div>
      </div>
    ` : ''}

    ${doc.type === 'receipt' && ((doc.paymentAllocations && doc.paymentAllocations.length > 0) || (doc.relatedDocumentIds && doc.relatedDocumentIds.length > 0)) ? `
      <div class="info-box" style="background: #fbf7f6; border-color: rgba(188, 121, 111, 0.25);">
        <h4 style="color: #88463F;">שיוך לחשבונות עסקה / דרישות תשלום:</h4>
        <div style="font-size: 11px; color: #2D1816; display: flex; flex-direction: column; gap: 3px;">
          ${(doc.paymentAllocations && doc.paymentAllocations.length > 0)
            ? doc.paymentAllocations.map(a => `<div>ע״ח חשבון עסקה מס׳ <strong>${(a as any).paymentRequestNumber || a.paymentRequestId}</strong> — סכום שנזקף: <strong dir="ltr">${formatCurrency(a.allocatedAmount, totals.currency)}</strong></div>`).join('')
            : `<div>על חשבון / לסילוק חשבון עסקה מס׳: <strong>${doc.relatedDocumentIds?.join(', ')}</strong></div>`}
        </div>
      </div>
    ` : ''}

    ${doc.type !== 'receipt' && b.bankDetails?.accountNumber ? `
      <div class="info-box">
        <h4>פרטי חשבון בנק להעברות:</h4>
        <div class="bank-grid">
          <div>בנק: <strong style="color: #1a0f0e;">${b.bankDetails.bankName}</strong></div>
          <div>סניף: <strong style="color: #1a0f0e;">${b.bankDetails.branch}</strong></div>
          <div dir="ltr" style="text-align: right;">חשבון: <strong style="color: #1a0f0e;">${b.bankDetails.accountNumber}</strong></div>
          <div>שם מוטב: <strong style="color: #1a0f0e;">${b.bankDetails.accountName}</strong></div>
        </div>
      </div>
    ` : ''}

    ${doc.notes || b.defaultNotes ? `
      <div class="notes-box">
        <span class="notes-title">הערות ותנאים:</span>
        <div style="white-space: pre-line;">${doc.notes || b.defaultNotes}</div>
      </div>
    ` : ''}

    ${isCanceled && doc.cancelReason ? `
      <div class="info-box" style="background: #fef2f2; border-color: #fecaca; color: #991b1b;">
        <span style="font-weight: 700; display: block; margin-bottom: 2px;">סיבת ביטול המסמך:</span>
        <div>${doc.cancelReason}</div>
        ${doc.canceledAt ? `<div style="font-size: 10px; color: #b91c1c; margin-top: 4px;">בוטל בתאריך: ${doc.canceledAt}</div>` : ''}
      </div>
    ` : ''}

    <div class="footer-area">
      <div>
        <span>הופק באמצעות מערכת AMIT TOUCH Studio Management</span>
        ${isElectronicReceipt ? `
          <div style="margin-top: 6px; font-size: 11px; color: #7D5A56; line-height: 1.5;" dir="rtl">
            <div style="font-weight: 700; color: #88463F;">חתימה דיגיטלית מאובטחת</div>
            <div>מסמך ממוחשב הופק על ידי AMIT TOUCH</div>
          </div>
        ` : ''}
      </div>
      <div class="sig-container">
        ${signatureUrl ? `
          <img src="${signatureUrl}" alt="חתימת העסק" class="sig-img">
        ` : `<div style="height: 48px;"></div>`}
        <div class="sig-line"></div>
        <span class="sig-label">חתימת העוסק (עמית טל)</span>
      </div>
    </div>
  </div>
</body>
</html>`;
}

export function generateDocumentPdfBuffer(doc: AppDocument, businessSettings?: BusinessSettings): Buffer {
  const html = generateDocumentHtml(doc, businessSettings);

  // Find Chrome/Chromium executable across Linux, Docker, and Windows hosting environments
  const chromeCandidates = [
    process.env.CHROME_BIN,
    process.env.CHROME_PATH,
    process.env.PUPPETEER_EXECUTABLE_PATH,
    '/usr/bin/google-chrome-stable',
    '/usr/bin/google-chrome',
    '/usr/bin/chromium',
    '/usr/bin/chromium-browser',
    '/snap/bin/chromium',
    'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
  ].filter(Boolean) as string[];

  const chromePath = chromeCandidates.find(p => fs.existsSync(p));
  if (!chromePath) {
    throw new Error('Chrome/Chromium browser not found on host machine for PDF generation. Please set CHROME_BIN or install chromium.');
  }

  const tmpDir = path.resolve(process.cwd(), 'scratch');
  if (!fs.existsSync(tmpDir)) {
    fs.mkdirSync(tmpDir, { recursive: true });
  }

  const tmpHtml = path.join(tmpDir, `doc_render_${Date.now()}_${Math.random().toString(36).substring(2, 6)}.html`);
  const tmpPdf = path.join(tmpDir, `doc_render_${Date.now()}_${Math.random().toString(36).substring(2, 6)}.pdf`);

  try {
    fs.writeFileSync(tmpHtml, html, 'utf8');
    const cmd = `"${chromePath}" --headless=new --no-sandbox --disable-gpu --disable-dev-shm-usage --no-pdf-header-footer --print-to-pdf="${tmpPdf}" "${tmpHtml}"`;
    execSync(cmd, { stdio: 'pipe' });

    if (!fs.existsSync(tmpPdf)) {
      throw new Error('Failed to generate PDF from Chrome');
    }

    const pdfBuffer = fs.readFileSync(tmpPdf);
    return pdfBuffer;
  } finally {
    try {
      if (fs.existsSync(tmpHtml)) fs.unlinkSync(tmpHtml);
      if (fs.existsSync(tmpPdf)) fs.unlinkSync(tmpPdf);
    } catch (e) {}
  }
}
