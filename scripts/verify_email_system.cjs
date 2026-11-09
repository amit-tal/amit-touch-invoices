const fs = require('fs');
const path = require('path');
const assert = require('assert');

// We will test emailService functions directly
const { 
  getEmailConfig, 
  saveEmailConfig, 
  checkEmailProviderStatus, 
  sendDocumentEmail 
} = require('../server/emailService.ts');

const { generateDocumentPdfBuffer } = require('../server/pdfGenerator.ts');

async function runTests() {
  console.log('--- STARTING EMAIL SYSTEM VERIFICATION ---\n');

  // Test 1: Provider resolution precedence
  console.log('Test 1: Testing provider resolution logic...');
  
  // Backup any existing env
  const origEnv = { ...process.env };
  delete process.env.EMAIL_PROVIDER;
  delete process.env.RESEND_API_KEY;
  delete process.env.BREVO_API_KEY;
  delete process.env.SENDGRID_API_KEY;
  delete process.env.SMTP_HOST;
  delete process.env.SMTP_USER;
  delete process.env.SMTP_PASS;
  delete process.env.EMAIL_FROM;

  // 1a. Default when empty
  let cfg = getEmailConfig();
  console.log(' - Empty env provider:', cfg.provider);
  assert(cfg.provider === 'none' || cfg.provider === 'smtp' || cfg.provider === 'resend');

  // 1b. Resend auto-detection via RESEND_API_KEY
  process.env.RESEND_API_KEY = 're_test_key_12345';
  process.env.EMAIL_FROM = 'billing@amittouch.com';
  cfg = getEmailConfig();
  console.log(' - With RESEND_API_KEY set:', cfg.provider);
  assert.strictEqual(cfg.provider, 'resend');
  assert.strictEqual(cfg.resendApiKey, 're_test_key_12345');

  // 1c. Provider status with valid Resend settings
  let status = checkEmailProviderStatus();
  console.log(' - Resend provider configured status:', status.isConfigured);
  assert.strictEqual(status.isConfigured, true);
  assert.strictEqual(status.provider, 'resend');

  // 1d. Brevo auto-detection
  delete process.env.RESEND_API_KEY;
  process.env.BREVO_API_KEY = 'xkeysib-test';
  cfg = getEmailConfig();
  console.log(' - With BREVO_API_KEY set:', cfg.provider);
  assert.strictEqual(cfg.provider, 'brevo');

  // 1e. Gmail SMTP auto-detection
  delete process.env.BREVO_API_KEY;
  process.env.SMTP_HOST = 'smtp.gmail.com';
  process.env.SMTP_USER = 'amit2001tal@gmail.com';
  process.env.SMTP_PASS = 'abcd efgh ijkl mnop';
  process.env.SMTP_PORT = '465';
  cfg = getEmailConfig();
  console.log(' - With SMTP env set:', cfg.provider, 'port:', cfg.smtp.port, 'secure:', cfg.smtp.secure);
  assert.strictEqual(cfg.provider, 'smtp');
  assert.strictEqual(cfg.smtp.port, 465);
  assert.strictEqual(cfg.smtp.secure, true);

  // 1f. Explicit EMAIL_PROVIDER overrides
  process.env.EMAIL_PROVIDER = 'resend';
  process.env.RESEND_API_KEY = 're_override';
  cfg = getEmailConfig();
  console.log(' - Explicit EMAIL_PROVIDER=resend with SMTP also set:', cfg.provider);
  assert.strictEqual(cfg.provider, 'resend');

  console.log('✓ Test 1 Passed: Provider resolution is robust and backwards compatible.\n');

  // Test 2: Sample Document and PDF Generation
  console.log('Test 2: Generating sample document and PDF buffer...');
  const business = {
    legalName: 'עמית מגע וריפוי בע״מ',
    tradingName: 'AMIT TOUCH',
    businessNumber: '516889900',
    email: 'billing@amittouch.com',
    phone: '050-1234567',
    address: 'רוטשילד 1, תל אביב',
    taxStatus: 'exempt',
  };

  const sampleDoc = {
    id: `test_doc_${Date.now()}`,
    documentNumber: '250020-TEST',
    type: 'receipt',
    clientId: 'client_test',
    clientName: 'ישראל ישראלי (לקוח בדיקה)',
    clientEmail: 'test-recipient@example.com',
    date: '2026-11-09',
    isOfficial: true,
    isTestMode: false,
    deliveryStatus: 'not_sent',
    createdAt: new Date().toISOString(),
    issuedAt: new Date().toISOString(),
    subtotal: 250,
    discountTotal: 0,
    vatTotal: 0,
    totalAmount: 250,
    paidAmount: 250,
    remainingBalance: 0,
    currency: 'ILS',
    status: 'paid',
    lineItems: [
      {
        id: '1',
        description: 'טיפול עיסוי רקמות עמוק 60 דק׳',
        quantity: 1,
        unit: 'טיפול',
        unitPrice: 250,
        discount: 0,
        discountType: 'amount',
        isTaxable: false,
        lineTotal: 250,
      },
    ],
    paymentMethods: [
      {
        id: 'pm_1',
        type: 'bank_transfer',
        amount: 250,
        isDirectTransferConfirmed: true,
        referenceNumber: 'אסמכתא_9921',
      },
    ],
    auditTrail: [],
  };

  const pdfBuffer = generateDocumentPdfBuffer(sampleDoc, business);
  assert(Buffer.isBuffer(pdfBuffer), 'pdfBuffer must be a valid Buffer');
  assert(pdfBuffer.length > 500, 'pdfBuffer must contain PDF bytes');
  console.log(`✓ Test 2 Passed: Sample PDF generated successfully (${pdfBuffer.length} bytes).\n`);

  // Test 3: Resend REST API simulation / validation
  console.log('Test 3: Testing Resend HTTPS REST API payload & dispatch handling...');
  // Intercept global fetch to verify exact payload sent over HTTPS (Port 443)
  const origFetch = global.fetch;
  let interceptedRequest = null;

  global.fetch = async (url, options) => {
    interceptedRequest = { url, options };
    return {
      ok: true,
      status: 200,
      json: async () => ({ id: 'resend_msg_test_abc123' }),
    };
  };

  process.env.EMAIL_PROVIDER = 'resend';
  process.env.RESEND_API_KEY = 're_live_test_key_sample';
  process.env.EMAIL_FROM = 'billing@amittouch.com';
  process.env.EMAIL_FROM_NAME = 'AMIT TOUCH';

  const sendResult = await sendDocumentEmail({
    document: sampleDoc,
    business,
    recipient: 'test-recipient@example.com',
    subject: 'קבלה מס׳ 250020 - AMIT TOUCH',
    messageBody: 'שלום רב,\n\nמצורפת קבלה עבור הטיפול.\n\nבברכה,\nעמית',
    pdfBuffer,
    pdfFilename: 'קבלה_250020',
  });

  // Restore fetch
  global.fetch = origFetch;

  console.log(' - Send result:', sendResult);
  assert.strictEqual(sendResult.success, true);
  assert.strictEqual(sendResult.provider, 'resend');
  assert.strictEqual(sendResult.providerMessageId, 'resend_msg_test_abc123');
  assert.strictEqual(sendResult.recipient, 'test-recipient@example.com');

  assert(interceptedRequest !== null, 'fetch must have been called');
  assert.strictEqual(interceptedRequest.url, 'https://api.resend.com/emails');
  assert.strictEqual(interceptedRequest.options.headers.Authorization, 'Bearer re_live_test_key_sample');

  const sentBody = JSON.parse(interceptedRequest.options.body);
  console.log(' - Intercepted request URL:', interceptedRequest.url);
  console.log(' - Sent from:', sentBody.from);
  console.log(' - Sent to:', sentBody.to);
  console.log(' - Attachments count:', sentBody.attachments.length);
  console.log(' - Attached PDF filename:', sentBody.attachments[0].filename);

  assert.strictEqual(sentBody.from, '"AMIT TOUCH" <billing@amittouch.com>');
  assert.deepStrictEqual(sentBody.to, ['test-recipient@example.com']);
  assert.strictEqual(sentBody.attachments[0].filename, 'קבלה_250020.pdf');
  assert(sentBody.attachments[0].content.length > 0, 'Attachment must contain base64 content');
  assert(sentBody.html.includes('AMIT TOUCH'), 'HTML template must contain branded business name');

  console.log('✓ Test 3 Passed: Resend HTTPS REST email sending verified end-to-end.\n');

  // Restore original env
  for (const k of Object.keys(process.env)) {
    if (!(k in origEnv)) delete process.env[k];
  }
  Object.assign(process.env, origEnv);

  console.log('=== ALL TESTS PASSED SUCCESSFULLY! ===');
}

runTests().catch(err => {
  console.error('Test failed with error:', err);
  process.exit(1);
});
