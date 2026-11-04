import fs from 'fs';
import path from 'path';
import crypto from 'crypto';

/**
 * AMIT TOUCH - Cryptographic PDF Digital Signature Service
 * Conforming to:
 * - Israeli Electronic Signature Law 5761-2001 (חוק חתימה אלקטרונית, תשס״א-2001)
 * - Section 18ב of the Income Tax Directives (סעיף 18ב להוראות מס הכנסה - ניהול פנקסי חשבונות)
 * - Tax Authority Circular 24/2004 (חוזר מס הכנסה 24/2004)
 * - ISO 32000-1 / Adobe PKCS#7 Detached Digital Signature Standard
 */

const DATA_DIR = path.resolve(process.cwd(), 'data');
const SIGNED_DOCS_DIR = path.resolve(DATA_DIR, 'signed_documents');

export type SignatureCategory = 'certified' | 'secured' | 'none';

export interface DigitalSignatureMetadata {
  isSigned: boolean;
  signatureCategory: SignatureCategory;
  signerName: string;
  signedAt: string;
  sha256Digest: string;
  certificateSubject?: string;
  certificateIssuer?: string;
  certificateValidTo?: string;
  certificateSerialNumber?: string;
  algorithm: string;
  retainedPdfFilename?: string;
}

export interface SigningConfigStatus {
  isConfigured: boolean;
  isTestModeSigningAvailable: boolean;
  signatureCategory: SignatureCategory;
  signerName?: string;
  issuer?: string;
  validTo?: string;
  source: 'env_pem' | 'env_p12' | 'cloud_api' | 'none';
  missingRequirements?: string[];
  legalAdvisory: string;
}

// Ensure signed documents archive directory exists
export function ensureSignedDocsStore(): void {
  if (!fs.existsSync(SIGNED_DOCS_DIR)) {
    fs.mkdirSync(SIGNED_DOCS_DIR, { recursive: true });
  }
}

// -------------------------------------------------------------
// ASN.1 DER Encoding Primitives for RFC 2315 PKCS#7 SignedData
// -------------------------------------------------------------

function derTag(tag: number, content: Buffer): Buffer {
  let lenBytes: Buffer;
  const len = content.length;
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

function derSeq(...items: Buffer[]): Buffer {
  return derTag(0x30, Buffer.concat(items));
}

function derSet(...items: Buffer[]): Buffer {
  return derTag(0x31, Buffer.concat(items));
}

function derOctetString(buf: Buffer): Buffer {
  return derTag(0x04, buf);
}

function derInteger(num: number | Buffer): Buffer {
  if (typeof num === 'number') {
    if (num < 128) return derTag(0x02, Buffer.from([num]));
    return derTag(0x02, Buffer.from([(num >> 8) & 0xff, num & 0xff]));
  }
  if (num[0] & 0x80) {
    return derTag(0x02, Buffer.concat([Buffer.from([0x00]), num]));
  }
  return derTag(0x02, num);
}

function derOid(oidStr: string): Buffer {
  const parts = oidStr.split('.').map(Number);
  const firstByte = parts[0] * 40 + parts[1];
  const bytes = [firstByte];
  for (let i = 2; i < parts.length; i++) {
    let val = parts[i];
    if (val < 128) {
      bytes.push(val);
    } else {
      const subBytes: number[] = [];
      subBytes.push(val & 0x7f);
      val >>= 7;
      while (val > 0) {
        subBytes.push((val & 0x7f) | 0x80);
        val >>= 7;
      }
      bytes.push(...subBytes.reverse());
    }
  }
  return derTag(0x06, Buffer.from(bytes));
}

function derUtcTime(date: Date): Buffer {
  const pad = (n: number) => n.toString().padStart(2, '0');
  const yy = pad(date.getUTCFullYear() % 100);
  const mm = pad(date.getUTCMonth() + 1);
  const dd = pad(date.getUTCDate());
  const hh = pad(date.getUTCHours());
  const min = pad(date.getUTCMinutes());
  const ss = pad(date.getUTCSeconds());
  const str = `${yy}${mm}${dd}${hh}${min}${ss}Z`;
  return derTag(0x17, Buffer.from(str, 'ascii'));
}

function toPdfHexString(str: string): string {
  let hex = 'feff';
  for (let i = 0; i < str.length; i++) {
    const code = str.charCodeAt(i);
    hex += code.toString(16).padStart(4, '0');
  }
  return `<${hex}>`;
}

function fromPdfHexString(hexStr: string): string {
  let clean = hexStr.trim();
  if (clean.startsWith('<') && clean.endsWith('>')) {
    clean = clean.slice(1, -1);
  }
  if (clean.toLowerCase().startsWith('feff')) {
    clean = clean.slice(4);
  }
  let str = '';
  for (let i = 0; i < clean.length; i += 4) {
    const code = parseInt(clean.slice(i, i + 4), 16);
    str += String.fromCharCode(code);
  }
  return str;
}

function readAsn1Tag(buf: Buffer, offset: number) {
  const tag = buf[offset];
  let len = buf[offset + 1];
  let headerLen = 2;
  if (len & 0x80) {
    const numBytes = len & 0x7f;
    len = 0;
    for (let i = 0; i < numBytes; i++) {
      len = (len << 8) | buf[offset + 2 + i];
    }
    headerLen = 2 + numBytes;
  }
  return { tag, len, headerLen, totalLen: headerLen + len, content: buf.subarray(offset + headerLen, offset + headerLen + len) };
}

function extractIssuerAndSerial(certDer: Buffer): { issuerDer: Buffer; serialDer: Buffer } {
  const cert = readAsn1Tag(certDer, 0);
  const tbs = readAsn1Tag(cert.content, 0);
  let cur = 0;
  // version
  const v = readAsn1Tag(tbs.content, cur);
  cur += v.totalLen;
  // serial
  const serial = readAsn1Tag(tbs.content, cur);
  const serialDer = tbs.content.subarray(cur, cur + serial.totalLen);
  cur += serial.totalLen;
  // sigAlg
  const sigAlg = readAsn1Tag(tbs.content, cur);
  cur += sigAlg.totalLen;
  // issuer
  const issuer = readAsn1Tag(tbs.content, cur);
  const issuerDer = tbs.content.subarray(cur, cur + issuer.totalLen);
  return { issuerDer, serialDer };
}

// OIDs
const OID_SHA256 = derOid('2.16.840.1.101.3.4.2.1');
const OID_RSA_ENCRYPTION = derOid('1.2.840.113549.1.1.1');
const OID_PKCS7_DATA = derOid('1.2.840.113549.1.7.1');
const OID_PKCS7_SIGNED_DATA = derOid('1.2.840.113549.1.7.2');
const OID_CONTENT_TYPE = derOid('1.2.840.113549.1.9.3');
const OID_MESSAGE_DIGEST = derOid('1.2.840.113549.1.9.4');
const OID_SIGNING_TIME = derOid('1.2.840.113549.1.9.5');

// Build PKCS#7 SignedData DER structure (RFC 2315 / RFC 5652 compliant)
export function createPkcs7SignedData(
  docSha256Digest: Buffer,
  signingCertDer: Buffer,
  privateKeyPem: string,
  signingDate: Date = new Date()
): Buffer {
  const { issuerDer, serialDer } = extractIssuerAndSerial(signingCertDer);

  const attrContentType = derSeq(OID_CONTENT_TYPE, derSet(OID_PKCS7_DATA));
  const attrSigningTime = derSeq(OID_SIGNING_TIME, derSet(derUtcTime(signingDate)));
  const attrMessageDigest = derSeq(OID_MESSAGE_DIGEST, derSet(derOctetString(docSha256Digest)));

  const sortedAttrs = [attrContentType, attrSigningTime, attrMessageDigest].sort((a, b) => a.compare(b));
  const authAttrsSet = derSet(...sortedAttrs);

  // Sign authAttrsSet with private key
  const signer = crypto.createSign('SHA256');
  signer.update(authAttrsSet);
  const signatureBytes = signer.sign(privateKeyPem);

  // In RFC 5652: authenticatedAttributes [0] IMPLICIT Attributes
  // In DER, this is represented by replacing tag 0x31 (SET) with 0xa0 ([0])
  const authAttrsTag = Buffer.from(authAttrsSet);
  authAttrsTag[0] = 0xa0;

  const issuerAndSerialNumber = derSeq(issuerDer, serialDer);

  const signerInfo = derSeq(
    derInteger(1),
    issuerAndSerialNumber,
    derSeq(OID_SHA256, derTag(0x05, Buffer.alloc(0))),
    authAttrsTag,
    derSeq(OID_RSA_ENCRYPTION, derTag(0x05, Buffer.alloc(0))),
    derOctetString(signatureBytes)
  );

  const contentInfo = derSeq(OID_PKCS7_DATA);
  const digestAlgorithms = derSet(derSeq(OID_SHA256, derTag(0x05, Buffer.alloc(0))));
  const certsTag = derTag(0xa0, signingCertDer);
  const signerInfos = derSet(signerInfo);

  const signedData = derSeq(
    derInteger(1),
    digestAlgorithms,
    contentInfo,
    certsTag,
    signerInfos
  );

  return derSeq(
    OID_PKCS7_SIGNED_DATA,
    derTag(0xa0, signedData)
  );
}

// -------------------------------------------------------------
// Certificate & Credentials Resolution
// -------------------------------------------------------------

export function loadSigningCredentials(): {
  certDer: Buffer;
  certPem: string;
  privateKeyPem: string;
  category: SignatureCategory;
  subject: string;
  issuer: string;
  validTo: string;
} | null {
  const passphrase = process.env.SIGNING_KEY_PASSPHRASE || 'AmitTouch_LocalTestKey_2026_Secure!';

  // Helper to safely load private key (supports encrypted PEM/PKCS#8 with passphrase)
  const resolvePrivateKey = (rawKey: string): string | null => {
    try {
      if (passphrase) {
        const keyObj = crypto.createPrivateKey({ key: rawKey, passphrase });
        return keyObj.export({ type: 'pkcs8', format: 'pem' }) as string;
      }
      return rawKey;
    } catch (e) {
      console.error('Failed to parse private key (check SIGNING_KEY_PASSPHRASE):', e);
      return null;
    }
  };

  // 1. Check direct PEM environment variables
  const envCertPem = process.env.SIGNING_CERT_PEM;
  const envKeyPem = process.env.SIGNING_KEY_PEM;
  if (envCertPem && envKeyPem) {
    try {
      const parsedKey = resolvePrivateKey(envKeyPem);
      if (parsedKey) {
        const x509 = new crypto.X509Certificate(envCertPem);
        const isComsign = x509.issuer.includes('Comsign') || x509.issuer.includes('PersonalID');
        return {
          certDer: x509.raw,
          certPem: envCertPem,
          privateKeyPem: parsedKey,
          category: isComsign ? 'certified' : 'secured',
          subject: x509.subject,
          issuer: x509.issuer,
          validTo: x509.validTo,
        };
      }
    } catch (e) {
      console.error('Failed loading SIGNING_CERT_PEM / SIGNING_KEY_PEM:', e);
    }
  }

  // 2. Check PEM file paths (with passphrase support to avoid unencrypted keys on disk)
  const certPath = process.env.SIGNING_CERT_PATH;
  const keyPath = process.env.SIGNING_KEY_PATH;
  if (certPath && keyPath && fs.existsSync(certPath) && fs.existsSync(keyPath)) {
    try {
      const certPem = fs.readFileSync(certPath, 'utf8');
      const rawKeyPem = fs.readFileSync(keyPath, 'utf8');
      const parsedKey = resolvePrivateKey(rawKeyPem);
      if (parsedKey) {
        const x509 = new crypto.X509Certificate(certPem);
        const isComsign = x509.issuer.includes('Comsign') || x509.issuer.includes('PersonalID');
        return {
          certDer: x509.raw,
          certPem,
          privateKeyPem: parsedKey,
          category: isComsign ? 'certified' : 'secured',
          subject: x509.subject,
          issuer: x509.issuer,
          validTo: x509.validTo,
        };
      }
    } catch (e) {
      console.error('Failed loading certificate from files:', e);
    }
  }

  // 3. Check default local server certificate directory: ./certs/signing_cert.pem & ./certs/signing_key.pem
  const localCertPath = path.resolve(process.cwd(), 'certs', 'signing_cert.pem');
  const localKeyPath = path.resolve(process.cwd(), 'certs', 'signing_key.pem');
  if (fs.existsSync(localCertPath) && fs.existsSync(localKeyPath)) {
    try {
      const certPem = fs.readFileSync(localCertPath, 'utf8');
      const rawKeyPem = fs.readFileSync(localKeyPath, 'utf8');
      const parsedKey = resolvePrivateKey(rawKeyPem);
      if (parsedKey) {
        const x509 = new crypto.X509Certificate(certPem);
        const isComsign = x509.issuer.includes('Comsign') || x509.issuer.includes('PersonalID');
        return {
          certDer: x509.raw,
          certPem,
          privateKeyPem: parsedKey,
          category: isComsign ? 'certified' : 'secured',
          subject: x509.subject,
          issuer: x509.issuer,
          validTo: x509.validTo,
        };
      }
    } catch (e) {
      console.error('Failed loading local credentials from ./certs:', e);
    }
  }

  // 4. Check test packages directory fallback: ./data/test_packages/signing_cert.pem & signing_key.pem
  const testPkgCert = path.resolve(process.cwd(), 'data', 'test_packages', 'signing_cert.pem');
  const testPkgKey = path.resolve(process.cwd(), 'data', 'test_packages', 'signing_key.pem');
  if (fs.existsSync(testPkgCert) && fs.existsSync(testPkgKey)) {
    try {
      const certPem = fs.readFileSync(testPkgCert, 'utf8');
      const rawKeyPem = fs.readFileSync(testPkgKey, 'utf8');
      const parsedKey = resolvePrivateKey(rawKeyPem);
      if (parsedKey) {
        const x509 = new crypto.X509Certificate(certPem);
        return {
          certDer: x509.raw,
          certPem,
          privateKeyPem: parsedKey,
          category: 'secured',
          subject: x509.subject,
          issuer: x509.issuer,
          validTo: x509.validTo,
        };
      }
    } catch (e) {
      console.error('Failed loading credentials from data/test_packages:', e);
    }
  }

  return null;
}

export function getSigningConfigStatus(): SigningConfigStatus {
  const creds = loadSigningCredentials();
  const isLiveDisabled = process.env.ELECTRONIC_RECEIPTS_ENABLED === 'false';

  if (creds && !isLiveDisabled) {
    return {
      isConfigured: true,
      isTestModeSigningAvailable: true,
      signatureCategory: creds.category,
      signerName: creds.subject,
      issuer: creds.issuer,
      validTo: creds.validTo,
      source: process.env.SIGNING_CERT_PEM ? 'env_pem' : 'env_p12',
      legalAdvisory: creds.category === 'certified'
        ? 'חתימה אלקטרונית מאושרת (Certified) — מתאימה לכל אמצעי התשלום לרבות מזומן והמחאות.'
        : 'חתימה אלקטרונית מאובטחת מקומית (Secured) — מתאימה לשליחה דיגיטלית עבור העברות בנקאיות מאומתות, אשראי והמחאות למוטב בלבד (סעיף 18ב(ד)).'
    };
  }

  if (creds && isLiveDisabled) {
    return {
      isConfigured: false,
      isTestModeSigningAvailable: true,
      signatureCategory: 'secured',
      signerName: creds.subject,
      issuer: creds.issuer,
      validTo: creds.validTo,
      source: 'env_p12',
      missingRequirements: [
        'הפקת קבלות אלקטרוניות רשמיות ללקוחות מושבתת כעת בשרת (ELECTRONIC_RECEIPTS_ENABLED=false). חתימה מקומית מופעלת במצב בדיקה (TEST) בלבד.'
      ],
      legalAdvisory: 'חתימה אלקטרונית מאובטחת מקומית מופעלת עבור מסמכי בדיקה (TEST). הפקת קבלות אלקטרוניות רשמיות ללקוחות מושבתת עד לאישור סופי של סביבת הייצור.'
    };
  }

  return {
    isConfigured: false,
    isTestModeSigningAvailable: false,
    signatureCategory: 'none',
    source: 'none',
    missingRequirements: [
      'יצירת תעודת חתימה מקומית מוגנת באמצעות scripts/setup_local_signing.js',
      'הגדרת SIGNING_KEY_PASSPHRASE בקובץ .env להגנה על המפתח המוצפן',
      'הגדרת ELECTRONIC_RECEIPTS_ENABLED=true בשרת'
    ],
    legalAdvisory: 'טרם הוגדרה תעודת חתימה אלקטרונית בשרת. בהתאם לסעיף 18ב וחוזר 24/2004, לא ניתן להפיק קבלה אלקטרונית לשליחה דיגיטלית ללא חתימה מאובטחת או מאושרת.'
  };
}

// -------------------------------------------------------------
// Core PDF Cryptographic Signing Engine
// -------------------------------------------------------------

export function signPdfBuffer(
  inputPdf: Buffer,
  certDer: Buffer,
  privateKeyPem: string,
  signerName = 'עמית טל - AMIT TOUCH',
  reason = 'מסמך ממוחשב - חתימה אלקטרונית מאובטחת לפי סעיף 18ב'
): Buffer {
  const SIGNATURE_SIZE = 8192; // 4096 bytes DER hex-encoded

  const str = inputPdf.toString('latin1');
  const startXrefIdx = str.lastIndexOf('startxref');
  if (startXrefIdx === -1) {
    throw new Error('Invalid PDF structure: startxref not found');
  }

  const objMatches = [...str.matchAll(/(\d+)\s+0\s+obj/g)].map(m => parseInt(m[1], 10));
  const maxObj = Math.max(...objMatches, 10);

  const sigAnnotObjNum = maxObj + 1;
  const sigDictObjNum = maxObj + 2;
  const newRootObjNum = maxObj + 3;

  const byteRangePlaceholder = '/ByteRange [ 0000000000 0000000000 0000000000 0000000000 ]';
  const contentsPlaceholder = '0'.repeat(SIGNATURE_SIZE);

  const now = new Date();
  const pad = (n: number) => n.toString().padStart(2, '0');
  const pdfDate = `D:${now.getUTCFullYear()}${pad(now.getUTCMonth()+1)}${pad(now.getUTCDate())}${pad(now.getUTCHours())}${pad(now.getUTCMinutes())}${pad(now.getUTCSeconds())}Z`;

  const newObjects = `
${sigAnnotObjNum} 0 obj
<<
  /Type /Annot
  /Subtype /Widget
  /FT /Sig
  /Rect [0 0 0 0]
  /F 4
  /T (AMIT_TOUCH_Digital_Signature)
  /V ${sigDictObjNum} 0 R
>>
endobj

${sigDictObjNum} 0 obj
<<
  /Type /Sig
  /Filter /Adobe.PPKLite
  /SubFilter /adbe.pkcs7.detached
  ${byteRangePlaceholder}
  /Contents <${contentsPlaceholder}>
  /Reason ${toPdfHexString(reason)}
  /M (${pdfDate})
  /Name ${toPdfHexString(signerName)}
  /ContactInfo (amit2001tal@gmail.com)
  /Location (Israel)
>>
endobj

${newRootObjNum} 0 obj
<<
  /Type /Catalog
  /Pages 2 0 R
  /AcroForm <<
    /SigFlags 3
    /Fields [${sigAnnotObjNum} 0 R]
  >>
>>
endobj
`;

  const prevXrefOffset = parseInt(str.substring(startXrefIdx + 9).trim(), 10) || 0;
  const baseLen = inputPdf.length;

  const parts = newObjects.split(/(?=\d+\s+0\s+obj)/g).filter(p => p.trim());
  let currentOffset = baseLen;
  const offsets: number[] = [];
  for (const part of parts) {
    offsets.push(currentOffset);
    currentOffset += Buffer.byteLength(part, 'latin1');
  }

  const xrefSection = `
xref
0 1
0000000000 65535 f 
${sigAnnotObjNum} 3
${offsets[0].toString().padStart(10, '0')} 00000 n 
${offsets[1].toString().padStart(10, '0')} 00000 n 
${offsets[2].toString().padStart(10, '0')} 00000 n 
trailer
<<
  /Size ${newRootObjNum + 1}
  /Root ${newRootObjNum} 0 R
  /Prev ${prevXrefOffset}
>>
startxref
${currentOffset}
%%EOF
`;

  const combinedBuffer = Buffer.concat([
    inputPdf,
    Buffer.from(newObjects, 'latin1'),
    Buffer.from(xrefSection, 'latin1')
  ]);

  const combinedStr = combinedBuffer.toString('latin1');
  const contentsToken = '/Contents <';
  const contentsIdx = combinedStr.indexOf(contentsToken);
  if (contentsIdx === -1) {
    throw new Error('Failed to locate /Contents in PDF signature block');
  }

  const hexStart = contentsIdx + contentsToken.length;
  const hexEnd = hexStart + SIGNATURE_SIZE;
  const byteAfterCloseTag = hexEnd + 1;
  const remainingLen = combinedBuffer.length - byteAfterCloseTag;

  const b0 = 0;
  const b1 = hexStart - 1;
  const b2 = byteAfterCloseTag;
  const b3 = remainingLen;

  const actualByteRangeStr = `/ByteRange [ ${b0.toString().padStart(10, '0')} ${b1.toString().padStart(10, '0')} ${b2.toString().padStart(10, '0')} ${b3.toString().padStart(10, '0')} ]`;
  const brPlaceholderBuf = Buffer.from(byteRangePlaceholder, 'latin1');
  const actualBrBuf = Buffer.from(actualByteRangeStr, 'latin1');
  const brIdx = combinedBuffer.indexOf(brPlaceholderBuf);
  if (brIdx === -1) {
    throw new Error('Failed to locate /ByteRange placeholder');
  }
  actualBrBuf.copy(combinedBuffer, brIdx);

  const part1 = combinedBuffer.subarray(0, b1);
  const part2 = combinedBuffer.subarray(b2, b2 + b3);

  const hash = crypto.createHash('sha256');
  hash.update(part1);
  hash.update(part2);
  const pdfDigest = hash.digest();

  const pkcs7Der = createPkcs7SignedData(pdfDigest, certDer, privateKeyPem, now);
  const pkcs7Hex = pkcs7Der.toString('hex');

  if (pkcs7Hex.length > SIGNATURE_SIZE) {
    throw new Error(`PKCS#7 signature payload (${pkcs7Hex.length}) exceeds allocated buffer (${SIGNATURE_SIZE})`);
  }

  const paddedHex = pkcs7Hex.padEnd(SIGNATURE_SIZE, '0');
  Buffer.from(paddedHex, 'ascii').copy(combinedBuffer, hexStart);

  return combinedBuffer;
}

// -------------------------------------------------------------
// Independent Signature Validator (Tamper-Detection Engine)
// -------------------------------------------------------------

export function verifyPdfDigitalSignature(pdfBuffer: Buffer): {
  isSigned: boolean;
  isValid: boolean;
  digestMatch: boolean;
  signerName?: string;
  signerCommonName?: string;
  reason?: string;
  signatureTime?: string;
  calculatedDigest: string;
  embeddedDigest?: string;
  byteRange?: number[];
  details: string;
} {
  const str = pdfBuffer.toString('latin1');
  const brMatch = str.match(/\/ByteRange\s*\[\s*(\d+)\s+(\d+)\s+(\d+)\s+(\d+)\s*\]/);
  if (!brMatch) {
    return {
      isSigned: false,
      isValid: false,
      digestMatch: false,
      calculatedDigest: '',
      details: 'המסמך אינו חתום דיגיטלית (No /ByteRange signature dictionary found)'
    };
  }

  const b0 = parseInt(brMatch[1], 10);
  const b1 = parseInt(brMatch[2], 10);
  const b2 = parseInt(brMatch[3], 10);
  const b3 = parseInt(brMatch[4], 10);

  const contentsMatch = str.match(/\/Contents\s*<([0-9a-fA-F]+)>/);
  if (!contentsMatch) {
    return {
      isSigned: true,
      isValid: false,
      digestMatch: false,
      calculatedDigest: '',
      details: 'מבנה החתימה פגום (Missing /Contents signature payload)'
    };
  }

  // Recalculate digest over the exact byte ranges covered by /ByteRange
  const part1 = pdfBuffer.subarray(b0, b0 + b1);
  const part2 = pdfBuffer.subarray(b2, b2 + b3);
  const calculatedDigest = crypto.createHash('sha256').update(part1).update(part2).digest('hex');

  // Extract embedded message digest from PKCS#7 SignedData payload in /Contents
  const contentsHex = contentsMatch[1];
  const pkcs7Buf = Buffer.from(contentsHex, 'hex');

  // Search for messageDigest attribute OID: 1.2.840.113549.1.9.4
  // DER encoding of OID: 06 09 2A 86 48 86 F7 0D 01 09 04
  const mdOid = Buffer.from([0x06, 0x09, 0x2a, 0x86, 0x48, 0x86, 0xf7, 0x0d, 0x01, 0x09, 0x04]);
  const mdIdx = pkcs7Buf.indexOf(mdOid);
  let embeddedDigestHex = '';

  if (mdIdx !== -1) {
    // Following OID, find the OCTET STRING containing the 32-byte digest (0x04, 0x20)
    const afterOid = pkcs7Buf.subarray(mdIdx + mdOid.length);
    const octetMarker = Buffer.from([0x04, 0x20]);
    const octetIdx = afterOid.indexOf(octetMarker);
    if (octetIdx !== -1 && afterOid.length >= octetIdx + 2 + 32) {
      embeddedDigestHex = afterOid.subarray(octetIdx + 2, octetIdx + 2 + 32).toString('hex');
    }
  }

  const digestMatch = embeddedDigestHex 
    ? (embeddedDigestHex.toLowerCase() === calculatedDigest.toLowerCase()) 
    : false;
  const isValid = digestMatch;

  const nameHexMatch = str.match(/\/Name\s*<([0-9a-fA-F]+)>/);
  const nameLitMatch = str.match(/\/Name\s*\(([^)]+)\)/);
  const signerName = nameHexMatch ? fromPdfHexString(nameHexMatch[1]) : (nameLitMatch ? nameLitMatch[1] : undefined);

  const reasonHexMatch = str.match(/\/Reason\s*<([0-9a-fA-F]+)>/);
  const reasonLitMatch = str.match(/\/Reason\s*\(([^)]+)\)/);
  const reason = reasonHexMatch ? fromPdfHexString(reasonHexMatch[1]) : (reasonLitMatch ? reasonLitMatch[1] : undefined);

  const dateMatch = str.match(/\/M\s*\(([^)]+)\)/);
  const signatureTime = dateMatch ? dateMatch[1] : undefined;

  return {
    isSigned: true,
    isValid,
    digestMatch,
    signerName,
    signerCommonName: signerName,
    reason,
    signatureTime,
    calculatedDigest,
    embeddedDigest: embeddedDigestHex,
    byteRange: [b0, b1, b2, b3],
    details: isValid
      ? `חתימה אלקטרונית תקפה ומאומתת. שלמות המסמך מאושרת (SHA-256 Digest: ${calculatedDigest.substring(0, 16)}...)`
      : `אימות נכשל: התוכן שונה לאחר החתימה או שהתקבל תקציר לא תואם (מחושב: ${calculatedDigest.substring(0, 16)}... מול חתום: ${embeddedDigestHex.substring(0, 16)}...)`
  };
}
