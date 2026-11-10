const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const { performance } = require('perf_hooks');

const { generateDocumentHtml } = require('../server/pdfGenerator.ts');

async function testHeadlessModes() {
  const sampleDoc = {
    id: `bench_doc_${Date.now()}`,
    documentNumber: '250025',
    type: 'receipt',
    status: 'issued',
    date: '2026-11-10',
    clientId: 'client_bench',
    clientName: 'ענבר עיצובים בע״מ',
    currency: '₪',
    totalAmount: 1500,
    paidAmount: 1500,
    remainingBalance: 0,
    paymentMethods: [{ id: 'pm_1', type: 'bank_transfer', amount: 1500, referenceNumber: '12345678' }],
    lineItems: [{ id: 'li_1', description: 'מיתוג', quantity: 1, unitPrice: 1500, lineTotal: 1500 }],
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
    isConfigured: true,
  };

  const html = generateDocumentHtml(sampleDoc, business);
  const tmpDir = path.resolve(process.cwd(), 'scratch');
  if (!fs.existsSync(tmpDir)) fs.mkdirSync(tmpDir, { recursive: true });

  const tmpHtml = path.join(tmpDir, 'test_mode.html');
  const tmpPdfNew = path.join(tmpDir, 'test_new.pdf');
  const tmpPdfClassic = path.join(tmpDir, 'test_classic.pdf');

  fs.writeFileSync(tmpHtml, html, 'utf8');

  const chromePath = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
  const baseFlags = [
    '--no-sandbox',
    '--disable-setuid-sandbox',
    '--disable-gpu',
    '--disable-dev-shm-usage',
    '--disable-software-rasterizer',
    '--disable-extensions',
    '--disable-background-networking',
    '--disable-sync',
    '--disable-default-apps',
    '--mute-audio',
    '--no-first-run',
    '--hide-scrollbars',
    '--no-pdf-header-footer'
  ].join(' ');

  console.log('Testing --headless=new...');
  const t0 = performance.now();
  execSync(`"${chromePath}" --headless=new ${baseFlags} --print-to-pdf="${tmpPdfNew}" "${tmpHtml}"`, { stdio: 'pipe' });
  const t1 = performance.now();
  console.log(`--headless=new duration: ${(t1 - t0).toFixed(2)} ms, size: ${fs.statSync(tmpPdfNew).size} bytes`);

  console.log('Testing --headless (classic)...');
  const t2 = performance.now();
  execSync(`"${chromePath}" --headless ${baseFlags} --print-to-pdf="${tmpPdfClassic}" "${tmpHtml}"`, { stdio: 'pipe' });
  const t3 = performance.now();
  console.log(`--headless classic duration: ${(t3 - t2).toFixed(2)} ms, size: ${fs.statSync(tmpPdfClassic).size} bytes`);

  if (fs.existsSync(tmpHtml)) fs.unlinkSync(tmpHtml);
  if (fs.existsSync(tmpPdfNew)) fs.unlinkSync(tmpPdfNew);
  if (fs.existsSync(tmpPdfClassic)) fs.unlinkSync(tmpPdfClassic);
}

testHeadlessModes().catch(console.error);
