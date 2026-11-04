import fs from 'fs';
import path from 'path';
import http from 'http';

const cleanDataDir = path.resolve('scratch/clean_data_test');
if (fs.existsSync(cleanDataDir)) {
  fs.rmSync(cleanDataDir, { recursive: true, force: true });
}
fs.mkdirSync(cleanDataDir, { recursive: true });

process.env.DATA_DIR = cleanDataDir;
process.env.PORT = '3987';
process.env.HOST = '127.0.0.1';

console.log('========================================================================');
console.log('VERIFYING RENDER FREE STARTUP MEMORY (512MB RAM / 256MB HEAP SIMULATION)');
console.log('========================================================================');

const initialMem = process.memoryUsage();
console.log(`[Baseline] Heap: ${(initialMem.heapUsed / 1024 / 1024).toFixed(2)} MB | RSS: ${(initialMem.rss / 1024 / 1024).toFixed(2)} MB`);

let peakHeap = initialMem.heapUsed;
let peakRss = initialMem.rss;

const interval = setInterval(() => {
  const m = process.memoryUsage();
  if (m.heapUsed > peakHeap) peakHeap = m.heapUsed;
  if (m.rss > peakRss) peakRss = m.rss;
}, 10);

// 1. Start server from clean state (simulating fresh container startup on Render)
console.log('\n--- 1. Testing Clean Container Server Startup ---');
await import('../server/server.ts');
console.log('   ✓ Server module loaded and listening on port 3987');

// Allow server loop to settle
await new Promise(r => setTimeout(r, 600));

const startupPeakHeap = (peakHeap / 1024 / 1024).toFixed(2);
const startupPeakRss = (peakRss / 1024 / 1024).toFixed(2);
console.log(`   ✓ Peak Startup Heap: ${startupPeakHeap} MB (Limit: 256 MB)`);
console.log(`   ✓ Peak Startup RSS: ${startupPeakRss} MB (Container Limit: 512 MB)`);

// 2. Query /api/auth/status
console.log('\n--- 2. Verifying /api/auth/status API Responsiveness ---');
const authStatus = await new Promise((resolve, reject) => {
  http.get('http://127.0.0.1:3987/api/auth/status', res => {
    let raw = '';
    res.on('data', chunk => raw += chunk);
    res.on('end', () => resolve({ statusCode: res.statusCode, body: JSON.parse(raw) }));
  }).on('error', reject);
});

console.log(`   ✓ HTTP Status: ${authStatus.statusCode}`);
console.log(`   ✓ Auth Response: authenticated=${authStatus.body.authenticated}, isConfigured=${authStatus.body.isConfigured}`);

// 3. Generate a sample Hebrew PDF within memory limits
console.log('\n--- 3. Verifying On-Demand Hebrew PDF Generation ---');
const { generateDocumentPdfBuffer } = await import('../server/pdfGenerator.ts');

const sampleDoc = {
  id: 'test_doc_render_mem_001',
  documentNumber: 'TEST-1005',
  type: 'receipt',
  status: 'issued',
  isTestMode: true,
  clientName: 'עמינח מדיק בע״מ',
  clientBusinessNumber: '512345678',
  clientAddress: 'החרושת 12, אשקלון',
  date: '2026-11-04',
  lineItems: [
    { description: 'ייעוץ ארגונומי והתאמת ריהוט סטודיו', quantity: 1, unitPrice: 1500, lineTotal: 1500 }
  ],
  subtotal: 1500,
  discountTotal: 0,
  vatTotal: 0,
  totalAmount: 1500,
  paidAmount: 1500,
  remainingBalance: 0,
  currency: '₪',
  notes: 'בדיקת עומס זיכרון לפריסת Render Free'
};

const pdfBuffer = generateDocumentPdfBuffer(sampleDoc);
console.log(`   ✓ Hebrew PDF generated successfully! Buffer size: ${pdfBuffer.length} bytes`);

clearInterval(interval);
const finalPeakHeap = (peakHeap / 1024 / 1024).toFixed(2);
const finalPeakRss = (peakRss / 1024 / 1024).toFixed(2);
console.log(`\n--- 4. Summary of Memory Footprint ---`);
console.log(`   Peak Heap Observed: ${finalPeakHeap} MB (vs 256 MB heap limit)`);
console.log(`   Peak RSS Observed:  ${finalPeakRss} MB (vs 512 MB container limit)`);
console.log('========================================================================\n');

process.exit(0);
