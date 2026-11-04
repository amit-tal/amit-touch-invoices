const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

// ASN.1 DER primitives
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
function derBitString(buf) { return derTag(0x03, Buffer.concat([Buffer.from([0x00]), buf])); }
function derUtcTime(date) {
  const pad = n => String(n).padStart(2, '0');
  const str = String(date.getUTCFullYear()).slice(2) +
    pad(date.getUTCMonth() + 1) +
    pad(date.getUTCDate()) +
    pad(date.getUTCHours()) +
    pad(date.getUTCMinutes()) +
    pad(date.getUTCSeconds()) + 'Z';
  return derTag(0x17, Buffer.from(str, 'ascii'));
}

/**
 * Generates an encrypted RSA-2048 keypair and an Israeli Section 18ב X.509 Certificate
 */
function generateLocalSigningCredentials(passphrase, outputDir) {
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }

  // 1. Generate RSA-2048 Keypair
  console.log('1. Generating cryptographically strong RSA-2048 keypair (CSPRNG)...');
  const { privateKey, publicKey } = crypto.generateKeyPairSync('rsa', {
    modulusLength: 2048,
  });

  // 2. Export Encrypted Private Key (PKCS#8 + AES-256-CBC)
  const encKeyPem = privateKey.export({
    type: 'pkcs8',
    format: 'pem',
    cipher: 'aes-256-cbc',
    passphrase: passphrase
  });

  const keyPath = path.join(outputDir, 'signing_key.pem');
  fs.writeFileSync(keyPath, encKeyPem, { mode: 0o600 });
  console.log(`   ✓ Encrypted private key saved to: ${keyPath} (Mode: 0600, Cipher: AES-256-CBC)`);

  // 3. Construct Subject & Issuer RDNs
  // RFC 5280: Name ::= RDNSequence ::= SEQUENCE OF SET OF AttributeTypeAndValue
  const cnRdn = derSet(derSeq(derOid('2.5.4.3'), derTag(0x0c, Buffer.from('עמית טל - AMIT TOUCH', 'utf8'))));
  const oRdn = derSet(derSeq(derOid('2.5.4.10'), derTag(0x0c, Buffer.from('AMIT TOUCH', 'utf8'))));
  const cRdn = derSet(derSeq(derOid('2.5.4.6'), derTag(0x13, Buffer.from('IL', 'ascii'))));
  const serialRdn = derSet(derSeq(derOid('2.5.4.5'), derTag(0x13, Buffer.from('313500201', 'ascii'))));
  const name = derSeq(cRdn, oRdn, cnRdn, serialRdn);

  const now = new Date();
  // Set notBefore to 24 hours prior to avoid timezone skew and guarantee validity at signing & verification time
  const notBeforeDate = new Date(now.getTime() - 24 * 3600 * 1000);
  const notBefore = derUtcTime(notBeforeDate);
  const exp = new Date(now.getTime() + 3 * 365 * 24 * 3600 * 1000); // 3 Years validity
  const notAfter = derUtcTime(exp);
  const validity = derSeq(notBefore, notAfter);

  const sha256RsaOid = derSeq(derOid('1.2.840.113549.1.1.11'), derNull());
  const version = derTag(0xa0, derInteger(2)); // X.509 v3
  const serialNum = derInteger(Buffer.from(crypto.randomBytes(16)));
  const spkiDer = publicKey.export({ type: 'spki', format: 'der' });

  const tbs = derSeq(
    version,
    serialNum,
    sha256RsaOid,
    name, // Issuer
    validity,
    name, // Subject
    spkiDer // Public Key Info
  );

  // Sign TBS with private key
  const signer = crypto.createSign('SHA256');
  signer.update(tbs);
  const signature = signer.sign(privateKey);

  const certDer = derSeq(
    tbs,
    sha256RsaOid,
    derBitString(signature)
  );

  const certPem = '-----BEGIN CERTIFICATE-----\n' +
    certDer.toString('base64').match(/.{1,64}/g).join('\n') +
    '\n-----END CERTIFICATE-----\n';

  const certPath = path.join(outputDir, 'signing_cert.pem');
  fs.writeFileSync(certPath, certPem, { mode: 0o644 });
  console.log(`   ✓ Public certificate saved to: ${certPath}`);

  const derPath = path.join(outputDir, 'signing_cert.der');
  fs.writeFileSync(derPath, certDer, { mode: 0o644 });

  // 4. Calculate SHA-256 fingerprint
  const x509 = new crypto.X509Certificate(certPem);
  const fingerprint = x509.fingerprint256;
  const fpPath = path.join(outputDir, 'fingerprint.txt');
  fs.writeFileSync(fpPath, `SHA-256 Fingerprint: ${fingerprint}\nSubject: ${x509.subject}\nValid From: ${x509.validFrom}\nValid To: ${x509.validTo}\n`);
  console.log(`   ✓ Certificate Fingerprint (SHA-256): ${fingerprint}`);

  return {
    keyPath,
    certPath,
    derPath,
    fingerprint,
    certPem,
    certDer,
    subject: x509.subject,
    validFrom: x509.validFrom,
    validTo: x509.validTo
  };
}

module.exports = {
  generateLocalSigningCredentials
};

if (require.main === module) {
  const defaultPassphrase = process.env.SIGNING_KEY_PASSPHRASE || 'AmitTouch_SecuredSigningKey_2026';
  const outDir = path.resolve(process.cwd(), 'certs');
  console.log('Generating local signing setup in ./certs ...');
  generateLocalSigningCredentials(defaultPassphrase, outDir);
  console.log('\nLocal credentials setup completed.');
}
