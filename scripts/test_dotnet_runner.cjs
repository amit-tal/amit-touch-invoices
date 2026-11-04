const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { execSync } = require('child_process');
const { createFixedPkcs7 } = require('./test_p7s_fix.cjs');

// Read existing signed PDF to get base PDF
const pdfPath = 'data/test_packages/receipt_TEST-1001_signed.pdf';
const pdfBuf = fs.readFileSync(pdfPath);
const pdfStr = pdfBuf.toString('latin1');

const byteRangeMatch = pdfStr.match(/\/ByteRange\s*\[\s*(\d+)\s+(\d+)\s+(\d+)\s+(\d+)\s*\]/);
const [o1, l1, o2, l2] = byteRangeMatch.slice(1).map(Number);

// Calculate actual SHA-256 over ByteRange
const part1 = pdfBuf.subarray(o1, o1 + l1);
const part2 = pdfBuf.subarray(o2, o2 + l2);
const signedBytes = Buffer.concat([part1, part2]);
const digest = crypto.createHash('sha256').update(signedBytes).digest();

// Load credentials
const certDer = fs.readFileSync('data/test_packages/signing_cert.der');
const keyPemEnc = fs.readFileSync('data/test_packages/signing_key.pem', 'utf8');
const keyObj = crypto.createPrivateKey({ key: keyPemEnc, passphrase: 'AmitTouch_LocalTestKey_2026_Secure!' });
const keyPem = keyObj.export({ type: 'pkcs8', format: 'pem' });

// Create fixed PKCS#7
const p7sBuf = createFixedPkcs7(digest, certDer, keyPem, new Date());
console.log('Fixed PKCS#7 size:', p7sBuf.length);

// Replace /Contents in PDF
const contentsMatch = pdfStr.match(/\/Contents\s*<([0-9a-fA-F]+)>/);
const placeholderLen = contentsMatch[1].length;
let hexSig = p7sBuf.toString('hex');
if (hexSig.length < placeholderLen) {
  hexSig = hexSig.padEnd(placeholderLen, '0');
}

// Find byte position of hex signature in pdfBuf
const contentsStart = pdfBuf.indexOf(Buffer.from('/Contents <', 'ascii')) + '/Contents <'.length;
pdfBuf.write(hexSig, contentsStart, 'hex');

fs.writeFileSync('data/test_packages/receipt_TEST-1001_signed.pdf', pdfBuf);
console.log('Updated receipt_TEST-1001_signed.pdf with fixed PKCS#7!');

// Now run .NET check!
try {
  const out = execSync('powershell -ExecutionPolicy Bypass -File scripts/reproduce_dotnet_check.ps1', { encoding: 'utf8' });
  console.log('\n--- .NET RUNNER OUTPUT ---');
  console.log(out);
} catch (err) {
  console.log('\n--- .NET RUNNER FAILED ---');
  console.log(err.stdout || err.message);
}
