const fs = require('fs');
const path = require('path');
const assert = require('assert');
const nodemailer = require('nodemailer');

// We will test emailService functions directly
const { 
  getEmailConfig, 
  saveEmailConfig, 
  checkEmailProviderStatus, 
  sendDocumentEmail,
  setCustomSmtpTransporter 
} = require('../server/emailService.ts');

const {
  saveGmailTokens,
  getGmailOAuthStatus,
  clearGmailTokens,
} = require('../server/gmailService.ts');

const { generateDocumentPdfBuffer } = require('../server/pdfGenerator.ts');

async function runTests() {
  console.log('--- STARTING EMAIL SYSTEM VERIFICATION ---\n');

  // Backup any existing emailConfig.json and gmailTokens.json so tests run with a clean state
  const emailConfigFile = path.resolve(__dirname, '../data/emailConfig.json');
  let originalFileConfig = null;
  if (fs.existsSync(emailConfigFile)) {
    originalFileConfig = fs.readFileSync(emailConfigFile, 'utf8');
    fs.unlinkSync(emailConfigFile);
  }

  const tokenFile = path.resolve(__dirname, '../data/gmailTokens.json');
  let originalTokens = null;
  if (fs.existsSync(tokenFile)) {
    originalTokens = fs.readFileSync(tokenFile, 'utf8');
    fs.unlinkSync(tokenFile);
  }

  const origEnv = { ...process.env };
  try {
    delete process.env.EMAIL_PROVIDER;
  delete process.env.RESEND_API_KEY;
  delete process.env.BREVO_API_KEY;
  delete process.env.SENDGRID_API_KEY;
  delete process.env.SMTP_HOST;
  delete process.env.SMTP_USER;
  delete process.env.SMTP_PASS;
  delete process.env.EMAIL_FROM;
  delete process.env.AUTO_BCC_EMAIL;

  // Test 1: Provider resolution precedence
  console.log('Test 1: Testing provider resolution logic...');
  
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
    clientEmail: 'customer@example.com',
    date: '2026-11-10',
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

  // Setup Mock fetch for HTTP API tests
  const origFetch = global.fetch;
  let interceptedRequest = null;

  global.fetch = async (url, options) => {
    interceptedRequest = { url, options };
    return {
      ok: true,
      status: 200,
      json: async () => ({ id: 'resend_msg_test_abc123', messageId: 'brevo_msg_test_xyz789' }),
    };
  };

  // Test 3: Resend Automatic BCC to Owner
  console.log('Test 3: Testing Resend HTTPS REST API automatic BCC to amit2001tal@gmail.com...');
  process.env.EMAIL_PROVIDER = 'resend';
  process.env.RESEND_API_KEY = 're_test_sample_key';
  process.env.EMAIL_FROM = 'billing@amittouch.com';
  process.env.EMAIL_FROM_NAME = 'AMIT TOUCH';

  const sendResult1 = await sendDocumentEmail({
    document: sampleDoc,
    business,
    recipient: 'customer@example.com',
    subject: 'קבלה מס׳ 250020 - AMIT TOUCH',
    messageBody: 'שלום רב,\n\nמצורפת קבלה עבור הטיפול.\n\nבברכה,\nעמית',
    pdfBuffer,
    pdfFilename: 'קבלה_250020',
  });

  assert.strictEqual(sendResult1.success, true);
  assert.strictEqual(sendResult1.recipient, 'customer@example.com');
  assert.strictEqual(sendResult1.bcc, 'amit2001tal@gmail.com');

  assert(interceptedRequest !== null, 'fetch must have been called');
  const resendBody1 = JSON.parse(interceptedRequest.options.body);

  console.log(' - Resend URL:', interceptedRequest.url);
  console.log(' - Resend To header:', resendBody1.to);
  console.log(' - Resend BCC header:', resendBody1.bcc);

  // Verification: Customer in To, Owner in BCC, Customer cannot see BCC in To
  assert.deepStrictEqual(resendBody1.to, ['customer@example.com']);
  assert.deepStrictEqual(resendBody1.bcc, ['amit2001tal@gmail.com']);
  assert(!resendBody1.to.includes('amit2001tal@gmail.com'), 'BCC address MUST NOT appear in To header');
  assert.strictEqual(resendBody1.attachments[0].filename, 'קבלה_250020.pdf');
  assert(resendBody1.attachments[0].content.length > 0, 'PDF buffer attachment must be present');
  console.log('✓ Test 3 Passed: Resend sends to customer in To, owner in BCC, with identical PDF.\n');

  // Test 4: Deduplication when Recipient is already the Owner
  console.log('Test 4: Testing duplicate prevention when sending directly to amit2001tal@gmail.com...');
  const sendResult2 = await sendDocumentEmail({
    document: sampleDoc,
    business,
    recipient: 'amit2001tal@gmail.com',
    subject: 'הודעת מערכת עבור עמית',
    messageBody: 'בדיקת שליחה ישירה לבעלים',
    pdfBuffer,
    pdfFilename: 'קבלה_250020',
  });

  const resendBody2 = JSON.parse(interceptedRequest.options.body);
  console.log(' - Direct send To:', resendBody2.to);
  console.log(' - Direct send BCC:', resendBody2.bcc);

  assert.deepStrictEqual(resendBody2.to, ['amit2001tal@gmail.com']);
  assert.strictEqual(resendBody2.bcc, undefined, 'BCC must be undefined when recipient is already the owner');
  assert.strictEqual(sendResult2.bcc, undefined);
  console.log('✓ Test 4 Passed: Duplicate prevention verified (no BCC sent when owner is To).\n');

  // Test 5: Brevo Automatic BCC
  console.log('Test 5: Testing Brevo HTTPS REST API automatic BCC...');
  process.env.EMAIL_PROVIDER = 'brevo';
  process.env.BREVO_API_KEY = 'xkeysib-test';

  const sendResult3 = await sendDocumentEmail({
    document: { ...sampleDoc, id: `test_doc_${Date.now()}_5` },
    business,
    recipient: 'customer@example.com',
    subject: 'חשבון עסקה - AMIT TOUCH',
    messageBody: 'שלום,\nמצורף חשבון עסקה לתשלום.',
    pdfBuffer,
    pdfFilename: 'חשבון_עסקה_40016',
  });

  const brevoBody = JSON.parse(interceptedRequest.options.body);
  console.log(' - Brevo To:', brevoBody.to);
  console.log(' - Brevo BCC:', brevoBody.bcc);

  assert.deepStrictEqual(brevoBody.to, [{ email: 'customer@example.com' }]);
  assert.deepStrictEqual(brevoBody.bcc, [{ email: 'amit2001tal@gmail.com' }]);
  assert.strictEqual(brevoBody.attachment[0].name, 'חשבון_עסקה_40016.pdf');
  console.log('✓ Test 5 Passed: Brevo format correctly sets To, BCC, and attachment.\n');

  // Restore global.fetch
  global.fetch = origFetch;

  // Test 6: Nodemailer / Gmail SMTP Automatic BCC
  console.log('Test 6: Testing Gmail SMTP / Nodemailer automatic BCC...');
  process.env.EMAIL_PROVIDER = 'smtp';
  process.env.SMTP_HOST = 'smtp.gmail.com';
  process.env.SMTP_USER = 'amit2001tal@gmail.com';
  process.env.SMTP_PASS = 'abcd efgh ijkl mnop';
  process.env.SMTP_PORT = '587';

  let capturedMailOptions = null;
  setCustomSmtpTransporter({
    verify: async () => true,
    sendMail: async (options) => {
      capturedMailOptions = options;
      return { messageId: '<smtp_test_123@gmail.com>' };
    },
  });

  const sendResult4 = await sendDocumentEmail({
    document: { ...sampleDoc, id: `test_doc_${Date.now()}_6` },
    business,
    recipient: 'customer@example.com',
    subject: 'תזכורת תשלום - AMIT TOUCH',
    messageBody: 'תזכורת ידידותית לגבי תשלום חשבון העסקה.',
    pdfBuffer,
    pdfFilename: 'תזכורת_40016',
  });

  // Restore custom transporter
  setCustomSmtpTransporter(null);

  console.log(' - SMTP To:', capturedMailOptions.to);
  console.log(' - SMTP BCC:', capturedMailOptions.bcc);
  console.log(' - SMTP Attachments count:', capturedMailOptions.attachments.length);

  assert.strictEqual(capturedMailOptions.to, 'customer@example.com');
  assert.strictEqual(capturedMailOptions.bcc, 'amit2001tal@gmail.com');
  assert.strictEqual(capturedMailOptions.attachments[0].filename, 'תזכורת_40016.pdf');
  assert.strictEqual(sendResult4.bcc, 'amit2001tal@gmail.com');
  console.log('✓ Test 6 Passed: SMTP Nodemailer sets customer in To, owner in BCC, with identical PDF.\n');

  // Test 7: Testing Gmail API with OAuth tokens and automatic BCC
  console.log('Test 7: Testing Gmail API sending and base64url RFC 2822 generation...');
  
  // Set up mock token
  const tokenFile = path.resolve(__dirname, '../data/gmailTokens.json');
  let originalTokens = null;
  if (fs.existsSync(tokenFile)) {
    originalTokens = fs.readFileSync(tokenFile, 'utf8');
  }

  saveGmailTokens({
    connected: true,
    email: 'amit2001tal@gmail.com',
    accessToken: 'mock_access_token_12345',
    refreshToken: 'mock_refresh_token_67890',
    expiresAt: Date.now() + 3600000,
    connectedAt: new Date().toISOString(),
  });

  const gmailStatus = getGmailOAuthStatus();
  assert.strictEqual(gmailStatus.isConnected, true);
  assert.strictEqual(gmailStatus.connectedEmail, 'amit2001tal@gmail.com');

  process.env.EMAIL_PROVIDER = 'gmail';
  process.env.GMAIL_CLIENT_ID = 'mock_google_client_id.apps.googleusercontent.com';
  process.env.GMAIL_CLIENT_SECRET = 'GOCSPX-mock_secret_key_123';
  let capturedGmailRequest = null;
  global.fetch = async (url, options) => {
    capturedGmailRequest = { url, options, body: JSON.parse(options.body) };
    return {
      ok: true,
      status: 200,
      json: async () => ({ id: 'gmail_api_test_id_999', threadId: 'thread_111' }),
    };
  };

  const sendResult5 = await sendDocumentEmail({
    document: { ...sampleDoc, id: `test_doc_${Date.now()}_7` },
    business,
    recipient: 'customer@example.com',
    subject: 'קבלה מס׳ 250020 - AMIT TOUCH',
    messageBody: 'מצורפת קבלה חתומה עבור התשלום.',
    pdfBuffer,
    pdfFilename: 'קבלה_250020',
  });

  assert.strictEqual(capturedGmailRequest.url, 'https://gmail.googleapis.com/gmail/v1/users/me/messages/send');
  assert.strictEqual(capturedGmailRequest.options.headers.Authorization, 'Bearer mock_access_token_12345');
  assert(capturedGmailRequest.body.raw, 'raw payload must be present');

  // Decode the raw RFC 2822 payload to verify headers
  const rawDecoded = Buffer.from(capturedGmailRequest.body.raw, 'base64url').toString('utf8');
  console.log(' - Gmail API raw payload length:', rawDecoded.length);
  const dispositionLines = rawDecoded.split('\n').filter(l => l.toLowerCase().includes('content-disposition') || l.toLowerCase().includes('filename'));
  console.log(' - Attachment headers:', dispositionLines);
  assert(rawDecoded.includes('To: customer@example.com'), 'MIME must contain customer in To');
  assert(rawDecoded.includes('Bcc: amit2001tal@gmail.com'), 'MIME must contain owner in BCC');
  assert(rawDecoded.toLowerCase().includes('application/pdf'), 'MIME must contain PDF attachment');
  assert.strictEqual(sendResult5.providerMessageId, 'gmail_api_test_id_999');
  assert.strictEqual(sendResult5.bcc, 'amit2001tal@gmail.com');

  console.log('✓ Test 7 Passed: Gmail API successfully compiles RFC 2822 MIME with customer To, owner BCC, and valid PDF attachment.\n');

  console.log('=====================================================');
  console.log('✓ ALL 7 TESTS PASSED: GMAIL API + AUTOMATIC BCC VERIFIED ACROSS ALL PROVIDERS!');
  console.log('=====================================================');
  } finally {
    // Restore tokens
    if (originalTokens !== null) {
      fs.writeFileSync(tokenFile, originalTokens, 'utf8');
    } else {
      clearGmailTokens();
    }

    // Restore original env
    for (const k of Object.keys(process.env)) {
      if (!(k in origEnv)) delete process.env[k];
    }
    Object.assign(process.env, origEnv);

    if (originalFileConfig !== null) {
      fs.writeFileSync(emailConfigFile, originalFileConfig, 'utf8');
    }
  }
}

runTests().catch(err => {
  console.error('Test failed with error:', err);
  process.exit(1);
});
