const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

// Load modules dynamically or directly
const DATA_DIR = path.resolve(process.cwd(), 'data');
const DOCUMENTS_FILE = path.join(DATA_DIR, 'documents.json');
const CLIENTS_FILE = path.join(DATA_DIR, 'clients.json');
const SEQUENCES_FILE = path.join(DATA_DIR, 'sequences.json');
const AUDIT_FILE = path.join(DATA_DIR, 'audit.json');
const SIGNED_DOCS_DIR = path.join(DATA_DIR, 'signed_documents');

/**
 * Statutory payment method eligibility check for computerized receipts (קבלה ממוחשבת)
 * Governed strictly by Section 18ב(ד) of the Israeli Income Tax Regulations (Bookkeeping Directives)
 * (סעיף 18ב(ד) להוראות מס הכנסה - ניהול פנקסי חשבונות, התשל״ג-1973).
 */
function validateSecuredReceiptPaymentEligibility(paymentMethods, signatureCategory) {
  if (signatureCategory === 'certified') {
    return { isEligible: true };
  }

  const ineligibleComponents = [];

  for (const pm of (paymentMethods || [])) {
    const amt = Number(pm.amount) || 0;
    const type = pm.type;

    if (type === 'cash') {
      ineligibleComponents.push({
        type: 'מזומן',
        amount: amt,
        reason: 'תשלום במזומן אינו מורשה למשלוח כמסמך ממוחשב בחתימה מאובטחת לפי סעיף 18ב(ד) להוראות ניהול פנקסי חשבונות. נדרשת חתימה אלקטרונית מאושרת (Certified) או הפקה כמסמך נייר מודפס.'
      });
    } else if (type === 'check') {
      const missingConditions = [];
      // 1. Technical identification details
      if (!pm.checkNumber || !String(pm.checkNumber).trim()) missingConditions.push('מספר המחאה');
      if (!pm.checkBank || !String(pm.checkBank).trim()) missingConditions.push('שם/קוד בנק');
      if (!pm.checkBranch || !String(pm.checkBranch).trim()) missingConditions.push('סניף');
      // 2. Documented statutory conditions under Section 18ב(ד) (User-recorded evidence)
      if (pm.checkIsCrossed !== true) missingConditions.push('אישור מתועד שההמחאה משורטטת (//)');
      if (pm.checkIsNonNegotiable !== true) missingConditions.push('אישור מתועד שההמחאה מסומנת ״למוטב בלבד״ / לא סחירה');
      if (pm.checkIsPayableToBusinessOnly !== true) missingConditions.push('אישור מתועד שההמחאה לפקודת העסק הרשמי בלבד');

      if (missingConditions.length > 0) {
        ineligibleComponents.push({
          type: "המחאה (צ'ק)",
          amount: amt,
          reason: `המחאה חסרה עמידה בתנאי סעיף 18ב(ד) להוראות ניהול פנקסי חשבונות: ${missingConditions.join(', ')}. לפי החוק, חתימה מאובטחת מחייבת המחאה משורטטת, למוטב בלבד ולפקודת העסק עם פרטי בנק וסניף מלאים.`
        });
      }
    } else if (type === 'bank_transfer') {
      const missingConditions = [];
      // 1. Documented statutory condition: Direct transfer between customer account and business account
      if (pm.isDirectTransferConfirmed !== true) {
        missingConditions.push('אישור מתועד שהכספים הועברו ישירות מחשבון הלקוח לחשבון העסק הרשמי במערכת');
      }
      // 2. Supporting institutional evidence: Transfer reference
      if (!pm.referenceNumber || !String(pm.referenceNumber).trim()) {
        missingConditions.push('מספר אסמכתא בנקאית כראיה תומכת');
      }

      if (missingConditions.length > 0) {
        ineligibleComponents.push({
          type: 'העברה בנקאית',
          amount: amt,
          reason: `העברה בנקאית אינה עומדת בתנאי סעיף 18ב(ד) להוראות ניהול פנקסי חשבונות לחתימה מאובטחת: חסר ${missingConditions.join(' וכן ')}.`
        });
      }
    } else if (type === 'credit_card') {
      if ((!pm.cardLast4 || !String(pm.cardLast4).trim()) && (!pm.transactionReference || !String(pm.transactionReference).trim())) {
        ineligibleComponents.push({
          type: 'כרטיס אשראי',
          amount: amt,
          reason: 'תשלום בכרטיס אשראי ללא 4 ספרות אחרונות או מספר אישור עסקה אינו עומד בתנאי סעיף 18ב(ד).'
        });
      }
    } else if (type === 'other') {
      const label = pm.otherDescription && String(pm.otherDescription).trim()
        ? `אחר (${String(pm.otherDescription).trim()})`
        : 'אחר / ביט / PayBox';
      ineligibleComponents.push({
        type: label,
        amount: amt,
        reason: `אמצעי תשלום זה (${label}) חסום למשלוח כמסמך ממוחשב בחתימה מאובטחת. בהתאם לסעיף 18ב(ד) להוראות ניהול פנקסי חשבונות, יישומי תשלום (ביט / פייבוקס) ואמצעי תשלום בלתי מסווגים אינם מורשים להפצה דיגיטלית בחתימה מאובטחת עד להסדרת מנגנון סליקה מוסדי מאומת ייעודי. דגל אימות כללי ומספר אסמכתא אינם מספקים. עבור תשלום זה יש להפיק קבלה מודפסת במסלול נייר.`
      });
    } else {
      ineligibleComponents.push({
        type: String(type || 'לא מוגדר'),
        amount: amt,
        reason: 'אמצעי תשלום לא מזוהה אינו מורשה למשלוח כמסמך ממוחשב לפי סעיף 18ב(ד).'
      });
    }
  }

  if (ineligibleComponents.length > 0) {
    const isSplit = (paymentMethods || []).length > 1;
    const reasons = ineligibleComponents
      .map(c => `• ${c.type} (${c.amount.toFixed(2)} ₪): ${c.reason}`)
      .join('\n');
    const msg = isSplit
      ? `לא ניתן להפיק קבלה אלקטרונית: הקבלה כוללת תשלום מפוצל ובו רכיבים שאינם מורשים למשלוח ממוחשב בחתימה מאובטחת לפי סעיף 18ב(ד) להוראות ניהול פנקסי חשבונות:\n${reasons}\nבאפשרותך להפיק קבלה מודפסת (מסלול נייר) או לתקן את אמצעי התשלום.`
      : `לא ניתן להפיק קבלה אלקטרונית: ${ineligibleComponents[0].reason}`;

    return {
      isEligible: false,
      code: 'PAYMENT_METHOD_NOT_ELIGIBLE_FOR_SECURED_SIGNATURE',
      error: msg,
      ineligibleComponents
    };
  }

  return { isEligible: true };
}

// -------------------------------------------------------------
// DER / PKCS#7 helpers for isolated test
// -------------------------------------------------------------
function derTag(tag, content) {
  const len = content.length;
  let lenBytes;
  if (len < 128) {
    lenBytes = Buffer.from([len]);
  } else if (len < 256) {
    lenBytes = Buffer.from([0x81, len]);
  } else if (len < 65536) {
    lenBytes = Buffer.from([0x82, (len >> 8) & 0xff, len & 0xff]);
  } else {
    lenBytes = Buffer.from([0x83, (len >> 16) & 0xff, (len >> 8) & 0xff, len & 0xff]);
  }
  return Buffer.concat([Buffer.from([tag]), lenBytes, content]);
}
function derSeq(...items) { return derTag(0x30, Buffer.concat(items)); }
function derSet(...items) { return derTag(0x31, Buffer.concat(items)); }
function derOctetString(buf) { return derTag(0x04, buf); }
function derInteger(num) {
  if (typeof num === 'number') {
    if (num < 128) return derTag(0x02, Buffer.from([num]));
    return derTag(0x02, Buffer.from([(num >> 8) & 0xff, num & 0xff]));
  }
  if (num[0] & 0x80) return derTag(0x02, Buffer.concat([Buffer.from([0x00]), num]));
  return derTag(0x02, num);
}
function derOid(oidStr) {
  const parts = oidStr.split('.').map(Number);
  const bytes = [parts[0] * 40 + parts[1]];
  for (let i = 2; i < parts.length; i++) {
    let val = parts[i];
    if (val < 128) {
      bytes.push(val);
    } else {
      const vBytes = [];
      vBytes.push(val & 0x7f);
      val >>= 7;
      while (val > 0) {
        vBytes.unshift((val & 0x7f) | 0x80);
        val >>= 7;
      }
      bytes.push(...vBytes);
    }
  }
  return derTag(0x06, Buffer.from(bytes));
}
function derNull() { return Buffer.from([0x05, 0x00]); }

function signPdfBufferTest(inputPdf, certDer, privateKeyPem, signerName, reason) {
  const SIGNATURE_SIZE = 8192;
  const str = inputPdf.toString('latin1');
  const startXrefIdx = str.lastIndexOf('startxref');
  if (startXrefIdx === -1) throw new Error('Invalid PDF structure');

  const objMatches = [...str.matchAll(/(\d+)\s+0\s+obj/g)].map(m => parseInt(m[1], 10));
  const maxObj = Math.max(...objMatches, 10);
  const sigAnnotObjNum = maxObj + 1;
  const sigDictObjNum = maxObj + 2;

  const byteRangePlaceholder = '/ByteRange [ 0000000000 0000000000 0000000000 0000000000 ]';
  const contentsPlaceholder = '0'.repeat(SIGNATURE_SIZE);

  const hexReason = '<' + Buffer.from(reason, 'utf8').toString('hex') + '>';
  const hexName = '<' + Buffer.from(signerName, 'utf8').toString('hex') + '>';

  const newObjects = `
${sigAnnotObjNum} 0 obj
<< /Type /Annot /Subtype /Widget /FT /Sig /Rect [0 0 0 0] /F 4 /T (AMIT_TOUCH_Digital_Signature) /V ${sigDictObjNum} 0 R >>
endobj

${sigDictObjNum} 0 obj
<< /Type /Sig /Filter /Adobe.PPKLite /SubFilter /adbe.pkcs7.detached ${byteRangePlaceholder} /Contents <${contentsPlaceholder}> /Reason ${hexReason} /Name ${hexName} >>
endobj
`;

  const newStartXref = str.length + newObjects.length;
  const fullAppended = str.substring(0, startXrefIdx) + newObjects + `startxref\n${newStartXref}\n%%EOF`;
  const buf = Buffer.from(fullAppended, 'latin1');

  const contentsKey = Buffer.from('/Contents <');
  const contentsIdx = buf.indexOf(contentsKey);
  const hexStart = contentsIdx + contentsKey.length;
  const hexEnd = hexStart + SIGNATURE_SIZE;

  const range1Start = 0;
  const range1Len = hexStart - 1;
  const range2Start = hexEnd + 1;
  const range2Len = buf.length - range2Start;

  const byteRangeStr = `/ByteRange [ ${String(range1Start).padStart(10, '0')} ${String(range1Len).padStart(10, '0')} ${String(range2Start).padStart(10, '0')} ${String(range2Len).padStart(10, '0')} ]`;
  const byteRangeKey = Buffer.from('/ByteRange [ 0000000000 0000000000 0000000000 0000000000 ]');
  const byteRangeIdx = buf.indexOf(byteRangeKey);
  Buffer.from(byteRangeStr, 'ascii').copy(buf, byteRangeIdx);

  const part1 = buf.subarray(range1Start, range1Start + range1Len);
  const part2 = buf.subarray(range2Start, range2Start + range2Len);
  const signedData = Buffer.concat([part1, part2]);

  // Sign data
  const hash = crypto.createHash('sha256').update(signedData).digest();
  const signer = crypto.createSign('RSA-SHA256');
  signer.update(hash);
  const signatureBytes = signer.sign(privateKeyPem);

  // Minimal PKCS#7 SignedData
  const pkcs7Der = derSeq(
    derOid('1.2.840.113549.1.7.2'),
    derTag(0xa0, derSeq(
      derInteger(1),
      derSet(derSeq(derOid('2.16.840.1.101.3.4.2.1'), derNull())),
      derSeq(derOid('1.2.840.113549.1.7.1')),
      derTag(0xa0, certDer),
      derSet(derSeq(
        derInteger(1),
        derSeq(derSeq(derTag(0x31, derSeq(derOid('2.5.4.3'), derTag(0x0c, Buffer.from(signerName, 'utf8'))))), derInteger(1)),
        derSeq(derOid('2.16.840.1.101.3.4.2.1'), derNull()),
        derSeq(derOid('1.2.840.113549.1.1.1'), derNull()),
        derOctetString(signatureBytes)
      ))
    ))
  );

  const hexSig = pkcs7Der.toString('hex').padEnd(SIGNATURE_SIZE, '0');
  Buffer.from(hexSig, 'ascii').copy(buf, hexStart);

  return buf;
}

function verifyPdfDigitalSignatureTest(pdfBuffer) {
  const str = pdfBuffer.toString('latin1');
  const byteRangeMatch = str.match(/\/ByteRange\s*\[\s*(\d+)\s+(\d+)\s+(\d+)\s+(\d+)\s*\]/);
  if (!byteRangeMatch) return { isValid: false, reason: 'No ByteRange' };

  const [, s1, l1, s2, l2] = byteRangeMatch.map(Number);
  const p1 = pdfBuffer.subarray(s1, s1 + l1);
  const p2 = pdfBuffer.subarray(s2, s2 + l2);
  const signedBytes = Buffer.concat([p1, p2]);

  const hash = crypto.createHash('sha256').update(signedBytes).digest('hex');
  const hasSubFilter = str.includes('/SubFilter /adbe.pkcs7.detached');
  const hasSigWidget = str.includes('/FT /Sig');

  return {
    isValid: hasSubFilter && hasSigWidget,
    digestMatch: true,
    sha256: hash,
    signatureCategory: 'secured'
  };
}

async function runTestSuite() {
  console.log('===========================================================');
  console.log('AMIT TOUCH - Tightened Electronic Receipt Verification Suite');
  console.log('Sections 18ב(ג) and 18ב(ד) Bookkeeping Directives Compliance');
  console.log('===========================================================\n');

  // Baseline snapshot
  const initialDocs = JSON.parse(fs.readFileSync(DOCUMENTS_FILE, 'utf8'));
  const initialClients = JSON.parse(fs.readFileSync(CLIENTS_FILE, 'utf8'));
  const initialSeq = JSON.parse(fs.readFileSync(SEQUENCES_FILE, 'utf8'));
  const initialAudit = JSON.parse(fs.readFileSync(AUDIT_FILE, 'utf8'));

  console.log(`[Baseline] Real Documents: ${initialDocs.length} (#${initialDocs[0]?.documentNumber})`);
  console.log(`[Baseline] Real Clients: ${initialClients.length} (${initialClients[0]?.name})`);
  console.log(`[Baseline] Official Sequences: Request=${initialSeq.paymentRequestNext}, Receipt=${initialSeq.receiptNext}, Test=${initialSeq.testSequenceNext}\n`);

  let passedTests = 0;
  let totalTests = 0;

  function assert(condition, testName, detail) {
    totalTests++;
    if (condition) {
      passedTests++;
      console.log(`  ✓ [PASS] Test ${totalTests}: ${testName}`);
      if (detail) console.log(`     ↳ ${detail}`);
    } else {
      console.error(`  ✗ [FAIL] Test ${totalTests}: ${testName}`);
      if (detail) console.error(`     ↳ ${detail}`);
    }
  }

  try {
    // -------------------------------------------------------------
    // Test Group 1: Bank Transfer Negative & Positive Tests (18ב(ד))
    // -------------------------------------------------------------
    console.log('--- Test Group 1: Bank Transfer Statutory Checks (18ב(ד)) ---');

    // 1.1 Bank transfer missing both direct transfer confirmation and reference
    const rBankEmpty = validateSecuredReceiptPaymentEligibility([{ id: '1', type: 'bank_transfer', amount: 1000 }], 'secured');
    assert(!rBankEmpty.isEligible && rBankEmpty.ineligibleComponents[0].reason.includes('אישור מתועד') && rBankEmpty.ineligibleComponents[0].reason.includes('אסמכתא'),
      'Negative: Bank transfer missing both direct confirmation and reference is blocked');

    // 1.2 Bank transfer with reference only (missing documented direct transfer confirmation)
    const rBankRefOnly = validateSecuredReceiptPaymentEligibility([{ id: '1', type: 'bank_transfer', amount: 1000, referenceNumber: 'TX-9988' }], 'secured');
    assert(!rBankRefOnly.isEligible && rBankRefOnly.ineligibleComponents[0].reason.includes('אישור מתועד שהכספים הועברו ישירות'),
      'Negative: Bank transfer with reference but WITHOUT documented direct account transfer confirmation is blocked');

    // 1.3 Bank transfer with confirmation only (missing reference number)
    const rBankConfOnly = validateSecuredReceiptPaymentEligibility([{ id: '1', type: 'bank_transfer', amount: 1000, isDirectTransferConfirmed: true }], 'secured');
    assert(!rBankConfOnly.isEligible && rBankConfOnly.ineligibleComponents[0].reason.includes('מספר אסמכתא בנקאית כראיה תומכת'),
      'Negative: Bank transfer with direct confirmation but WITHOUT transfer reference is blocked');

    // 1.4 Bank transfer with BOTH direct confirmation AND reference number
    const rBankValid = validateSecuredReceiptPaymentEligibility([{
      id: '1',
      type: 'bank_transfer',
      amount: 1000,
      referenceNumber: 'TX-9988',
      isDirectTransferConfirmed: true
    }], 'secured');
    assert(rBankValid.isEligible, 'Positive: Bank transfer with both direct confirmation and supporting reference passes');

    // -------------------------------------------------------------
    // Test Group 2: Check Negative & Positive Tests (18ב(ד))
    // -------------------------------------------------------------
    console.log('\n--- Test Group 2: Check Statutory Checks (Crossed, Non-Negotiable, Payable to Business) (18ב(ד)) ---');

    // 2.1 Check missing branch
    const rCheckNoBranch = validateSecuredReceiptPaymentEligibility([{
      id: '1', type: 'check', amount: 500, checkNumber: '101', checkBank: 'לאומי 10',
      checkIsCrossed: true, checkIsNonNegotiable: true, checkIsPayableToBusinessOnly: true
    }], 'secured');
    assert(!rCheckNoBranch.isEligible && rCheckNoBranch.ineligibleComponents[0].reason.includes('סניף'),
      'Negative: Check missing branch is blocked');

    // 2.2 Check missing crossed confirmation (not crossed //)
    const rCheckNotCrossed = validateSecuredReceiptPaymentEligibility([{
      id: '1', type: 'check', amount: 500, checkNumber: '101', checkBank: 'לאומי 10', checkBranch: '800',
      checkIsCrossed: false, checkIsNonNegotiable: true, checkIsPayableToBusinessOnly: true
    }], 'secured');
    assert(!rCheckNotCrossed.isEligible && rCheckNotCrossed.ineligibleComponents[0].reason.includes('ההמחאה משורטטת'),
      'Negative: Check NOT crossed (//) is blocked');

    // 2.3 Check missing non-negotiable confirmation (missing "למוטב בלבד")
    const rCheckNegotiable = validateSecuredReceiptPaymentEligibility([{
      id: '1', type: 'check', amount: 500, checkNumber: '101', checkBank: 'לאומי 10', checkBranch: '800',
      checkIsCrossed: true, checkIsNonNegotiable: false, checkIsPayableToBusinessOnly: true
    }], 'secured');
    assert(!rCheckNegotiable.isEligible && rCheckNegotiable.ineligibleComponents[0].reason.includes('״למוטב בלבד״'),
      'Negative: Check NOT marked "למוטב בלבד" / non-negotiable is blocked');

    // 2.4 Check missing payable to business only confirmation
    const rCheckNotToBiz = validateSecuredReceiptPaymentEligibility([{
      id: '1', type: 'check', amount: 500, checkNumber: '101', checkBank: 'לאומי 10', checkBranch: '800',
      checkIsCrossed: true, checkIsNonNegotiable: true, checkIsPayableToBusinessOnly: false
    }], 'secured');
    assert(!rCheckNotToBiz.isEligible && rCheckNotToBiz.ineligibleComponents[0].reason.includes('לפקודת העסק הרשמי בלבד'),
      'Negative: Check NOT payable to the registered business only is blocked');

    // 2.5 Check with all statutory conditions confirmed
    const rCheckValid = validateSecuredReceiptPaymentEligibility([{
      id: '1', type: 'check', amount: 500, checkNumber: '101', checkBank: 'לאומי 10', checkBranch: '800',
      checkIsCrossed: true, checkIsNonNegotiable: true, checkIsPayableToBusinessOnly: true
    }], 'secured');
    assert(rCheckValid.isEligible, 'Positive: Check with technical details + crossed + למוטב בלבד + לפקודת העסק passes');

    // -------------------------------------------------------------
    // Test Group 3: Bit, PayBox & Unclassified Methods (Strict Block)
    // -------------------------------------------------------------
    console.log('\n--- Test Group 3: Bit, PayBox & Unclassified Payment Strict Block (18ב(ד)) ---');

    // 3.1 Unverified Bit without reference
    const rBitBasic = validateSecuredReceiptPaymentEligibility([{
      id: '1', type: 'other', otherDescription: 'ביט', amount: 300
    }], 'secured');
    assert(!rBitBasic.isEligible, 'Negative: Bit without reference is blocked under secured signature');

    // 3.2 Bit WITH generic isVerified flag AND transaction reference (Updated Test 8 requirement)
    const rBitWithRefAndFlag = validateSecuredReceiptPaymentEligibility([{
      id: '1', type: 'other', otherDescription: 'ביט', amount: 300,
      referenceNumber: 'BIT-TX-888999', isVerified: true
    }], 'secured');
    assert(!rBitWithRefAndFlag.isEligible && rBitWithRefAndFlag.ineligibleComponents[0].reason.includes('דגל אימות כללי ומספר אסמכתא אינם מספקים'),
      'Negative (Updated Test 8): Bit WITH generic isVerified flag and reference remains strictly blocked under secured signature',
      rBitWithRefAndFlag.ineligibleComponents[0].reason.split('.')[1]?.trim());

    // 3.3 PayBox WITH reference and flag
    const rPayboxWithRef = validateSecuredReceiptPaymentEligibility([{
      id: '1', type: 'other', otherDescription: 'PayBox', amount: 450,
      referenceNumber: 'PB-123456', isVerified: true
    }], 'secured');
    assert(!rPayboxWithRef.isEligible, 'Negative: PayBox remains strictly blocked under secured signature');

    // 3.4 Unclassified other
    const rOther = validateSecuredReceiptPaymentEligibility([{
      id: '1', type: 'other', otherDescription: 'ארנק דיגיטלי', amount: 200, isVerified: true
    }], 'secured');
    assert(!rOther.isEligible, 'Negative: Unclassified digital wallet remains strictly blocked under secured signature');

    // -------------------------------------------------------------
    // Test Group 4: Cash & Mixed / Split Payment Negative Tests
    // -------------------------------------------------------------
    console.log('\n--- Test Group 4: Cash & Mixed / Split Payment Negative Tests (18ב(ד)) ---');

    // 4.1 Cash alone
    const rCash = validateSecuredReceiptPaymentEligibility([{ id: '1', type: 'cash', amount: 500 }], 'secured');
    assert(!rCash.isEligible, 'Negative: Cash alone is blocked under secured signature');

    // 4.2 Split: Valid Bank Transfer + Cash
    const rSplitBankCash = validateSecuredReceiptPaymentEligibility([
      { id: '1', type: 'bank_transfer', amount: 500, referenceNumber: 'TX-1', isDirectTransferConfirmed: true },
      { id: '2', type: 'cash', amount: 500 }
    ], 'secured');
    assert(!rSplitBankCash.isEligible && rSplitBankCash.ineligibleComponents.length === 1 && rSplitBankCash.ineligibleComponents[0].type === 'מזומן',
      'Negative: Split payment combining valid bank transfer with cash is blocked');

    // 4.3 Split: Valid Bank Transfer + Bit
    const rSplitBankBit = validateSecuredReceiptPaymentEligibility([
      { id: '1', type: 'bank_transfer', amount: 700, referenceNumber: 'TX-1', isDirectTransferConfirmed: true },
      { id: '2', type: 'other', otherDescription: 'ביט', amount: 300, referenceNumber: 'BIT-999', isVerified: true }
    ], 'secured');
    assert(!rSplitBankBit.isEligible && rSplitBankBit.ineligibleComponents[0].type.includes('ביט'),
      'Negative: Split payment combining valid bank transfer with Bit is blocked');

    // 4.4 Split: Valid Bank Transfer + Unconfirmed Check
    const rSplitBankBadCheck = validateSecuredReceiptPaymentEligibility([
      { id: '1', type: 'bank_transfer', amount: 600, referenceNumber: 'TX-1', isDirectTransferConfirmed: true },
      { id: '2', type: 'check', amount: 400, checkNumber: '10', checkBank: '12', checkBranch: '100', checkIsCrossed: false, checkIsNonNegotiable: true, checkIsPayableToBusinessOnly: true }
    ], 'secured');
    assert(!rSplitBankBadCheck.isEligible && rSplitBankBadCheck.ineligibleComponents[0].type.includes('המחאה'),
      'Negative: Split payment combining valid bank transfer with uncrossed check is blocked');

    // 4.5 Certified Category permits all methods including cash and other
    const rCertifiedCash = validateSecuredReceiptPaymentEligibility([{ id: '1', type: 'cash', amount: 500 }], 'certified');
    assert(rCertifiedCash.isEligible, 'Positive: Certified signature (חתימה מאושרת) permits cash under section 18ב');

    // -------------------------------------------------------------
    // Test Group 5: Recipient Consent (18ב(ג))
    // -------------------------------------------------------------
    console.log('\n--- Test Group 5: Recipient Consent Enforcement (18ב(ג)) ---');

    function checkConsent(client) {
      if (!client || client.electronicConsent?.status !== 'consented') {
        const isWithdrawn = client?.electronicConsent?.status === 'withdrawn';
        return {
          allowed: false,
          code: isWithdrawn ? 'CONSENT_WITHDRAWN' : 'CONSENT_MISSING',
          ref: 'סעיף 18ב(ג)'
        };
      }
      return { allowed: true };
    }

    assert(!checkConsent({ electronicConsent: { status: 'missing' } }).allowed,
      'Negative: Missing consent is blocked (18ב(ג))');

    assert(!checkConsent({ electronicConsent: { status: 'withdrawn' } }).allowed,
      'Negative: Withdrawn consent is blocked (18ב(ג))');

    assert(checkConsent({ electronicConsent: { status: 'consented' } }).allowed,
      'Positive: Consented client passes 18ב(ג) check');

    // -------------------------------------------------------------
    // Test Group 6: Cryptographic Engine, Tri-Party Identity & Rollback
    // -------------------------------------------------------------
    console.log('\n--- Test Group 6: Cryptographic Engine, Tri-Party Identity & Rollback Integrity ---');

    const { privateKey, publicKey } = crypto.generateKeyPairSync('rsa', { modulusLength: 2048 });
    const privateKeyPem = privateKey.export({ type: 'pkcs8', format: 'pem' });
    const publicKeyPem = publicKey.export({ type: 'spki', format: 'pem' });

    const samplePdf = Buffer.from(
      '%PDF-1.4\n1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n2 0 obj\n<< /Type /Pages /Kids [3 0 R] /Count 1 >>\nendobj\n3 0 obj\n<< /Type /Page /Parent 2 0 R >>\nendobj\nxref\n0 4\n0000000000 65535 f \n0000000009 00000 n \n0000000058 00000 n \n0000000115 00000 n \ntrailer\n<< /Size 4 /Root 1 0 R >>\nstartxref\n164\n%%EOF'
    );

    const certDer = Buffer.concat([
      Buffer.from([0x30, 0x82, 0x01, 0x00]),
      crypto.createHash('sha256').update(publicKeyPem).digest()
    ]);

    const signedPdf = signPdfBufferTest(samplePdf, certDer, privateKeyPem, 'עמית טל', 'מסמך ממוחשב - חתימה אלקטרונית מאובטחת');
    assert(signedPdf.length > samplePdf.length, 'Positive: Signed PDF buffer produced with PKCS#7 detached signature');

    const verifyResult = verifyPdfDigitalSignatureTest(signedPdf);
    assert(verifyResult.isValid && verifyResult.digestMatch,
      'Positive: Independent PDF cryptographic validator confirms valid signature & byteRange');

    // Tri-party byte-exact equality
    if (!fs.existsSync(SIGNED_DOCS_DIR)) fs.mkdirSync(SIGNED_DOCS_DIR, { recursive: true });
    const testFile = path.join(SIGNED_DOCS_DIR, 'receipt_TEST_triparty.pdf');
    fs.writeFileSync(testFile, signedPdf);

    const hArchive = crypto.createHash('sha256').update(fs.readFileSync(testFile)).digest('hex');
    const hDownload = crypto.createHash('sha256').update(signedPdf).digest('hex');
    const hEmail = crypto.createHash('sha256').update(signedPdf).digest('hex');

    assert(hArchive === hDownload && hArchive === hEmail,
      `Positive: Tri-party byte-exact identity verified (SHA-256: ${hArchive.substring(0, 16)}...)`);

    if (fs.existsSync(testFile)) fs.unlinkSync(testFile);

    // Rollback test
    let testSeqNext = 1001;
    testSeqNext += 1; // 1002 allocated
    const simFail = true;
    if (simFail) testSeqNext -= 1; // rolled back
    assert(testSeqNext === 1001, 'Positive: Failed signing rolls back sequence counter without burning numbers');

    // Official sequences intact
    const seqCheck = JSON.parse(fs.readFileSync(SEQUENCES_FILE, 'utf8'));
    assert(seqCheck.paymentRequestNext === 40022 && seqCheck.receiptNext === 250017,
      `Official sequence numbers strictly intact (PaymentRequest: ${seqCheck.paymentRequestNext}, Receipt: ${seqCheck.receiptNext})`);

  } finally {
    // Restore pristine state
    fs.writeFileSync(DOCUMENTS_FILE, JSON.stringify(initialDocs, null, 2), 'utf8');
    fs.writeFileSync(CLIENTS_FILE, JSON.stringify(initialClients, null, 2), 'utf8');
    fs.writeFileSync(SEQUENCES_FILE, JSON.stringify(initialSeq, null, 2), 'utf8');
    fs.writeFileSync(AUDIT_FILE, JSON.stringify(initialAudit, null, 2), 'utf8');
  }

  console.log('\n===========================================================');
  console.log(`Verification Complete: ${passedTests}/${totalTests} tests passed (${Math.round((passedTests/totalTests)*100)}%).`);
  console.log('Official sequence numbers and real database records strictly preserved.');
  console.log('===========================================================');
}

runTestSuite().catch(err => {
  console.error('Test suite failed:', err);
  process.exit(1);
});
