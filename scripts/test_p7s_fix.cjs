const fs = require('fs');
const crypto = require('crypto');
const path = require('path');

// ASN.1 helpers
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
function derOctetString(buf) { return derTag(0x04, buf); }
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

function readTag(buf, offset) {
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

function extractIssuerAndSerial(certDer) {
  const cert = readTag(certDer, 0);
  const tbs = readTag(cert.content, 0);
  let cur = 0;
  // version
  const v = readTag(tbs.content, cur);
  cur += v.totalLen;
  // serial
  const serial = readTag(tbs.content, cur);
  const serialDer = tbs.content.subarray(cur, cur + serial.totalLen);
  cur += serial.totalLen;
  // sigAlg
  const sigAlg = readTag(tbs.content, cur);
  cur += sigAlg.totalLen;
  // issuer
  const issuer = readTag(tbs.content, cur);
  const issuerDer = tbs.content.subarray(cur, cur + issuer.totalLen);
  return { issuerDer, serialDer };
}

const OID_SHA256 = derOid('2.16.840.1.101.3.4.2.1');
const OID_RSA_ENCRYPTION = derOid('1.2.840.113549.1.1.1');
const OID_PKCS7_DATA = derOid('1.2.840.113549.1.7.1');
const OID_PKCS7_SIGNED_DATA = derOid('1.2.840.113549.1.7.2');
const OID_CONTENT_TYPE = derOid('1.2.840.113549.1.9.3');
const OID_MESSAGE_DIGEST = derOid('1.2.840.113549.1.9.4');
const OID_SIGNING_TIME = derOid('1.2.840.113549.1.9.5');

function createFixedPkcs7(docSha256Digest, signingCertDer, privateKeyPem, signingDate = new Date()) {
  const { issuerDer, serialDer } = extractIssuerAndSerial(signingCertDer);

  const attrContentType = derSeq(OID_CONTENT_TYPE, derSet(OID_PKCS7_DATA));
  const attrSigningTime = derSeq(OID_SIGNING_TIME, derSet(derUtcTime(signingDate)));
  const attrMessageDigest = derSeq(OID_MESSAGE_DIGEST, derSet(derOctetString(docSha256Digest)));

  const sortedAttrs = [attrContentType, attrSigningTime, attrMessageDigest].sort((a, b) => a.compare(b));
  const authAttrsSet = derSet(...sortedAttrs);

  // Sign authAttrsSet (tag 0x31)
  const signer = crypto.createSign('SHA256');
  signer.update(authAttrsSet);
  const signatureBytes = signer.sign(privateKeyPem);

  // authenticatedAttributes in SignerInfo has tag [0] IMPLICIT Attributes (0xa0 replacing 0x31)
  const authAttrsTag = Buffer.from(authAttrsSet);
  authAttrsTag[0] = 0xa0;

  const issuerAndSerialNumber = derSeq(issuerDer, serialDer);

  const signerInfo = derSeq(
    derInteger(1), // version 1
    issuerAndSerialNumber,
    derSeq(OID_SHA256, derTag(0x05, Buffer.alloc(0))),
    authAttrsTag,
    derSeq(OID_RSA_ENCRYPTION, derTag(0x05, Buffer.alloc(0))),
    derOctetString(signatureBytes)
  );

  // In detached signature in PDF (ISO 32000-1 / PAdES):
  // encapContentInfo: ContentInfo ::= SEQUENCE { contentType ContentType, content [0] EXPLICIT ... OPTIONAL }
  // When detached: content is omitted, so ContentInfo is SEQUENCE { contentType OID_PKCS7_DATA }
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

module.exports = { createFixedPkcs7, extractIssuerAndSerial };
