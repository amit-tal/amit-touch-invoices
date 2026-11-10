const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { performance } = require('perf_hooks');

const { generateDocumentHtml, generateDocumentPdfBuffer } = require('../server/pdfGenerator.ts');
const { loadSigningCredentials, signPdfBuffer, verifyPdfDigitalSignature } = require('../server/digitalSignatureService.ts');

async function benchmark() {
  console.log('--- STARTING PERFORMANCE BENCHMARK ---\n');

  const sampleDoc = {
    id: `bench_doc_${Date.now()}`,
    documentNumber: '250025',
    type: 'receipt',
    status: 'issued',
    date: '2026-11-10',
    paymentReceivedDate: '2026-11-10',
    clientId: 'client_bench',
    clientName: 'ענבר עיצובים בע״מ',
    clientBusinessNumber: '515998877',
    clientAddress: 'רוטשילד 12, תל אביב',
    clientEmail: 'inbar@example.com',
    currency: '₪',
    totalAmount: 1500,
    paidAmount: 1500,
    remainingBalance: 0,
    paymentMethods: [
      {
        id: 'pm_1',
        type: 'bank_transfer',
        amount: 1500,
        referenceNumber: '12345678',
        isDirectTransferConfirmed: true,
      }
    ],
    lineItems: [
      {
        id: 'li_1',
        description: 'תשלום עבור שירותי מיתוג',
        quantity: 1,
        unit: 'יחידה',
        unitPrice: 1500,
        discount: 0,
        discountType: 'percent',
        isTaxable: false,
        lineTotal: 1500,
      }
    ],
    subtotal: 1500,
    discountTotal: 0,
    vatTotal: 0,
    vatRate: 0,
  };

  const business = {
    legalName: 'אמית טאץ׳ בע״מ',
    tradingName: 'AMIT TOUCH',
    businessNumber: '515234567',
    businessType: 'exempt',
    address: 'הברזל 24, רמת החייל, תל אביב',
    phone: '03-6821456',
    email: 'amit2001tal@gmail.com',
    logoUrl: '/amit-touch-logo.png',
    signatureUrl: '/signiture.png',
    currency: '₪',
    vatRate: 0.18,
    isConfigured: true,
  };

  // 1. Measure HTML generation
  const t0 = performance.now();
  const html = generateDocumentHtml(sampleDoc, business);
  const t1 = performance.now();
  console.log(`1. HTML Generation: ${(t1 - t0).toFixed(2)} ms (HTML size: ${html.length} chars)`);

  // 2. Measure PDF rendering (Chromium startup & print-to-pdf) - Run 1 (Cold)
  console.log('2. Measuring Chromium Cold Startup & PDF Rendering...');
  const t2 = performance.now();
  const pdfBuffer1 = generateDocumentPdfBuffer(sampleDoc, business);
  const t3 = performance.now();
  console.log(` - PDF Rendering (Cold): ${(t3 - t2).toFixed(2)} ms (PDF size: ${pdfBuffer1.length} bytes)`);

  // 3. Measure PDF rendering - Run 2 (Warm)
  console.log('3. Measuring Chromium Warm PDF Rendering...');
  const t4 = performance.now();
  const pdfBuffer2 = generateDocumentPdfBuffer(sampleDoc, business);
  const t5 = performance.now();
  console.log(` - PDF Rendering (Warm): ${(t5 - t4).toFixed(2)} ms (PDF size: ${pdfBuffer2.length} bytes)`);

  // 4. Measure Cryptographic Digital Signing
  console.log('4. Measuring RSA-SHA256 PAdES Signing...');
  const creds = loadSigningCredentials();
  if (!creds) {
    console.log(' - No signing credentials loaded!');
    return;
  }
  const t6 = performance.now();
  const signedPdf = signPdfBuffer(
    pdfBuffer2,
    creds.certDer,
    creds.privateKeyPem,
    business.legalName,
    'מסמך ממוחשב - חתימה אלקטרונית מאובטחת לפי סעיף 18ב'
  );
  const t7 = performance.now();
  console.log(` - Cryptographic Signing: ${(t7 - t6).toFixed(2)} ms (Signed PDF size: ${signedPdf.length} bytes)`);

  // 5. Measure Digital Signature Verification
  console.log('5. Measuring Digital Signature Verification...');
  const t8 = performance.now();
  const verifyResult = verifyPdfDigitalSignature(signedPdf);
  const t9 = performance.now();
  console.log(` - Signature Verification: ${(t9 - t8).toFixed(2)} ms (Valid: ${verifyResult.isValid}, DigestMatch: ${verifyResult.digestMatch})`);

  // 6. Measure Storage & Disk I/O
  console.log('6. Measuring Storage & Disk I/O...');
  const t10 = performance.now();
  const tmpSignedFile = path.resolve(process.cwd(), 'scratch', `test_bench_signed_${Date.now()}.pdf`);
  fs.writeFileSync(tmpSignedFile, signedPdf);
  const sha256 = crypto.createHash('sha256').update(signedPdf).digest('hex');
  if (fs.existsSync(tmpSignedFile)) fs.unlinkSync(tmpSignedFile);
  const t11 = performance.now();
  console.log(` - Storage & Hashing: ${(t11 - t10).toFixed(2)} ms`);

  console.log('\n--- SUMMARY ---');
  console.log(`Total PDF Generation (Cold): ${(t3 - t2).toFixed(2)} ms`);
  console.log(`Total PDF Generation (Warm): ${(t5 - t4).toFixed(2)} ms`);
  console.log(`Total Signing + Verification: ${(t7 - t6 + t9 - t8).toFixed(2)} ms`);
  console.log(`Total Storage: ${(t11 - t10).toFixed(2)} ms`);
}

benchmark().catch(console.error);
