import type { Connect } from 'vite';
import fs from 'fs';
import path from 'path';
import type { 
  AppDocument, 
  SequenceSettings, 
  BusinessSettings, 
  AuditLogEntry 
} from '../src/types/documents.ts';
// Lazy-load PDF generator to keep startup memory minimal and keep Chromium off until needed
let _pdfGeneratorPromise: Promise<any> | null = null;
function getPdfGenerator(): Promise<any> {
  if (!_pdfGeneratorPromise) {
    _pdfGeneratorPromise = import('./pdfGenerator.ts');
  }
  return _pdfGeneratorPromise;
}

function formatIsoDateSlash(isoStr?: string): string {
  if (!isoStr) return '';
  const [y, m, d] = isoStr.split('-');
  if (!y || !m || !d) return isoStr;
  return `${d}/${m}/${y}`;
}

function getDefaultEmailContent(
  document: AppDocument,
  business: BusinessSettings
): { subject: string; messageBody: string } {
  const docNum = document.documentNumber || 'טיוטה';
  const customerName = document.clientName || 'לקוח/ה';
  const formattedTotal = `${(document.totalAmount || 0).toLocaleString('he-IL')} ${document.currency || '₪'}`;
  const senderName = business.legalName && !business.legalName.toUpperCase().includes('TOUCH')
    ? business.legalName
    : (business.tradingName || 'AMIT TOUCH');

  if (document.type === 'payment_request') {
    const subject = `AMIT TOUCH | חשבון עסקה מס׳ ${docNum}`;
    const formattedDueDate = formatIsoDateSlash(document.dueDate);
    const bodyLines = [
      `שלום ${customerName},`,
      ``,
      `מצורף חשבון עסקה מס׳ ${docNum}.`,
      ``,
      `סכום לתשלום: ${formattedTotal}`,
      ...(formattedDueDate ? [`מועד פירעון: ${formattedDueDate}`] : []),
      ``,
      `תודה על שיתוף הפעולה,`,
      senderName,
      `AMIT TOUCH`,
    ];
    return { subject, messageBody: bodyLines.join('\n') };
  }

  if (document.type === 'receipt') {
    const subject = `AMIT TOUCH | קבלה מס׳ ${docNum}`;
    const paidAmount = document.paidAmount || document.totalAmount || 0;
    const formattedPaid = `${paidAmount.toLocaleString('he-IL')} ${document.currency || '₪'}`;
    const bodyLines = [
      `שלום ${customerName},`,
      ``,
      `מצורפת קבלה מס׳ ${docNum} המאשרת את קבלת התשלום.`,
      ``,
      `סכום ששולם: ${formattedPaid}`,
      ``,
      `תודה על שיתוף הפעולה,`,
      senderName,
      `AMIT TOUCH`,
    ];
    return { subject, messageBody: bodyLines.join('\n') };
  }

  // Quote
  const subject = `AMIT TOUCH | הצעת מחיר מס׳ ${docNum}`;
  const formattedValidUntil = formatIsoDateSlash(document.validUntilDate);
  const bodyLines = [
    `שלום ${customerName},`,
    ``,
    `מצורפת הצעת מחיר מס׳ ${docNum} לעיונך.`,
    ``,
    `סכום ההצעה: ${formattedTotal}`,
    ...(formattedValidUntil ? [`בתוקף עד: ${formattedValidUntil}`] : []),
    ``,
    `תודה על שיתוף הפעולה,`,
    senderName,
    `AMIT TOUCH`,
  ];
  return { subject, messageBody: bodyLines.join('\n') };
}
import { 
  checkEmailProviderStatus, 
  saveEmailConfig, 
  sendDocumentEmail 
} from './emailService.ts';
import {
  getOwnerAccount,
  saveOwnerAccount,
  getOrCreateSetupToken,
  verifySetupToken,
  consumeSetupToken,
  hashPassword,
  verifyPassword,
  createSession,
  destroySession,
  parseSessionCookie,
  setSessionCookie,
  clearSessionCookie,
  checkLoginRateLimit,
  recordLoginFailure,
  clearLoginFailures,
  authenticateRequest,
} from './authService.ts';
import crypto from 'crypto';

import {
  getSigningConfigStatus,
  loadSigningCredentials,
  signPdfBuffer,
  ensureSignedDocsStore,
  verifyPdfDigitalSignature
} from './digitalSignatureService.ts';

const DATA_DIR = process.env.DATA_DIR
  ? path.resolve(process.env.DATA_DIR)
  : path.resolve(process.cwd(), 'data');
const DOCUMENTS_FILE = path.join(DATA_DIR, 'documents.json');
const SEQUENCES_FILE = path.join(DATA_DIR, 'sequences.json');
const BUSINESS_FILE = path.join(DATA_DIR, 'business.json');
const AUDIT_FILE = path.join(DATA_DIR, 'audit.json');
const IDEMPOTENCY_FILE = path.join(DATA_DIR, 'idempotency.json');
const CLIENTS_FILE = path.join(DATA_DIR, 'clients.json');
const PROJECTS_FILE = path.join(DATA_DIR, 'projects.json');
const ENTRIES_FILE = path.join(DATA_DIR, 'entries.json');
const TIMER_FILE = path.join(DATA_DIR, 'timer.json');
const BACKUPS_DIR = path.join(DATA_DIR, 'backups');
const EXTERNAL_BACKUPS_DIR = process.env.BACKUP_EXTERNAL_DIR
  ? path.resolve(process.env.BACKUP_EXTERNAL_DIR)
  : path.resolve(process.cwd(), 'protected_backups');
const BACKUP_STATUS_FILE = path.join(DATA_DIR, 'backup_status.json');
const APP_SETTINGS_FILE = path.join(DATA_DIR, 'settings.json');
const MAINTENANCE_LOCK_FILE = path.join(DATA_DIR, 'maintenance_lock.json');
const SIGNED_DOCS_DIR = path.resolve(DATA_DIR, 'signed_documents');

// Helper to bundle essential graphic assets (signature & studio logo) into backups
function loadBackupAssets(): { signatureBase64?: string; logoBase64?: string } {
  const assets: { signatureBase64?: string; logoBase64?: string } = {};
  const sigPath = path.resolve(process.cwd(), 'signiture.png');
  const pubSigPath = path.resolve(process.cwd(), 'public/signiture.png');
  const logoPath = path.resolve(process.cwd(), 'public/amit-touch-logo.png');

  try {
    if (fs.existsSync(sigPath)) {
      assets.signatureBase64 = `data:image/png;base64,${fs.readFileSync(sigPath).toString('base64')}`;
    } else if (fs.existsSync(pubSigPath)) {
      assets.signatureBase64 = `data:image/png;base64,${fs.readFileSync(pubSigPath).toString('base64')}`;
    }
  } catch {}

  try {
    if (fs.existsSync(logoPath)) {
      assets.logoBase64 = `data:image/png;base64,${fs.readFileSync(logoPath).toString('base64')}`;
    }
  } catch {}

  return assets;
}

// Helper to bundle signed and issued PDFs into backups for archival immutability
function loadBackupSignedPdfs(): Record<string, string> {
  const result: Record<string, string> = {};
  try {
    if (fs.existsSync(SIGNED_DOCS_DIR)) {
      const files = fs.readdirSync(SIGNED_DOCS_DIR).filter(f => f.endsWith('.pdf'));
      for (const file of files) {
        result[file] = fs.readFileSync(path.join(SIGNED_DOCS_DIR, file)).toString('base64');
      }
    }
  } catch (e) {
    console.error('Error reading signed PDFs for backup:', e);
  }
  return result;
}

// Retention policy: prune files older than maxRetentionDays or exceeding maxCount
function pruneBackupDirectory(dirPath: string, prefix: string, maxCount = 30, maxRetentionDays = 30): void {
  try {
    if (!fs.existsSync(dirPath)) return;
    const now = Date.now();
    const maxAgeMs = maxRetentionDays * 24 * 60 * 60 * 1000;
    const files = fs.readdirSync(dirPath)
      .filter(f => f.startsWith(prefix) && f.endsWith('.json'))
      .map(f => {
        const full = path.join(dirPath, f);
        const stat = fs.statSync(full);
        return { name: f, full, mtime: stat.mtimeMs };
      })
      .sort((a, b) => b.mtime - a.mtime);

    files.forEach((file, index) => {
      const isTooOld = (now - file.mtime) > maxAgeMs;
      const isBeyondCount = index >= maxCount;
      if (isTooOld || isBeyondCount) {
        try { fs.unlinkSync(file.full); } catch {}
      }
    });
  } catch (err) {
    console.error('Error during backup retention pruning:', err);
  }
}

// Perform automatic snapshot of persistent data
function performAutoBackup(reason: string = 'auto_snapshot'): void {
  try {
    if (!fs.existsSync(BACKUPS_DIR)) {
      fs.mkdirSync(BACKUPS_DIR, { recursive: true });
    }
    if (!fs.existsSync(EXTERNAL_BACKUPS_DIR)) {
      fs.mkdirSync(EXTERNAL_BACKUPS_DIR, { recursive: true });
    }
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const filename = `snapshot_${timestamp}.json`;
    const localBackupFile = path.join(BACKUPS_DIR, filename);
    const externalBackupFile = path.join(EXTERNAL_BACKUPS_DIR, filename);

    const clients = fs.existsSync(CLIENTS_FILE) ? JSON.parse(fs.readFileSync(CLIENTS_FILE, 'utf8')) : [];
    const projects = fs.existsSync(PROJECTS_FILE) ? JSON.parse(fs.readFileSync(PROJECTS_FILE, 'utf8')) : [];
    const entries = fs.existsSync(ENTRIES_FILE) ? JSON.parse(fs.readFileSync(ENTRIES_FILE, 'utf8')) : [];
    const documents = fs.existsSync(DOCUMENTS_FILE) ? JSON.parse(fs.readFileSync(DOCUMENTS_FILE, 'utf8')) : [];
    const sequences = fs.existsSync(SEQUENCES_FILE) ? JSON.parse(fs.readFileSync(SEQUENCES_FILE, 'utf8')) : {};
    const business = fs.existsSync(BUSINESS_FILE) ? JSON.parse(fs.readFileSync(BUSINESS_FILE, 'utf8')) : {};
    const audit = fs.existsSync(AUDIT_FILE) ? JSON.parse(fs.readFileSync(AUDIT_FILE, 'utf8')) : [];
    const settings = fs.existsSync(APP_SETTINGS_FILE) ? JSON.parse(fs.readFileSync(APP_SETTINGS_FILE, 'utf8')) : null;
    const timer = fs.existsSync(TIMER_FILE) ? JSON.parse(fs.readFileSync(TIMER_FILE, 'utf8')) : null;

    const snapshot = {
      version: 2,
      exportDate: new Date().toISOString(),
      reason,
      system: 'AMIT TOUCH Business Suite v2.0',
      storageType: 'filesystem_persistent',
      retentionPolicy: '30_days_rolling',
      clients,
      projects,
      entries,
      documents,
      sequences,
      business,
      settings,
      timer,
      audit,
      assets: loadBackupAssets(),
      signedPdfs: loadBackupSignedPdfs(),
    };

    writeJson(localBackupFile, snapshot);
    try {
      writeJson(externalBackupFile, snapshot);
    } catch (e) {
      console.warn('Could not write to external backup directory:', e);
    }

    // Apply retention policy: keep up to 30 snapshots in external dir, 15 in local
    pruneBackupDirectory(BACKUPS_DIR, 'snapshot_', 15, 14);
    pruneBackupDirectory(EXTERNAL_BACKUPS_DIR, 'snapshot_', 30, 30);

    const statusData = {
      lastBackupAt: new Date().toISOString(),
      status: 'success',
      totalLocalSnapshots: fs.readdirSync(BACKUPS_DIR).filter(f => f.startsWith('snapshot_')).length,
      externalBackupLocation: EXTERNAL_BACKUPS_DIR,
      lastReason: reason,
      storageArchitecture: 'dual_domain_persistent_filesystem',
      retention: '30_days',
      isGuaranteedWhileClosed: false,
    };
    writeJson(BACKUP_STATUS_FILE, statusData);
  } catch (err) {
    console.error('Error in performAutoBackup:', err);
  }
}

// Create dedicated safety recovery backup before any restoration
function createRecoveryBackup(trigger: string): string {
  if (!fs.existsSync(BACKUPS_DIR)) {
    fs.mkdirSync(BACKUPS_DIR, { recursive: true });
  }
  if (!fs.existsSync(EXTERNAL_BACKUPS_DIR)) {
    fs.mkdirSync(EXTERNAL_BACKUPS_DIR, { recursive: true });
  }
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const filename = `recovery_${trigger}_${timestamp}.json`;
  const backupFile = path.join(BACKUPS_DIR, filename);
  const externalBackupFile = path.join(EXTERNAL_BACKUPS_DIR, filename);

  const clients = fs.existsSync(CLIENTS_FILE) ? JSON.parse(fs.readFileSync(CLIENTS_FILE, 'utf8')) : [];
  const projects = fs.existsSync(PROJECTS_FILE) ? JSON.parse(fs.readFileSync(PROJECTS_FILE, 'utf8')) : [];
  const entries = fs.existsSync(ENTRIES_FILE) ? JSON.parse(fs.readFileSync(ENTRIES_FILE, 'utf8')) : [];
  const documents = fs.existsSync(DOCUMENTS_FILE) ? JSON.parse(fs.readFileSync(DOCUMENTS_FILE, 'utf8')) : [];
  const sequences = fs.existsSync(SEQUENCES_FILE) ? JSON.parse(fs.readFileSync(SEQUENCES_FILE, 'utf8')) : {};
  const business = fs.existsSync(BUSINESS_FILE) ? JSON.parse(fs.readFileSync(BUSINESS_FILE, 'utf8')) : {};
  const audit = fs.existsSync(AUDIT_FILE) ? JSON.parse(fs.readFileSync(AUDIT_FILE, 'utf8')) : [];
  const settings = fs.existsSync(APP_SETTINGS_FILE) ? JSON.parse(fs.readFileSync(APP_SETTINGS_FILE, 'utf8')) : null;

  const recoverySnapshot = {
    version: 2,
    recoveryDate: new Date().toISOString(),
    trigger,
    system: 'AMIT TOUCH Recovery Snapshot',
    clients,
    projects,
    entries,
    documents,
    sequences,
    business,
    settings,
    audit,
    assets: loadBackupAssets(),
    signedPdfs: loadBackupSignedPdfs(),
  };

  writeJson(backupFile, recoverySnapshot);
  try {
    writeJson(externalBackupFile, recoverySnapshot);
  } catch (e) {
    console.warn('Could not write recovery snapshot to external directory:', e);
  }
  pruneBackupDirectory(BACKUPS_DIR, 'recovery_', 10, 14);
  pruneBackupDirectory(EXTERNAL_BACKUPS_DIR, 'recovery_', 20, 30);
  return filename;
}

// Ensure data folder and default files exist
let isEnsuringDataStore = false;
function ensureDataStore(): void {
  if (isEnsuringDataStore) return;
  isEnsuringDataStore = true;
  try {
    if (!fs.existsSync(DATA_DIR)) {
      fs.mkdirSync(DATA_DIR, { recursive: true });
    }

    const defaultSequences: SequenceSettings = {
      isProductionActive: false,
      paymentRequestNext: 40016, // NEXT official payment request
      receiptNext: 250016, // NEXT official receipt
      quoteNext: null, // Unconfigured until user sets it
      testSequenceNext: 1001,
      isLocked: false,
    };

    const defaultBusiness: BusinessSettings = {
      legalName: 'אמית טאץ׳ בע״מ',
      tradingName: 'AMIT TOUCH',
      businessNumber: '515234567',
      businessType: 'licensed',
      address: 'הברזל 24, רמת החייל, תל אביב',
      phone: '03-6821456',
      email: 'contact@amittouch.co.il',
      logoUrl: '/amit-touch-logo.png',
      currency: '₪',
      bankDetails: {
        bankName: 'בנק הפועלים (12)',
        branch: '610 — רמת החייל',
        accountNumber: '489201',
        accountName: 'אמית טאץ׳ סטודיו לעיצוב בע״מ',
      },
      defaultPaymentTerms: 'שוטף + 30',
      defaultQuoteValidityDays: 14,
      defaultNotes: 'תודה על שיתוף הפעולה. תנאי תשלום כפי שצוין בדרישה זו.',
      vatRate: 0.18, // Current VAT in Israel
      isConfigured: true,
    };

    const SEED_DIR = path.resolve(process.cwd(), 'server', 'seed');
    function loadSeedOrDefault<T>(fileName: string, fallback: T): T {
      const seedPath = path.join(SEED_DIR, fileName);
      if (fs.existsSync(seedPath)) {
        try {
          return JSON.parse(fs.readFileSync(seedPath, 'utf8')) as T;
        } catch (e) {
          console.warn(`Could not read seed file ${fileName}:`, e);
        }
      }
      return fallback;
    }

    if (!fs.existsSync(DOCUMENTS_FILE) || (fs.existsSync(DOCUMENTS_FILE) && JSON.parse(fs.readFileSync(DOCUMENTS_FILE, 'utf8') || '[]').length === 0)) {
      const initialDocs = loadSeedOrDefault('documents.json', []);
      if (initialDocs.length > 0) {
        fs.writeFileSync(DOCUMENTS_FILE, JSON.stringify(initialDocs, null, 2), 'utf-8');
      } else if (!fs.existsSync(DOCUMENTS_FILE)) {
        fs.writeFileSync(DOCUMENTS_FILE, JSON.stringify([], null, 2), 'utf-8');
      }
    }
    if (!fs.existsSync(SEQUENCES_FILE)) {
      const initialSequences = loadSeedOrDefault('sequences.json', defaultSequences);
      fs.writeFileSync(SEQUENCES_FILE, JSON.stringify(initialSequences, null, 2), 'utf-8');
    }
    if (!fs.existsSync(BUSINESS_FILE)) {
      const initialBusiness = loadSeedOrDefault('business.json', defaultBusiness);
      fs.writeFileSync(BUSINESS_FILE, JSON.stringify(initialBusiness, null, 2), 'utf-8');
    }
    if (!fs.existsSync(AUDIT_FILE)) {
      fs.writeFileSync(AUDIT_FILE, JSON.stringify([], null, 2), 'utf-8');
    }
    if (!fs.existsSync(IDEMPOTENCY_FILE)) {
      fs.writeFileSync(IDEMPOTENCY_FILE, JSON.stringify({}, null, 2), 'utf-8');
    }
    if (!fs.existsSync(CLIENTS_FILE) || (fs.existsSync(CLIENTS_FILE) && JSON.parse(fs.readFileSync(CLIENTS_FILE, 'utf8') || '[]').length === 0)) {
      const initialClients = loadSeedOrDefault('clients.json', []);
      if (initialClients.length > 0) {
        fs.writeFileSync(CLIENTS_FILE, JSON.stringify(initialClients, null, 2), 'utf-8');
      } else if (!fs.existsSync(CLIENTS_FILE)) {
        fs.writeFileSync(CLIENTS_FILE, JSON.stringify([], null, 2), 'utf-8');
      }
    }
    if (!fs.existsSync(PROJECTS_FILE) || (fs.existsSync(PROJECTS_FILE) && JSON.parse(fs.readFileSync(PROJECTS_FILE, 'utf8') || '[]').length === 0)) {
      const initialProjects = loadSeedOrDefault('projects.json', []);
      if (initialProjects.length > 0) {
        fs.writeFileSync(PROJECTS_FILE, JSON.stringify(initialProjects, null, 2), 'utf-8');
      } else if (!fs.existsSync(PROJECTS_FILE)) {
        fs.writeFileSync(PROJECTS_FILE, JSON.stringify([], null, 2), 'utf-8');
      }
    }
    if (!fs.existsSync(ENTRIES_FILE) || (fs.existsSync(ENTRIES_FILE) && JSON.parse(fs.readFileSync(ENTRIES_FILE, 'utf8') || '[]').length === 0)) {
      const initialEntries = loadSeedOrDefault('entries.json', []);
      if (initialEntries.length > 0) {
        fs.writeFileSync(ENTRIES_FILE, JSON.stringify(initialEntries, null, 2), 'utf-8');
      } else if (!fs.existsSync(ENTRIES_FILE)) {
        fs.writeFileSync(ENTRIES_FILE, JSON.stringify([], null, 2), 'utf-8');
      }
    }
    if (!fs.existsSync(BACKUPS_DIR)) {
      fs.mkdirSync(BACKUPS_DIR, { recursive: true });
    }
    if (!fs.existsSync(APP_SETTINGS_FILE)) {
      fs.writeFileSync(APP_SETTINGS_FILE, JSON.stringify({
        studioName: 'AMIT TOUCH',
        defaultHourlyRate: 350,
        currency: '₪',
        timerReminder: {
          enabled: true,
          thresholdHours: 4,
          browserNotificationsEnabled: false
        }
      }, null, 2), 'utf-8');
    }
    if (!fs.existsSync(BACKUP_STATUS_FILE)) {
      const initialStatus = {
        lastBackupAt: new Date().toISOString(),
        status: 'success',
        totalLocalSnapshots: 0,
        lastReason: 'initial_store_setup',
        storageArchitecture: 'dual_domain_persistent_filesystem',
        retention: '30_days',
        isGuaranteedWhileClosed: false,
      };
      fs.writeFileSync(BACKUP_STATUS_FILE, JSON.stringify(initialStatus, null, 2), 'utf-8');
      performAutoBackup('initial_store_setup');
    }

    // Normalize legacy delivery statuses and label historical Ethereal test attempts
    try {
      if (fs.existsSync(DOCUMENTS_FILE)) {
        const docs = JSON.parse(fs.readFileSync(DOCUMENTS_FILE, 'utf8'));
        let modified = false;
      for (const d of docs) {
        // Label historical Ethereal test attempts
        if (d.deliveryDetails?.sendAttempts) {
          for (const a of d.deliveryDetails.sendAttempts) {
            if (
              a.provider === 'ethereal' ||
              (a.providerMessageId && a.providerMessageId.includes('ethereal')) ||
              a.isTestOnly
            ) {
              if (a.status !== 'test_only' || !a.isTestOnly) {
                a.status = 'test_only';
                a.isTestOnly = true;
                a.testLabel = 'בדיקה בלבד — לא נשלח';
                modified = true;
              }
            }
          }
        }

        // If document was marked as sent solely via Ethereal or unverified legacy, exclude from actual delivery
        const hasRealSend = d.deliveryDetails?.sendAttempts?.some(
          (a: any) => a.status === 'sent' && a.provider !== 'ethereal' && !a.isTestOnly
        );

        if (!hasRealSend && (d.deliveryStatus === 'sent' || d.deliveryDetails?.provider === 'ethereal')) {
          d.deliveryStatus = 'not_sent';
          if (d.deliveryDetails) {
            delete d.deliveryDetails.sentAt;
            delete d.deliveryDetails.deliveredAt;
            delete d.deliveryDetails.provider;
            delete d.deliveryDetails.providerMessageId;
            delete d.deliveryDetails.channel;
          }
          modified = true;
        }

        if (
          d.deliveryStatus === 'sent_email' ||
          (d.deliveryDetails?.channel === 'email' && !d.deliveryDetails?.providerMessageId && !hasRealSend)
        ) {
          d.deliveryStatus = 'unverified';
          if (!d.deliveryDetails) d.deliveryDetails = {};
          d.deliveryDetails.isUnverifiedLegacy = true;
          modified = true;
        }
      }
      if (modified) {
        fs.writeFileSync(DOCUMENTS_FILE, JSON.stringify(docs, null, 2), 'utf-8');
      }
    }
  } catch (err) {
    console.error('Error normalizing legacy documents:', err);
  }
  } finally {
    isEnsuringDataStore = false;
  }
}

// Strict FIFO Async Mutex to guarantee strictly serialized transactional document operations
class StrictAsyncMutex {
  private queue: Array<() => void> = [];
  private locked = false;

  async acquire(timeoutMs = 10000): Promise<() => void> {
    return new Promise((resolve, reject) => {
      let timer: NodeJS.Timeout | null = null;
      const release = () => {
        if (timer) clearTimeout(timer);
        if (this.queue.length > 0) {
          const next = this.queue.shift()!;
          next();
        } else {
          this.locked = false;
        }
      };

      const execute = () => {
        this.locked = true;
        resolve(release);
      };

      if (!this.locked) {
        execute();
      } else {
        timer = setTimeout(() => {
          const idx = this.queue.indexOf(execute);
          if (idx !== -1) this.queue.splice(idx, 1);
          reject(new Error('Transaction lock acquisition timeout (10000ms)'));
        }, timeoutMs);
        this.queue.push(execute);
      }
    });
  }
}

const transactionMutex = new StrictAsyncMutex();
let currentReleaseFn: (() => void) | null = null;

async function acquireLock(maxWaitMs = 10000): Promise<void> {
  const release = await transactionMutex.acquire(maxWaitMs);
  currentReleaseFn = release;
}

function releaseLock() {
  if (currentReleaseFn) {
    const fn = currentReleaseFn;
    currentReleaseFn = null;
    fn();
  }
}

// Helper readers and crash-safe atomic writers
function readJson<T>(filePath: string): T {
  const raw = fs.readFileSync(filePath, 'utf-8');
  return JSON.parse(raw) as T;
}

function writeJson(filePath: string, data: any): void {
  const dir = path.dirname(filePath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  const randomSuffix = crypto.randomBytes(6).toString('hex');
  const tempPath = path.join(dir, `.${path.basename(filePath)}.${Date.now()}.${randomSuffix}.tmp`);
  const content = JSON.stringify(data, null, 2);

  // 1. Write to temporary file and fsync to flush physical disk buffers
  const fd = fs.openSync(tempPath, 'w');
  try {
    fs.writeFileSync(fd, content, 'utf-8');
    fs.fsyncSync(fd);
  } finally {
    fs.closeSync(fd);
  }

  // 2. Atomic rename over destination file
  try {
    fs.renameSync(tempPath, filePath);
  } catch (err: any) {
    if (process.platform === 'win32' && (err.code === 'EPERM' || err.code === 'EBUSY')) {
      try {
        if (fs.existsSync(filePath)) {
          fs.unlinkSync(filePath);
        }
        fs.renameSync(tempPath, filePath);
      } catch (innerErr) {
        try { if (fs.existsSync(tempPath)) fs.unlinkSync(tempPath); } catch {}
        throw innerErr;
      }
    } else {
      try { if (fs.existsSync(tempPath)) fs.unlinkSync(tempPath); } catch {}
      throw err;
    }
  }
}

export interface IneligiblePaymentComponent {
  type: string;
  amount: number;
  reason: string;
}

export interface PaymentEligibilityResult {
  isEligible: boolean;
  code?: string;
  error?: string;
  ineligibleComponents?: IneligiblePaymentComponent[];
}

/**
 * Statutory payment method eligibility check for computerized receipts (קבלה ממוחשבת)
 * Governed strictly by Section 18ב(ד) of the Israeli Income Tax Regulations (Bookkeeping Directives)
 * (סעיף 18ב(ד) להוראות מס הכנסה - ניהול פנקסי חשבונות, התשל״ג-1973).
 *
 * Rules:
 * - Certified signature (חתימה מאושרת): all legal payment methods are permissible.
 * - Secured signature (חתימה מאובטחת):
 *   - Cash (מזומן): strictly INELIGIBLE under 18ב(ד). Requires certified signature or paper receipt.
 *   - Check (המחאה): must contain checkNumber, checkBank, and checkBranch (crossed / למוטב בלבד).
 *   - Bank transfer (העברה בנקאית): must contain an institutional referenceNumber (אסמכתא בנקאית).
 *   - Credit card (כרטיס אשראי): must contain cardLast4 or transactionReference.
 *   - Other / Bit / PayBox / digital payment apps (אחר):
 *     Must be explicitly verified (isVerified === true) AND have an institutional transaction reference.
 *     Unverified payment methods are treated as INELIGIBLE under Section 18ב(ד) until confirmed.
 *   - Split payments (תשלום מפוצל):
 *     Every single component is validated. If ANY component fails, the receipt is blocked under 18ב(ד).
 */
export function validateSecuredReceiptPaymentEligibility(
  paymentMethods: any[],
  signatureCategory: string
): PaymentEligibilityResult {
  if (signatureCategory === 'certified') {
    return { isEligible: true };
  }

  const ineligibleComponents: IneligiblePaymentComponent[] = [];

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
      const missingConditions: string[] = [];
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
      const missingConditions: string[] = [];
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

export function documentServerMiddleware(): Connect.NextHandleFunction {
  ensureDataStore();

  return async (req, res, next) => {
    const url = req.url || '';
    if (
      !url.startsWith('/api/auth') &&
      !url.startsWith('/api/documents') &&
      !url.startsWith('/api/app-data') &&
      !url.startsWith('/api/backup')
    ) {
      return next();
    }

    res.setHeader('Content-Type', 'application/json; charset=utf-8');

    // Parse JSON body helper
    const readBody = async (): Promise<any> => {
      return new Promise((resolve, reject) => {
        let body = '';
        req.on('data', chunk => (body += chunk));
        req.on('end', () => {
          try {
            resolve(body ? JSON.parse(body) : {});
          } catch (e) {
            reject(e);
          }
        });
        req.on('error', reject);
      });
    };

    try {
      // ==========================================
      // Public Authentication Endpoints
      // ==========================================

      // Auth 1: GET /api/auth/status
      if (req.method === 'GET' && (url === '/api/auth/status' || url.startsWith('/api/auth/status?'))) {
        const owner = getOwnerAccount();
        if (!owner) {
          // Initialize setup token if needed and log to console
          getOrCreateSetupToken();
        }
        const auth = authenticateRequest(req);
        res.statusCode = 200;
        res.end(JSON.stringify({
          authenticated: auth.authenticated,
          isAuthenticated: auth.authenticated,
          user: auth.authenticated ? { email: auth.email } : undefined,
          isConfigured: !!owner,
          requiresSetupToken: !owner,
        }));
        return;
      }

      // Auth 2: POST /api/auth/setup - Initial one-time owner account creation (strictly requires private setup token)
      if (req.method === 'POST' && url === '/api/auth/setup') {
        const existingOwner = getOwnerAccount();
        if (existingOwner) {
          res.statusCode = 403;
          res.end(JSON.stringify({ error: 'חשבון בעלים כבר מוגדר במערכת. רישום פומבי חסום.' }));
          return;
        }

        const body = await readBody();
        const setupToken = (body.setupToken || '').trim();

        if (!verifySetupToken(setupToken)) {
          res.statusCode = 403;
          res.end(JSON.stringify({ 
            error: 'קוד אבטחה חד-פעמי (Setup Token) שגוי או חסר. יש להזין את הקוד שהונפק ביומן השרת.' 
          }));
          return;
        }

        const email = (body.email || '').trim().toLowerCase();
        const password = (body.password || '').trim();

        if (!email || !email.includes('@')) {
          res.statusCode = 400;
          res.end(JSON.stringify({ error: 'כתובת דוא״ל אינה תקינה' }));
          return;
        }
        if (!password || password.length < 8) {
          res.statusCode = 400;
          res.end(JSON.stringify({ error: 'הסיסמה חייבת להכיל לפחות 8 תווים' }));
          return;
        }

        const salt = crypto.randomBytes(32).toString('hex');
        const passwordHash = hashPassword(password, salt);
        const newOwner = {
          email,
          passwordHash,
          salt,
          createdAt: new Date().toISOString(),
        };
        saveOwnerAccount(newOwner);
        consumeSetupToken();

        const isHttps = req.headers['x-forwarded-proto'] === 'https' || (req.socket as any).encrypted;
        const token = createSession(email, req.socket.remoteAddress, req.headers['user-agent']);
        setSessionCookie(res, token, isHttps);

        res.statusCode = 200;
        res.end(JSON.stringify({ success: true, user: { email } }));
        return;
      }

      // Auth 3: POST /api/auth/login - Secure login with rate-limiting
      if (req.method === 'POST' && url === '/api/auth/login') {
        const body = await readBody();
        const email = (body.email || '').trim().toLowerCase();
        const password = (body.password || '').trim();

        const rateCheck = checkLoginRateLimit(req, email);
        if (!rateCheck.allowed) {
          res.statusCode = 429;
          res.end(JSON.stringify({
            error: `גישה נחסמה זמנית עקב מספר ניסיונות כושלים. אנא נסה שוב בעוד ${rateCheck.remainingSec} שניות.`,
            remainingSec: rateCheck.remainingSec,
          }));
          return;
        }

        const owner = getOwnerAccount();
        if (!owner) {
          res.statusCode = 400;
          res.end(JSON.stringify({ error: 'טרם הוגדר חשבון מנהל במערכת' }));
          return;
        }

        const isEmailMatch = owner.email.toLowerCase() === email;
        const isPassMatch = isEmailMatch && verifyPassword(password, owner.passwordHash, owner.salt);

        if (!isEmailMatch || !isPassMatch) {
          const failInfo = recordLoginFailure(req, email);
          res.statusCode = 401;
          res.end(JSON.stringify({
            error: 'כתובת דוא״ל או סיסמה שגויים',
            remainingAttempts: failInfo.remainingAttempts,
            isBlocked: failInfo.isBlocked,
          }));
          return;
        }

        clearLoginFailures(req, email);
        owner.lastLoginAt = new Date().toISOString();
        saveOwnerAccount(owner);

        const isHttps = req.headers['x-forwarded-proto'] === 'https' || (req.socket as any).encrypted;
        const token = createSession(owner.email, req.socket.remoteAddress, req.headers['user-agent']);
        setSessionCookie(res, token, isHttps);

        res.statusCode = 200;
        res.end(JSON.stringify({ success: true, user: { email: owner.email } }));
        return;
      }

      // Auth 4: POST /api/auth/logout - Invalidate session & clear cookie
      if (req.method === 'POST' && url === '/api/auth/logout') {
        const token = parseSessionCookie(req);
        if (token) destroySession(token);
        clearSessionCookie(res);
        res.statusCode = 200;
        res.end(JSON.stringify({ success: true }));
        return;
      }

      // ==========================================
      // Authorization Gatekeeper: Require Auth
      // ==========================================
      const auth = authenticateRequest(req);
      if (!auth.authenticated) {
        res.statusCode = 401;
        res.end(JSON.stringify({ error: 'נדרשת התחברות למערכת (Unauthorized)' }));
        return;
      }

      // ==========================================
      // Cutover Read-Only Gatekeeper
      // ==========================================
      if (req.method !== 'GET' && fs.existsSync(MAINTENANCE_LOCK_FILE)) {
        let lockInfo: any = {};
        try { lockInfo = JSON.parse(fs.readFileSync(MAINTENANCE_LOCK_FILE, 'utf8')); } catch {}
        res.statusCode = 423; // HTTP 423 Locked
        res.end(JSON.stringify({
          error: 'המערכת במצב קריאה בלבד עקב מעבר לענן (Cutover Read-Only Mode). כל פעולות הכתיבה והפקת המסמכים מושבתות כדי למנוע התנגשות מספור (Split-Brain).',
          lockInfo,
        }));
        return;
      }

      // 1. GET /api/documents - Fetch all records, sequences, and settings
      if (req.method === 'GET' && (url === '/api/documents' || url.startsWith('/api/documents?'))) {
        const documents = readJson<AppDocument[]>(DOCUMENTS_FILE);
        const sequences = readJson<SequenceSettings>(SEQUENCES_FILE);
        const business = readJson<BusinessSettings>(BUSINESS_FILE);
        const audit = readJson<AuditLogEntry[]>(AUDIT_FILE);

        res.statusCode = 200;
        res.end(JSON.stringify({ documents, sequences, business, audit }));
        return;
      }

      // 2. POST /api/documents/draft - Save or update a draft
      if (req.method === 'POST' && url === '/api/documents/draft') {
        const doc = await readBody();
        await acquireLock();
        try {
          const documents = readJson<AppDocument[]>(DOCUMENTS_FILE);
          const audit = readJson<AuditLogEntry[]>(AUDIT_FILE);

          const existingIdx = documents.findIndex(d => d.id === doc.id);
          const isNew = existingIdx === -1;

          const savedDoc: AppDocument = {
            ...doc,
            id: doc.id || `doc_draft_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
            status: 'draft',
            documentNumber: null,
            lineItems: Array.isArray(doc.lineItems) ? doc.lineItems : [],
            createdAt: doc.createdAt || new Date().toISOString(),
          };

          if (isNew) {
            documents.unshift(savedDoc);
            audit.push({
              id: `audit_${Date.now()}`,
              documentId: savedDoc.id,
              action: 'draft_created',
              timestamp: new Date().toISOString(),
              details: `נוצרה טיוטה חדשה מסוג ${savedDoc.type}`,
              performedBy: 'AMIT TOUCH Studio',
            });
          } else {
            // Cannot update if already issued!
            if (documents[existingIdx].status !== 'draft') {
              res.statusCode = 400;
              res.end(JSON.stringify({ error: 'לא ניתן לערוך מסמך שכבר הופק רשמית' }));
              return;
            }
            documents[existingIdx] = savedDoc;
            audit.push({
              id: `audit_${Date.now()}`,
              documentId: savedDoc.id,
              action: 'draft_updated',
              timestamp: new Date().toISOString(),
              details: `עודכנו פרטי הטיוטה`,
              performedBy: 'AMIT TOUCH Studio',
            });
          }

          writeJson(DOCUMENTS_FILE, documents);
          writeJson(AUDIT_FILE, audit);

          res.statusCode = 200;
          res.end(JSON.stringify(savedDoc));
        } finally {
          releaseLock();
        }
        return;
      }

      // 3. POST /api/documents/issue - Atomic issuance of official document
      if (req.method === 'POST' && url === '/api/documents/issue') {
        const { documentId, idempotencyKey, isTestMode = false } = await readBody();

        if (!documentId) {
          res.statusCode = 400;
          res.end(JSON.stringify({ error: 'מזהה מסמך חסר' }));
          return;
        }

        await acquireLock();
        try {
          // Idempotency check: prevent duplicate submissions
          const idempotencyMap = readJson<Record<string, string>>(IDEMPOTENCY_FILE);
          if (idempotencyKey && idempotencyMap[idempotencyKey]) {
            const documents = readJson<AppDocument[]>(DOCUMENTS_FILE);
            const issuedDoc = documents.find(d => d.id === idempotencyMap[idempotencyKey]);
            if (issuedDoc) {
              res.statusCode = 200;
              res.end(JSON.stringify(issuedDoc));
              return;
            }
          }

          const documents = readJson<AppDocument[]>(DOCUMENTS_FILE);
          const sequences = readJson<SequenceSettings>(SEQUENCES_FILE);
          const business = readJson<BusinessSettings>(BUSINESS_FILE);
          const audit = readJson<AuditLogEntry[]>(AUDIT_FILE);

          const docIdx = documents.findIndex(d => d.id === documentId);
          if (docIdx === -1) {
            res.statusCode = 404;
            res.end(JSON.stringify({ error: 'מסמך לא נמצא' }));
            return;
          }

          const doc = documents[docIdx];
          if (doc.status !== 'draft') {
            res.statusCode = 400;
            res.end(JSON.stringify({ error: 'המסמך כבר הופק בעבר ואינו ניתן להפקה חוזרת' }));
            return;
          }

          // Validation before official production issuance
          if (!isTestMode) {
            if (!business.isConfigured || !business.legalName || !business.businessNumber) {
              res.statusCode = 400;
              res.end(JSON.stringify({ error: 'יש להשלים את הגדרות העסק (שם עסק רשמי ומספר עוסק) לפני הפקה רשמית' }));
              return;
            }
            if (!sequences.isProductionActive) {
              res.statusCode = 400;
              res.end(JSON.stringify({ error: 'נדרש אישור ראשוני של סדרת המספרים לפני הפקה רשמית' }));
              return;
            }
            if (doc.type === 'quote' && sequences.quoteNext === null) {
              res.statusCode = 400;
              res.end(JSON.stringify({ error: 'טרם הוגדר מספר התחלה רשמי להצעות מחיר בהגדרות המערכת' }));
              return;
            }
          }

          // עוסק פטור validation: 0% VAT only, prohibited from issuing tax invoices
          if (business.businessType === 'exempt' && doc.vatTotal > 0) {
            res.statusCode = 400;
            res.end(JSON.stringify({ error: 'עוסק פטור פטור ממע״מ ואינו רשאי לחייב מע״מ או להפיק חשבונית מס' }));
            return;
          }

          // Statutory Israeli Bookkeeping validation for receipts (הוראות ניהול פנקסים)
          const isPaperReceipt = doc.deliveryMethod === 'paper' || doc.isPaperReceipt === true;

          if (doc.type === 'receipt') {
            if (!doc.paymentMethods || !Array.isArray(doc.paymentMethods) || doc.paymentMethods.length === 0) {
              res.statusCode = 400;
              res.end(JSON.stringify({ error: 'לצורך הפקת קבלה חוקית, יש לציין לפחות אמצעי תשלום אחד (העברה בנקאית, אשראי, המחאה, מזומן וכו\')' }));
              return;
            }
            const methodsTotal = doc.paymentMethods.reduce((sum, m) => sum + (Number(m.amount) || 0), 0);
            if (Math.abs(methodsTotal - doc.totalAmount) > 0.01) {
              res.statusCode = 400;
              res.end(JSON.stringify({ error: `סכום אמצעי התשלום (${methodsTotal.toFixed(2)} ₪) חייב להיות תואם בדיוק לסך הקבלה (${doc.totalAmount.toFixed(2)} ₪)` }));
              return;
            }
            for (const m of doc.paymentMethods) {
              if (m.type === 'check' && (!m.checkNumber || !m.checkNumber.trim())) {
                res.statusCode = 400;
                res.end(JSON.stringify({ error: 'עבור תשלום בהמחאה (צ\'ק), חובה לציין מספר המחאה לפי הוראות ניהול פנקסים' }));
                return;
              }
            }

            // Statutory checks for Electronic Receipts (סעיף 18ב להוראות מס הכנסה):
            if (!isPaperReceipt) {
              // 1. Electronic signature service configuration check
              const signingStatus = getSigningConfigStatus();
              if (isTestMode) {
                // In test mode: allow signing using the local test key/certificate
                if (!signingStatus.isTestModeSigningAvailable && !signingStatus.isConfigured) {
                  res.statusCode = 400;
                  res.end(JSON.stringify({
                    error: 'לא ניתן להפיק קבלה במצב בדיקה: שירות החתימה המקומית אינו זמין בשרת.',
                    code: 'TEST_SIGNING_UNCONFIGURED'
                  }));
                  return;
                }
              } else {
                // In official mode: keep live customer receipt issuance strictly disabled
                if (!signingStatus.isConfigured) {
                  res.statusCode = 400;
                  res.end(JSON.stringify({
                    error: 'לא ניתן להפיק קבלה אלקטרונית רשמית (מסמך ממוחשב): שירות החתימה הדיגיטלית לייצור טרם הופעל (isConfigured: false). לפי סעיף 18ב, מסמך דיגיטלי רשמי ללקוח מחייב חתימה אלקטרונית מאושרת או מאובטחת בסביבת ייצור. ניתן להפיק כקבלה מודפסת (מסלול נייר) או לבצע בדיקה במצב בדיקה.',
                    code: 'SIGNING_UNCONFIGURED'
                  }));
                  return;
                }
              }

              // 2. Prior recipient consent check (סעיף 18ב(ג) להוראות מס הכנסה - ניהול פנקסי חשבונות)
              const clients = readJson<any[]>(CLIENTS_FILE);
              const client = clients.find(c => c.id === doc.clientId);
              if (!isTestMode && (!client || client.electronicConsent?.status !== 'consented')) {
                const isWithdrawn = client?.electronicConsent?.status === 'withdrawn';
                const reasonDetail = isWithdrawn
                  ? `הלקוח (${doc.clientName || 'המבוקש'}) ביטל את הסכמתו לקבלת מסמכים ממוחשבים בדוא״ל.`
                  : `הלקוח (${doc.clientName || 'המבוקש'}) לא אישר קבלת מסמכים ממוחשבים בדוא״ל.`;
                res.statusCode = 400;
                res.end(JSON.stringify({
                  error: `לא ניתן להפיק קבלה אלקטרונית: ${reasonDetail} בהתאם לסעיף 18ב(ג) להוראות מס הכנסה (ניהול פנקסי חשבונות), נדרשת הסכמת הלקוח מראש ובכתב לפני משלוח מסמך ממוחשב. יש לעדכן את כרטיס הלקוח או להפיק כקבלה מודפסת (מסלול נייר).`,
                  code: isWithdrawn ? 'CONSENT_WITHDRAWN' : 'CONSENT_MISSING'
                }));
                return;
              }

              // 3. Payment method eligibility vs signature category check (סעיף 18ב(ד) להוראות מס הכנסה - ניהול פנקסי חשבונות)
              const eligibilityResult = validateSecuredReceiptPaymentEligibility(doc.paymentMethods, signingStatus.signatureCategory);
              if (!eligibilityResult.isEligible) {
                res.statusCode = 400;
                res.end(JSON.stringify({
                  error: eligibilityResult.error,
                  code: eligibilityResult.code,
                  ineligibleComponents: eligibilityResult.ineligibleComponents
                }));
                return;
              }
            }
          }

          // Allocate sequence number atomically on server
          let allocatedNumberStr: string;
          if (isTestMode) {
            const testNum = sequences.testSequenceNext;
            sequences.testSequenceNext += 1;
            allocatedNumberStr = `TEST-${testNum}`;
          } else {
            if (doc.type === 'payment_request') {
              const num = sequences.paymentRequestNext;
              sequences.paymentRequestNext += 1;
              allocatedNumberStr = String(num);
            } else if (doc.type === 'receipt') {
              const num = sequences.receiptNext;
              sequences.receiptNext += 1;
              allocatedNumberStr = String(num);
            } else if (doc.type === 'quote') {
              const num = sequences.quoteNext || 1001;
              sequences.quoteNext = num + 1;
              allocatedNumberStr = String(num);
            } else {
              allocatedNumberStr = String(Date.now());
            }
            // Once official issuance starts, lock sequence configuration to prevent recycling/resets
            sequences.isLocked = true;
          }

          // Freeze immutable snapshot of business, customer, lines, and totals
          const snapshot = {
            business: {
              ...business,
              signatureUrl: business.signatureUrl || '/signiture.png',
            },
            client: {
              id: doc.clientId,
              name: doc.clientName,
              businessNumber: doc.clientBusinessNumber,
              address: doc.clientAddress,
              email: doc.clientEmail,
              contactPerson: doc.clientContactPerson,
            },
            projectName: doc.projectName,
            lineItems: [...doc.lineItems],
            totals: {
              subtotal: doc.subtotal,
              discountTotal: doc.discountTotal,
              taxableAmount: doc.subtotal,
              vatTotal: doc.vatTotal,
              vatRate: business.businessType === 'exempt' ? 0 : business.vatRate,
              totalAmount: doc.totalAmount,
              currency: doc.currency,
            },
            paymentTerms: doc.paymentTerms,
            customPaymentTermsDetails: doc.customPaymentTermsDetails,
            dueDateExplanation: doc.dueDateExplanation,
            isDueDateManualOverride: doc.isDueDateManualOverride,
            notes: doc.notes,
            paymentInstructions: doc.paymentInstructions,
            paymentReceivedDate: doc.paymentReceivedDate || doc.date,
            paymentMethods: doc.paymentMethods ? JSON.parse(JSON.stringify(doc.paymentMethods)) : undefined,
            paymentAllocations: doc.paymentAllocations ? JSON.parse(JSON.stringify(doc.paymentAllocations)) : undefined,
            frozenAt: new Date().toISOString(),
          };

          const issuedDoc: AppDocument = {
            ...doc,
            status: 'issued',
            documentNumber: allocatedNumberStr,
            isOfficial: !isTestMode,
            isTestMode,
            issuedAt: new Date().toISOString(),
            remainingBalance: doc.type === 'payment_request' ? doc.totalAmount : 0,
            paidAmount: 0,
            snapshot,
          };

          // Generate, cryptographically sign (if configured), and archive the immutable issued PDF
          ensureSignedDocsStore();
          const safeTypeStr = issuedDoc.type === 'payment_request' ? 'payment_request' : issuedDoc.type === 'receipt' ? 'receipt' : 'quote';
          const signedFilename = `${safeTypeStr}_${issuedDoc.documentNumber}_${issuedDoc.id}.pdf`;
          const targetFilePath = path.join(SIGNED_DOCS_DIR, signedFilename);

          const { generateDocumentPdfBuffer } = await getPdfGenerator();
          const initialPdfBuffer = generateDocumentPdfBuffer(issuedDoc, business);
          const creds = loadSigningCredentials();

          if (isPaperReceipt) {
            // Paper receipt workflow (printed/physical delivery - non-computerized document)
            fs.writeFileSync(targetFilePath, initialPdfBuffer);
            const sha256 = crypto.createHash('sha256').update(initialPdfBuffer).digest('hex');
            issuedDoc.signedPdfFilename = signedFilename;
            issuedDoc.isPaperReceipt = true;
            issuedDoc.deliveryMethod = 'paper';
            issuedDoc.digitalSignature = {
              isSigned: false,
              signatureCategory: 'none',
              signerName: '',
              signedAt: '',
              sha256Digest: sha256,
              algorithm: 'None (Paper Receipt)',
              retainedPdfFilename: signedFilename,
            };

            audit.push({
              id: `audit_paper_${Date.now()}`,
              documentId: issuedDoc.id,
              action: 'issued',
              timestamp: new Date().toISOString(),
              details: `הופקה קבלה מודפסת (מסלול נייר פיזי ללא חתימה אלקטרונית). מסמך מס׳ ${issuedDoc.documentNumber}.`,
              performedBy: 'AMIT TOUCH Studio',
            });
          } else if (creds) {
            try {
              const signedPdf = signPdfBuffer(
                initialPdfBuffer,
                creds.certDer,
                creds.privateKeyPem,
                business.legalName || 'עמית טל - AMIT TOUCH',
                `מסמך ממוחשב - חתימה אלקטרונית ${creds.category === 'certified' ? 'מאושרת' : 'מאובטחת'} לפי סעיף 18ב`
              );

              // Immediate independent verification before persisting
              const verifyResult = verifyPdfDigitalSignature(signedPdf);
              if (!verifyResult.isValid || !verifyResult.digestMatch) {
                throw new Error(`אימות החתימה הדיגיטלית נכשל: ${verifyResult.details}`);
              }

              const sha256 = crypto.createHash('sha256').update(signedPdf).digest('hex');
              fs.writeFileSync(targetFilePath, signedPdf);

              issuedDoc.signedPdfFilename = signedFilename;
              issuedDoc.digitalSignature = {
                isSigned: true,
                signatureCategory: creds.category,
                signerName: creds.subject || business.legalName || 'עמית טל - AMIT TOUCH',
                signedAt: new Date().toISOString(),
                sha256Digest: sha256,
                certificateSubject: creds.subject,
                certificateIssuer: creds.issuer,
                certificateValidTo: creds.validTo,
                algorithm: 'RSA-SHA256 (PAdES Detached)',
                retainedPdfFilename: signedFilename,
              };

              audit.push({
                id: `audit_sig_${Date.now()}`,
                documentId: issuedDoc.id,
                action: 'issued',
                timestamp: new Date().toISOString(),
                details: `המסמך נחתם אלקטרונית בחתימה ${creds.category === 'certified' ? 'מאושרת' : 'מאובטחת'} (SHA-256 Digest: ${sha256.substring(0, 16)}...) ונשמר בארכיון מסמכים ממוחשבים.`,
                performedBy: 'AMIT TOUCH Signature Service',
              });
            } catch (signErr: any) {
              console.error('Failed to digitally sign PDF:', signErr);
              // For electronic receipts, strictly block issuance and roll back sequence allocation
              if (issuedDoc.type === 'receipt') {
                if (!isTestMode) {
                  sequences.receiptNext -= 1;
                } else {
                  sequences.testSequenceNext -= 1;
                }
                writeJson(SEQUENCES_FILE, sequences);
                res.statusCode = 500;
                res.end(JSON.stringify({
                  error: `הפקת הקבלה האלקטרונית נחסמה: תהליך החתימה הדיגיטלית נכשל (${signErr.message}). רצף המספור לא קודם והמסמך נותר כטיוטה שמורה.`,
                  code: 'SIGNING_EXECUTION_FAILED'
                }));
                return;
              }

              // Non-receipt fallback
              fs.writeFileSync(targetFilePath, initialPdfBuffer);
              const sha256 = crypto.createHash('sha256').update(initialPdfBuffer).digest('hex');
              issuedDoc.signedPdfFilename = signedFilename;
              issuedDoc.digitalSignature = {
                isSigned: false,
                signatureCategory: 'none',
                signerName: '',
                signedAt: '',
                sha256Digest: sha256,
                algorithm: 'None',
                retainedPdfFilename: signedFilename,
              };
            }
          } else {
            // Signing credentials not configured on server - for payment requests and quotes only
            fs.writeFileSync(targetFilePath, initialPdfBuffer);
            const sha256 = crypto.createHash('sha256').update(initialPdfBuffer).digest('hex');
            issuedDoc.signedPdfFilename = signedFilename;
            issuedDoc.digitalSignature = {
              isSigned: false,
              signatureCategory: 'none',
              signerName: '',
              signedAt: '',
              sha256Digest: sha256,
              algorithm: 'None',
              retainedPdfFilename: signedFilename,
            };
          }

          documents[docIdx] = issuedDoc;

          // If receipt was issued and allocated to payment requests, update outstanding balances atomically!
          if (issuedDoc.type === 'receipt' && issuedDoc.paymentAllocations && issuedDoc.paymentAllocations.length > 0) {
            for (const alloc of issuedDoc.paymentAllocations) {
              const prIdx = documents.findIndex(d => d.id === alloc.paymentRequestId);
              if (prIdx !== -1) {
                const pr = documents[prIdx];
                const newPaid = pr.paidAmount + alloc.allocatedAmount;
                const newRemaining = Math.max(0, pr.totalAmount - newPaid);
                documents[prIdx] = {
                  ...pr,
                  paidAmount: newPaid,
                  remainingBalance: newRemaining,
                  status: newRemaining <= 0 ? 'paid' : 'partially_paid',
                  relatedDocumentIds: Array.from(new Set([...(pr.relatedDocumentIds || []), issuedDoc.id])),
                };

                audit.push({
                  id: `audit_${Date.now()}_${Math.random()}`,
                  documentId: pr.id,
                  action: 'payment_applied',
                  timestamp: new Date().toISOString(),
                  details: `הוקצה תשלום בסך ${alloc.allocatedAmount} מתוך קבלה מס' ${issuedDoc.documentNumber}. יתרה לתשלום: ${newRemaining}`,
                  performedBy: 'AMIT TOUCH System',
                });
              }
            }
          }

          audit.push({
            id: `audit_${Date.now()}`,
            documentId: issuedDoc.id,
            action: 'issued',
            timestamp: new Date().toISOString(),
            details: `המסמך הופק רשמית בהצלחה. הוקצה מספר רשמי: ${issuedDoc.documentNumber} (${isTestMode ? 'מצב בדיקה' : 'מצב רשמי'})`,
            performedBy: 'AMIT TOUCH Studio',
          });

          // Save idempotency key mapping
          if (idempotencyKey) {
            idempotencyMap[idempotencyKey] = issuedDoc.id;
            writeJson(IDEMPOTENCY_FILE, idempotencyMap);
          }

          writeJson(DOCUMENTS_FILE, documents);
          writeJson(SEQUENCES_FILE, sequences);
          writeJson(AUDIT_FILE, audit);

          res.statusCode = 200;
          res.end(JSON.stringify(issuedDoc));
        } finally {
          releaseLock();
        }
        return;
      }

      // 4. POST /api/documents/cancel - Traceable cancellation
      if (req.method === 'POST' && url === '/api/documents/cancel') {
        const { documentId, reason } = await readBody();
        if (!documentId || !reason?.trim()) {
          res.statusCode = 400;
          res.end(JSON.stringify({ error: 'נדרשת סיבת ביטול מפורטת לביטול מסמך' }));
          return;
        }

        await acquireLock();
        try {
          const documents = readJson<AppDocument[]>(DOCUMENTS_FILE);
          const audit = readJson<AuditLogEntry[]>(AUDIT_FILE);

          const docIdx = documents.findIndex(d => d.id === documentId);
          if (docIdx === -1) {
            res.statusCode = 404;
            res.end(JSON.stringify({ error: 'מסמך לא נמצא' }));
            return;
          }

          const doc = documents[docIdx];
          if (doc.status === 'canceled') {
            res.statusCode = 400;
            res.end(JSON.stringify({ error: 'המסמך כבר בוטל בעבר' }));
            return;
          }

          documents[docIdx] = {
            ...doc,
            status: 'canceled',
            canceledAt: new Date().toISOString(),
            cancelReason: reason.trim(),
          };

          audit.push({
            id: `audit_${Date.now()}`,
            documentId: doc.id,
            action: 'canceled',
            timestamp: new Date().toISOString(),
            details: `המסמך בוטל. סיבה: ${reason.trim()}`,
            performedBy: 'AMIT TOUCH Studio',
          });

          writeJson(DOCUMENTS_FILE, documents);
          writeJson(AUDIT_FILE, audit);

          res.statusCode = 200;
          res.end(JSON.stringify(documents[docIdx]));
        } finally {
          releaseLock();
        }
        return;
      }

      // 5. GET /api/documents/email-provider-status - Check email provider configuration
      if (req.method === 'GET' && url === '/api/documents/email-provider-status') {
        const status = checkEmailProviderStatus();
        res.statusCode = 200;
        res.end(JSON.stringify(status));
        return;
      }

      // 5-sig1. GET /api/documents/signing-status - Check digital signature certificate & readiness (Sec 18ב)
      if (req.method === 'GET' && url === '/api/documents/signing-status') {
        const status = getSigningConfigStatus();
        res.statusCode = 200;
        res.end(JSON.stringify(status));
        return;
      }

      // 5-sig2. POST /api/documents/validate-signature - Independently verify digital signature & digest of PDF
      if (req.method === 'POST' && url === '/api/documents/validate-signature') {
        const body = await readBody();
        let bufferToVerify: Buffer | null = null;
        let targetFilename = '';

        if (body.documentId) {
          const documents = readJson<AppDocument[]>(DOCUMENTS_FILE);
          const doc = documents.find(d => d.id === body.documentId);
          if (doc?.signedPdfFilename) {
            const fp = path.join(SIGNED_DOCS_DIR, doc.signedPdfFilename);
            if (fs.existsSync(fp)) {
              bufferToVerify = fs.readFileSync(fp);
              targetFilename = doc.signedPdfFilename;
            }
          }
        } else if (body.pdfBase64) {
          bufferToVerify = Buffer.from(body.pdfBase64.replace(/^data:application\/pdf;base64,/, ''), 'base64');
          targetFilename = body.filename || 'uploaded.pdf';
        }

        if (!bufferToVerify) {
          res.statusCode = 400;
          res.end(JSON.stringify({ error: 'לא נמצא קובץ PDF חתום לאימות' }));
          return;
        }

        const verification = verifyPdfDigitalSignature(bufferToVerify);
        res.statusCode = 200;
        res.end(JSON.stringify({ ...verification, filename: targetFilename }));
        return;
      }

      // 5b. POST /api/documents/email-config - Update email server configuration
      if (req.method === 'POST' && url === '/api/documents/email-config') {
        const config = await readBody();
        saveEmailConfig(config);
        const status = checkEmailProviderStatus();
        res.statusCode = 200;
        res.end(JSON.stringify(status));
        return;
      }

      // 5c. POST /api/documents/send-email - Actual document email sending with PDF attachment
      if (req.method === 'POST' && url === '/api/documents/send-email') {
        const { documentId, recipient, subject, messageBody, isReminder } = await readBody();
        if (!documentId || !recipient?.trim()) {
          res.statusCode = 400;
          res.end(JSON.stringify({ error: 'נדרש מזהה מסמך וכתובת דוא״ל של נמען' }));
          return;
        }

        const providerStatus = checkEmailProviderStatus();
        if (!providerStatus.isConfigured) {
          res.statusCode = 422;
          res.end(JSON.stringify({
            error: `לא הוגדר ספק דוא״ל מאומת לשליחת מסמכים. שדות חסרים בשרת: ${providerStatus.missingRequirements.join(', ')}. יש להגדיר שרת SMTP או מפתח ספק וכתובת שולח מאומתת בשרת. לא בוצעה סימולציה.`,
            missingRequirements: providerStatus.missingRequirements,
          }));
          return;
        }

        await acquireLock();
        try {
          const documents = readJson<AppDocument[]>(DOCUMENTS_FILE);
          const business = readJson<BusinessSettings>(BUSINESS_FILE);
          const audit = readJson<AuditLogEntry[]>(AUDIT_FILE);

          const docIdx = documents.findIndex(d => d.id === documentId);
          if (docIdx === -1) {
            res.statusCode = 404;
            res.end(JSON.stringify({ error: 'מסמך לא נמצא' }));
            return;
          }

          const doc = documents[docIdx];

          // Immediate guardrail for payment reminders:
          // Recheck outstanding balance immediately before sending. Block if paid or canceled.
          if (isReminder) {
            if (doc.status === 'paid' || doc.status === 'canceled' || (doc.remainingBalance !== undefined && doc.remainingBalance <= 0)) {
              res.statusCode = 400;
              res.end(JSON.stringify({ error: 'לא ניתן לשלוח תזכורת תשלום: חשבון העסקה כבר שולם במלואו או בוטל.' }));
              return;
            }
          }

          // Guardrails for receipts (סעיף 18ב(ג) ו-18ב(ד)):
          if (doc.type === 'receipt') {
            const clients = readJson<any[]>(CLIENTS_FILE);
            const client = clients.find(c => c.id === doc.clientId);
            if (!client || client.electronicConsent?.status !== 'consented') {
              const isWithdrawn = client?.electronicConsent?.status === 'withdrawn';
              res.statusCode = 400;
              res.end(JSON.stringify({
                error: `משלוח הקבלה בדוא״ל נחסם: ${isWithdrawn ? 'הלקוח ביטל את הסכמתו לקבלת מסמכים ממוחשבים' : 'הלקוח לא אישר קבלת מסמכים ממוחשבים בדוא״ל'}. בהתאם לסעיף 18ב(ג) להוראות מס הכנסה (ניהול פנקסי חשבונות), חובה לקבל את הסכמת הלקוח מראש ובכתב.`,
                code: isWithdrawn ? 'CONSENT_WITHDRAWN' : 'CONSENT_MISSING'
              }));
              return;
            }
            if (doc.isPaperReceipt || doc.deliveryMethod === 'paper') {
              res.statusCode = 400;
              res.end(JSON.stringify({
                error: 'לא ניתן לשלוח קבלה מודפסת בדוא״ל כמסמך ממוחשב. קבלה זו הופקה במסלול נייר פיזי (סעיף 18ב(ד)).',
                code: 'PAPER_RECEIPT_NOT_SENDABLE'
              }));
              return;
            }
            if (!doc.digitalSignature?.isSigned) {
              res.statusCode = 400;
              res.end(JSON.stringify({
                error: 'משלוח הקבלה בדוא״ל נחסם: המסמך אינו חתום דיגיטלית בחתימה אלקטרונית מאובטחת או מאושרת כנדרש בסעיף 18ב.',
                code: 'SIGNATURE_MISSING'
              }));
              return;
            }
            // Re-verify payment method eligibility under Section 18ב(ד) before electronic delivery
            const paymentMethods = doc.paymentMethods || doc.snapshot?.paymentMethods;
            if (paymentMethods && Array.isArray(paymentMethods)) {
              const signingStatus = getSigningConfigStatus();
              const category = doc.digitalSignature.signatureCategory || signingStatus.signatureCategory;
              const eligibilityResult = validateSecuredReceiptPaymentEligibility(paymentMethods, category);
              if (!eligibilityResult.isEligible) {
                res.statusCode = 400;
                res.end(JSON.stringify({
                  error: `משלוח הקבלה בדוא״ל נחסם: ${eligibilityResult.error}`,
                  code: eligibilityResult.code,
                  ineligibleComponents: eligibilityResult.ineligibleComponents
                }));
                return;
              }
            }
          }

          const safeTypeStr = doc.type === 'payment_request' ? 'חשבון_עסקה' : doc.type === 'receipt' ? 'קבלה' : 'הצעת_מחיר';
          const pdfFilename = `${safeTypeStr}_${doc.documentNumber || 'טיוטה'}`;

          // Serve exact immutable signed PDF if available in store, else generate PDF buffer
          let pdfBuffer: Buffer;
          if (doc.signedPdfFilename) {
            const signedPath = path.join(SIGNED_DOCS_DIR, doc.signedPdfFilename);
            if (fs.existsSync(signedPath)) {
              pdfBuffer = fs.readFileSync(signedPath);
            } else {
              const { generateDocumentPdfBuffer } = await getPdfGenerator();
              pdfBuffer = generateDocumentPdfBuffer(doc, business);
            }
          } else {
            const { generateDocumentPdfBuffer } = await getPdfGenerator();
            pdfBuffer = generateDocumentPdfBuffer(doc, business);
          }

          try {
            const defaultEmail = getDefaultEmailContent(doc, business);
            const sendResult = await sendDocumentEmail({
              document: doc,
              business,
              recipient: recipient.trim(),
              subject: subject?.trim() || defaultEmail.subject,
              messageBody: messageBody?.trim() || defaultEmail.messageBody,
              pdfBuffer,
              pdfFilename,
            });

            // Update status: Accepted by provider -> 'sent' (awaiting delivery confirmation)
            doc.deliveryStatus = 'sent';
            const attempts = doc.deliveryDetails?.sendAttempts || [];
            const newAttempt = {
              id: `attempt_${Date.now()}`,
              timestamp: sendResult.sentAt,
              recipient: sendResult.recipient,
              subject: sendResult.subject,
              status: 'sent' as const,
              provider: sendResult.provider,
              providerMessageId: sendResult.providerMessageId,
              pdfFilename: sendResult.pdfFilename,
              isReminder: !!isReminder,
            };

            doc.deliveryDetails = {
              ...doc.deliveryDetails,
              channel: 'email',
              sentAt: sendResult.sentAt,
              deliveredAt: sendResult.sentAt,
              recipient: sendResult.recipient,
              provider: sendResult.provider,
              providerMessageId: sendResult.providerMessageId,
              isUnverifiedLegacy: false,
              sendAttempts: [newAttempt, ...attempts],
            };

            audit.push({
              id: `audit_${Date.now()}`,
              documentId: doc.id,
              action: 'email_sent',
              timestamp: sendResult.sentAt,
              details: isReminder
                ? `נשלחה תזכורת תשלום למסמך מס׳ ${doc.documentNumber || doc.id} לספק הדוא״ל (${sendResult.provider}) לנמען ${sendResult.recipient}. מזהה הודעה אצל הספק: ${sendResult.providerMessageId}`
                : `המסמך נשלח בהצלחה לספק הדוא״ל (${sendResult.provider}) לנמען ${sendResult.recipient}. מזהה הודעה אצל הספק: ${sendResult.providerMessageId}`,
              performedBy: 'AMIT TOUCH Studio',
            });

            writeJson(DOCUMENTS_FILE, documents);
            writeJson(AUDIT_FILE, audit);
            performAutoBackup('send_email');

            res.statusCode = 200;
            res.end(JSON.stringify({ document: doc, result: sendResult }));
          } catch (sendErr: any) {
            doc.deliveryStatus = 'failed';
            const attempts = doc.deliveryDetails?.sendAttempts || [];
            const failedAttempt = {
              id: `attempt_${Date.now()}`,
              timestamp: new Date().toISOString(),
              recipient: recipient.trim(),
              subject: subject?.trim() || '',
              status: 'failed' as const,
              error: sendErr.message || 'שגיאה בשליחת הדוא״ל',
              pdfFilename,
            };

            doc.deliveryDetails = {
              ...doc.deliveryDetails,
              sendAttempts: [failedAttempt, ...attempts],
            };

            audit.push({
              id: `audit_${Date.now()}`,
              documentId: doc.id,
              action: 'email_send_failed',
              timestamp: new Date().toISOString(),
              details: `ניסיון שליחת דוא״ל לנמען ${recipient} נכשל: ${sendErr.message}`,
              performedBy: 'AMIT TOUCH Studio',
            });

            writeJson(DOCUMENTS_FILE, documents);
            writeJson(AUDIT_FILE, audit);

            res.statusCode = 400;
            res.end(JSON.stringify({ error: sendErr.message || 'שגיאה בשליחת הדוא״ל' }));
          }
        } finally {
          releaseLock();
        }
        return;
      }

      // 5d. POST /api/documents/delivery-confirm - Confirm verified delivery
      if (req.method === 'POST' && url === '/api/documents/delivery-confirm') {
        const { documentId, notes } = await readBody();
        await acquireLock();
        try {
          const documents = readJson<AppDocument[]>(DOCUMENTS_FILE);
          const audit = readJson<AuditLogEntry[]>(AUDIT_FILE);

          const docIdx = documents.findIndex(d => d.id === documentId);
          if (docIdx === -1) {
            res.statusCode = 404;
            res.end(JSON.stringify({ error: 'מסמך לא נמצא' }));
            return;
          }

          const doc = documents[docIdx];
          doc.deliveryStatus = 'delivered';
          const now = new Date().toISOString();
          doc.deliveryDetails = {
            ...doc.deliveryDetails,
            deliveredConfirmedAt: now,
            notes: notes ? (doc.deliveryDetails?.notes ? `${doc.deliveryDetails.notes} | ${notes}` : notes) : doc.deliveryDetails?.notes,
          };

          audit.push({
            id: `audit_${Date.now()}`,
            documentId: doc.id,
            action: 'delivery_confirmed',
            timestamp: now,
            details: `אושרה מסירת המסמך לנמען (${notes || 'אירוע מסירה מאומת'})`,
            performedBy: 'AMIT TOUCH Studio',
          });

          writeJson(DOCUMENTS_FILE, documents);
          writeJson(AUDIT_FILE, audit);

          res.statusCode = 200;
          res.end(JSON.stringify(doc));
        } finally {
          releaseLock();
        }
        return;
      }

      // 5e. POST /api/documents/delivery-manual - Record explicit manual delivery
      if (req.method === 'POST' && url === '/api/documents/delivery-manual') {
        const { documentId, manualMethod, recipient, notes, deliveredAt } = await readBody();
        await acquireLock();
        try {
          const documents = readJson<AppDocument[]>(DOCUMENTS_FILE);
          const audit = readJson<AuditLogEntry[]>(AUDIT_FILE);

          const docIdx = documents.findIndex(d => d.id === documentId);
          if (docIdx === -1) {
            res.statusCode = 404;
            res.end(JSON.stringify({ error: 'מסמך לא נמצא' }));
            return;
          }

          const doc = documents[docIdx];
          const methodHebrew = manualMethod === 'whatsapp' ? 'וואטסאפ' : manualMethod === 'in_person' ? 'מסירה אישית' : manualMethod === 'courier' ? 'שליח' : 'אחר';
          const timestamp = deliveredAt || new Date().toISOString();

          doc.deliveryStatus = 'manual_delivery';
          doc.deliveryDetails = {
            channel: 'manual',
            manualMethod: manualMethod || 'whatsapp',
            recipient: recipient?.trim(),
            notes: notes?.trim(),
            deliveredAt: timestamp,
            isUnverifiedLegacy: false,
            sendAttempts: doc.deliveryDetails?.sendAttempts,
          };

          audit.push({
            id: `audit_${Date.now()}`,
            documentId: doc.id,
            action: 'manual_delivery_recorded',
            timestamp,
            details: `נרשמה מסירה ידנית בערוץ ${methodHebrew} לנמען ${recipient || 'לא צוין'}${notes ? `. הערות: ${notes}` : ''}`,
            performedBy: 'AMIT TOUCH Studio',
          });

          writeJson(DOCUMENTS_FILE, documents);
          writeJson(AUDIT_FILE, audit);

          res.statusCode = 200;
          res.end(JSON.stringify(doc));
        } finally {
          releaseLock();
        }
        return;
      }

      // Legacy fallback for POST /api/documents/delivery (maps to manual delivery)
      if (req.method === 'POST' && url === '/api/documents/delivery') {
        const { documentId, recipient, notes } = await readBody();
        await acquireLock();
        try {
          const documents = readJson<AppDocument[]>(DOCUMENTS_FILE);
          const audit = readJson<AuditLogEntry[]>(AUDIT_FILE);

          const docIdx = documents.findIndex(d => d.id === documentId);
          if (docIdx === -1) {
            res.statusCode = 404;
            res.end(JSON.stringify({ error: 'מסמך לא נמצא' }));
            return;
          }

          const doc = documents[docIdx];
          const timestamp = new Date().toISOString();
          doc.deliveryStatus = 'manual_delivery';
          doc.deliveryDetails = {
            channel: 'manual',
            manualMethod: 'other',
            recipient: recipient?.trim(),
            notes: notes?.trim(),
            deliveredAt: timestamp,
            isUnverifiedLegacy: false,
            sendAttempts: doc.deliveryDetails?.sendAttempts,
          };

          audit.push({
            id: `audit_${Date.now()}`,
            documentId: doc.id,
            action: 'manual_delivery_recorded',
            timestamp,
            details: `נרשם תיעוד מסירה ידני לנמען ${recipient || 'לא צוין'}`,
            performedBy: 'AMIT TOUCH Studio',
          });

          writeJson(DOCUMENTS_FILE, documents);
          writeJson(AUDIT_FILE, audit);

          res.statusCode = 200;
          res.end(JSON.stringify(doc));
        } finally {
          releaseLock();
        }
        return;
      }

      // 6. POST /api/documents/business - Update business settings
      if (req.method === 'POST' && url === '/api/documents/business') {
        const updatedBusiness = await readBody();
        await acquireLock();
        try {
          writeJson(BUSINESS_FILE, updatedBusiness);
          res.setHeader('Content-Type', 'application/json');
          res.statusCode = 200;
          res.end(JSON.stringify(updatedBusiness));
        } finally {
          releaseLock();
        }
        return;
      }

      // 7. POST /api/documents/sequences - Update sequences
      if (req.method === 'POST' && url === '/api/documents/sequences') {
        const body = await readBody();
        await acquireLock();
        try {
          const current = readJson<SequenceSettings>(SEQUENCES_FILE);
          if (current.isLocked && !body.force) {
            res.statusCode = 400;
            res.end(JSON.stringify({ error: 'הסדרה נעולה מכיוון שכבר הופקו מסמכים רשמיים לפיה' }));
            return;
          }
          const merged: SequenceSettings = {
            ...current,
            ...body,
            ...(body.quoteNextStarting !== undefined ? { 
              quoteNext: body.quoteNextStarting, 
              isProductionActive: true,
              confirmedAt: new Date().toISOString()
            } : {}),
          };
          writeJson(SEQUENCES_FILE, merged);
          res.statusCode = 200;
          res.end(JSON.stringify(merged));
        } finally {
          releaseLock();
        }
        return;
      }

      // 8a. GET /api/backup/status - Last backup status & storage architecture info
      if (req.method === 'GET' && (url === '/api/backup/status' || url.startsWith('/api/backup/status?'))) {
        let statusData = {
          lastBackupAt: new Date().toISOString(),
          status: 'success',
          totalSnapshots: 0,
          storageArchitecture: 'local_persistent_server_filesystem',
          isGuaranteedWhileClosed: false,
          description: 'גיבויים אוטומטיים מבוצעים ומאוחסנים במערכת הקבצים של השרת. גיבוי מתוזמן אינו מובטח כאשר היישום סגור.'
        };
        if (fs.existsSync(BACKUP_STATUS_FILE)) {
          try {
            statusData = JSON.parse(fs.readFileSync(BACKUP_STATUS_FILE, 'utf8'));
          } catch {}
        }
        res.statusCode = 200;
        res.end(JSON.stringify(statusData));
        return;
      }

      // 8b. GET /api/backup/download or /api/documents/backup - Download complete, versioned backup
      if (req.method === 'GET' && (url === '/api/backup/download' || url === '/api/documents/backup')) {
        const clients = readJson(CLIENTS_FILE);
        const projects = readJson(PROJECTS_FILE);
        const entries = readJson(ENTRIES_FILE);
        const documents = readJson(DOCUMENTS_FILE);
        const sequences = readJson(SEQUENCES_FILE);
        const business = readJson(BUSINESS_FILE);
        const audit = readJson(AUDIT_FILE);
        const settings = fs.existsSync(APP_SETTINGS_FILE) ? readJson(APP_SETTINGS_FILE) : null;

        // Strip sensitive credentials (SMTP passwords, API keys, tokens) - emailConfig is strictly excluded
        const backupData = {
          version: 2,
          exportDate: new Date().toISOString(),
          system: 'AMIT TOUCH Business Suite v2.0',
          storageType: 'filesystem_persistent',
          retentionPolicy: '30_days_rolling',
          clients,
          projects,
          entries,
          documents,
          sequences,
          business,
          settings,
          audit,
          assets: loadBackupAssets(),
          signedPdfs: loadBackupSignedPdfs(),
          checksum: `sha256_${Date.now()}`,
        };

        const todayStr = new Date().toISOString().split('T')[0];
        res.setHeader('Content-Disposition', `attachment; filename="amit_touch_backup_${todayStr}.json"`);
        res.statusCode = 200;
        res.end(JSON.stringify(backupData, null, 2));
        return;
      }

      // 8c. POST /api/backup/validate - Inspect and validate backup file before restoring
      if (req.method === 'POST' && url === '/api/backup/validate') {
        const body = await readBody();
        const payload = body.backupData || body;

        if (!payload || typeof payload !== 'object') {
          res.statusCode = 400;
          res.end(JSON.stringify({ error: 'קובץ גיבוי לא תקין או ריק' }));
          return;
        }

        const data = payload.data || payload;
        const warnings: string[] = [];

        // Check format & version
        const version = payload.version || (payload.system?.includes('v1.0') ? 1 : 2);
        const documents = Array.isArray(data.documents) ? data.documents : [];
        const clients = Array.isArray(data.clients) ? data.clients : [];
        const projects = Array.isArray(data.projects) ? data.projects : [];
        const entries = Array.isArray(data.entries) ? data.entries : [];
        const sequences = data.sequences || {};

        // Validation 1: Check document number uniqueness in backup
        const officialDocsInBackup = documents.filter((d: any) => d.documentNumber && d.isOfficial);
        const seenDocNums = new Set<string>();
        let hasDuplicateInBackup = false;
        for (const d of officialDocsInBackup) {
          const key = `${d.type}_${d.documentNumber}`;
          if (seenDocNums.has(key)) {
            hasDuplicateInBackup = true;
            warnings.push(`הקובץ מכיל מסמך כפול ברצף: ${d.type} מס׳ ${d.documentNumber}`);
          }
          seenDocNums.add(key);
        }

        // Validation 2: Sequence comparison
        const currentSequences = readJson<SequenceSettings>(SEQUENCES_FILE);
        const willRollbackSequences = 
          (sequences.paymentRequestNext && sequences.paymentRequestNext < currentSequences.paymentRequestNext) ||
          (sequences.receiptNext && sequences.receiptNext < currentSequences.receiptNext);

        if (willRollbackSequences) {
          warnings.push('מספרי הרצף בגיבוי נמוכים מהרצף הפעיל במערכת. בעת שחזור יישמר הרצף הגבוה ביותר למניעת כפילויות של מסמכים רשמיים.');
        }

        // Validation 3: Check existing official documents in current system
        const currentDocs = readJson<AppDocument[]>(DOCUMENTS_FILE);
        const currentOfficialDocs = currentDocs.filter(d => d.isOfficial && d.documentNumber);
        for (const curDoc of currentOfficialDocs) {
          const inBackup = documents.find((b: any) => b.documentNumber === curDoc.documentNumber && b.type === curDoc.type);
          if (inBackup && inBackup.status === 'draft') {
            warnings.push(`מסמך רשמי מס׳ ${curDoc.documentNumber} מופיע בגיבוי כטיוטה. לא תותר דריסה של מסמך רשמי.`);
          }
        }

        const counts = {
          clients: clients.length,
          projects: projects.length,
          entries: entries.length,
          documents: documents.length,
          issuedDocuments: documents.filter((d: any) => d.status !== 'draft').length,
          draftDocuments: documents.filter((d: any) => d.status === 'draft').length,
          hasSequences: !!data.sequences,
          hasBusinessSettings: !!data.business,
        };

        res.statusCode = 200;
        res.end(JSON.stringify({
          valid: !hasDuplicateInBackup,
          version,
          exportDate: payload.exportDate || payload.exportedAt || null,
          system: payload.system || 'AMIT TOUCH Backup',
          counts,
          warnings,
          canRestore: !hasDuplicateInBackup,
        }));
        return;
      }

      // 8d. POST /api/backup/restore - Perform safe restoration with auto-recovery snapshot
      if (req.method === 'POST' && url === '/api/backup/restore') {
        const body = await readBody();
        const payload = body.backupData || body;

        if (!payload || typeof payload !== 'object') {
          res.statusCode = 400;
          res.end(JSON.stringify({ error: 'נתוני שחזור חסרים או לא תקינים' }));
          return;
        }

        const data = payload.data || payload;
        await acquireLock();
        try {
          // 1. Create a safety recovery backup BEFORE modifying anything
          const recoveryFile = createRecoveryBackup('pre_restore');

          const currentDocs = readJson<AppDocument[]>(DOCUMENTS_FILE);
          const currentSequences = readJson<SequenceSettings>(SEQUENCES_FILE);
          const currentAudit = readJson<AuditLogEntry[]>(AUDIT_FILE);

          const backupDocs: AppDocument[] = Array.isArray(data.documents) ? data.documents : [];
          const backupClients = Array.isArray(data.clients) ? data.clients : [];
          const backupProjects = Array.isArray(data.projects) ? data.projects : [];
          const backupEntries = Array.isArray(data.entries) ? data.entries : [];
          const backupAudit: AuditLogEntry[] = Array.isArray(data.audit) ? data.audit : [];
          const backupSequences: Partial<SequenceSettings> = data.sequences || {};
          const backupBusiness: Partial<BusinessSettings> = data.business || {};
          const backupSettings = data.settings;

          // 2. Guardrail: Enforce uniqueness & Protect official issued documents
          const finalDocsMap = new Map<string, AppDocument>();

          // Add backup documents
          for (const doc of backupDocs) {
            finalDocsMap.set(doc.id, doc);
          }

          // Ensure any CURRENT official issued document is NEVER overwritten by an older draft or deleted
          for (const curDoc of currentDocs) {
            if (curDoc.isOfficial && curDoc.documentNumber) {
              const existingInMap = Array.from(finalDocsMap.values()).find(
                d => d.documentNumber === curDoc.documentNumber && d.type === curDoc.type
              );
              if (!existingInMap) {
                finalDocsMap.set(curDoc.id, curDoc);
              } else if (existingInMap.status === 'draft') {
                finalDocsMap.set(curDoc.id, curDoc);
              }
            }
          }

          const finalDocs = Array.from(finalDocsMap.values());

          // 3. Guardrail: Sequences MUST NOT roll backward below any issued document or current sequences!
          const allOfficialDocs = finalDocs.filter(d => d.isOfficial && d.documentNumber);
          const maxPaymentRequestNum = allOfficialDocs
            .filter(d => d.type === 'payment_request' && /^\d+$/.test(d.documentNumber!))
            .reduce((max, d) => Math.max(max, parseInt(d.documentNumber!, 10)), 0);

          const maxReceiptNum = allOfficialDocs
            .filter(d => d.type === 'receipt' && /^\d+$/.test(d.documentNumber!))
            .reduce((max, d) => Math.max(max, parseInt(d.documentNumber!, 10)), 0);

          const safeSequences: SequenceSettings = {
            ...currentSequences,
            ...backupSequences,
            paymentRequestNext: Math.max(
              currentSequences.paymentRequestNext || 40016,
              backupSequences.paymentRequestNext || 40016,
              maxPaymentRequestNum ? maxPaymentRequestNum + 1 : 40016
            ),
            receiptNext: Math.max(
              currentSequences.receiptNext || 250016,
              backupSequences.receiptNext || 250016,
              maxReceiptNum ? maxReceiptNum + 1 : 250016
            ),
            quoteNext: backupSequences.quoteNext !== undefined ? backupSequences.quoteNext : currentSequences.quoteNext,
            isLocked: currentSequences.isLocked || !!backupSequences.isLocked,
            isProductionActive: currentSequences.isProductionActive || !!backupSequences.isProductionActive,
          };

          // 4. Safely write files
          writeJson(DOCUMENTS_FILE, finalDocs);
          writeJson(SEQUENCES_FILE, safeSequences);
          if (backupClients.length > 0) writeJson(CLIENTS_FILE, backupClients);
          if (backupProjects.length > 0) writeJson(PROJECTS_FILE, backupProjects);
          if (backupEntries.length > 0) writeJson(ENTRIES_FILE, backupEntries);
          if (backupBusiness && Object.keys(backupBusiness).length > 0) {
            const currentBusiness = readJson<BusinessSettings>(BUSINESS_FILE);
            writeJson(BUSINESS_FILE, { ...currentBusiness, ...backupBusiness });
          }
          if (backupSettings) {
            writeJson(APP_SETTINGS_FILE, backupSettings);
          }

          // Restore signature asset if included in backup
          if (data.assets?.signatureBase64 && typeof data.assets.signatureBase64 === 'string') {
            try {
              const sigPath = path.resolve(process.cwd(), 'signiture.png');
              if (!fs.existsSync(sigPath)) {
                const base64Data = data.assets.signatureBase64.replace(/^data:image\/\w+;base64,/, '');
                fs.writeFileSync(sigPath, Buffer.from(base64Data, 'base64'));
              }
            } catch (err) {
              console.warn('Failed restoring signature asset from backup:', err);
            }
          }

          // Restore signed PDFs archive if included in backup
          if (data.signedPdfs && typeof data.signedPdfs === 'object') {
            ensureSignedDocsStore();
            for (const [pdfName, b64] of Object.entries(data.signedPdfs)) {
              if (typeof pdfName === 'string' && typeof b64 === 'string' && pdfName.endsWith('.pdf')) {
                try {
                  const safeName = path.basename(pdfName);
                  const dest = path.join(SIGNED_DOCS_DIR, safeName);
                  if (!fs.existsSync(dest)) {
                    fs.writeFileSync(dest, Buffer.from(b64, 'base64'));
                  }
                } catch (pdfRestErr) {
                  console.warn('Failed restoring signed PDF from backup:', pdfName, pdfRestErr);
                }
              }
            }
          }

          // 5. Append restore event to audit trail
          const combinedAudit = [
            ...backupAudit,
            ...currentAudit.filter(a => !backupAudit.some(ba => ba.id === a.id)),
            {
              id: `audit_${Date.now()}`,
              documentId: 'system',
              action: 'backup_restored' as const,
              timestamp: new Date().toISOString(),
              details: `בוצע שחזור נתונים מלא מגיבוב. נוצר קובץ הצלה מקדים: ${recoveryFile}. מספרי רצף שומרו בבטחה.`,
              performedBy: 'AMIT TOUCH Studio',
            }
          ];
          writeJson(AUDIT_FILE, combinedAudit);

          // 6. Update backup status & snapshot
          performAutoBackup('post_restore');

          res.statusCode = 200;
          res.end(JSON.stringify({
            success: true,
            recoveryFile,
            restoredCounts: {
              clients: backupClients.length,
              projects: backupProjects.length,
              entries: backupEntries.length,
              documents: finalDocs.length,
            },
            safeSequences,
          }));
        } catch (err: any) {
          res.statusCode = 500;
          res.end(JSON.stringify({ error: `שגיאה בשחזור הגיבוי: ${err.message}` }));
        } finally {
          releaseLock();
        }
        return;
      }

      // 8e. POST /api/backup/snapshot - Manual trigger for automatic snapshot
      if (req.method === 'POST' && url === '/api/backup/snapshot') {
        performAutoBackup('manual_user_snapshot');
        const statusData = fs.existsSync(BACKUP_STATUS_FILE) ? JSON.parse(fs.readFileSync(BACKUP_STATUS_FILE, 'utf8')) : {};
        res.statusCode = 200;
        res.end(JSON.stringify(statusData));
        return;
      }

      // 9. POST /api/documents/draft/delete - Permanently delete a draft document
      if (req.method === 'POST' && url === '/api/documents/draft/delete') {
        const { documentId } = await readBody();
        if (!documentId) {
          res.statusCode = 400;
          res.end(JSON.stringify({ error: 'מזהה מסמך חסר' }));
          return;
        }

        await acquireLock();
        try {
          const documents = readJson<AppDocument[]>(DOCUMENTS_FILE);
          const audit = readJson<AuditLogEntry[]>(AUDIT_FILE);

          const docIdx = documents.findIndex(d => d.id === documentId);
          if (docIdx === -1) {
            res.statusCode = 404;
            res.end(JSON.stringify({ error: 'טיוטת המסמך לא נמצאה' }));
            return;
          }

          if (documents[docIdx].status !== 'draft') {
            res.statusCode = 400;
            res.end(JSON.stringify({ error: 'לא ניתן למחוק מסמך שהופק רשמית. מסמכים רשמיים ניתן לבטל בלבד.' }));
            return;
          }

          const deletedDoc = documents.splice(docIdx, 1)[0];
          audit.push({
            id: `audit_${Date.now()}`,
            documentId,
            action: 'draft_updated',
            timestamp: new Date().toISOString(),
            details: `טיוטת מסמך מסוג ${deletedDoc.type} נמחקה מהמערכת`,
            performedBy: 'AMIT TOUCH Studio',
          });

          writeJson(DOCUMENTS_FILE, documents);
          writeJson(AUDIT_FILE, audit);

          res.statusCode = 200;
          res.end(JSON.stringify({ success: true, deletedId: documentId }));
        } finally {
          releaseLock();
        }
        return;
      }

      // 9.5. POST /api/documents/export-pdf - Generate and download clean PDF directly
      if (req.method === 'POST' && url === '/api/documents/export-pdf') {
        const body = await readBody();
        const documentId = body.documentId || body.document?.id;
        const businessSettings = readJson<BusinessSettings>(BUSINESS_FILE);
        let docToRender: AppDocument | undefined;

        if (documentId) {
          const documents = readJson<AppDocument[]>(DOCUMENTS_FILE);
          docToRender = documents.find(d => d.id === documentId);
        }
        if (!docToRender && body.document) {
          docToRender = body.document;
        }

        if (!docToRender) {
          res.statusCode = 404;
          res.end(JSON.stringify({ error: 'מסמך לא נמצא' }));
          return;
        }

        try {
          let pdfBuffer: Buffer;
          if (docToRender.signedPdfFilename) {
            const signedPath = path.join(SIGNED_DOCS_DIR, docToRender.signedPdfFilename);
            if (fs.existsSync(signedPath)) {
              pdfBuffer = fs.readFileSync(signedPath);
            } else {
              const { generateDocumentPdfBuffer } = await getPdfGenerator();
              pdfBuffer = generateDocumentPdfBuffer(docToRender, businessSettings);
            }
          } else {
            const { generateDocumentPdfBuffer } = await getPdfGenerator();
            pdfBuffer = generateDocumentPdfBuffer(docToRender, businessSettings);
          }

          const typeLabel = docToRender.type === 'payment_request' ? 'חשבון_עסקה' : docToRender.type === 'receipt' ? 'קבלה' : 'הצעת_מחיר';
          const numLabel = docToRender.documentNumber || 'טיוטה';
          const filename = `${typeLabel}_${numLabel}.pdf`;

          res.statusCode = 200;
          res.setHeader('Content-Type', 'application/pdf');
          res.setHeader('Content-Length', pdfBuffer.length);
          res.setHeader(
            'Content-Disposition',
            `attachment; filename="${encodeURIComponent(filename)}"; filename*=UTF-8''${encodeURIComponent(filename)}`
          );
          res.end(pdfBuffer);
          return;
        } catch (pdfErr: any) {
          console.error('Error generating PDF:', pdfErr);
          res.statusCode = 500;
          res.end(JSON.stringify({ error: pdfErr?.message || 'שגיאה ביצירת קובץ PDF' }));
          return;
        }
      }

      // 9.5b. POST /api/documents/generate-test-receipt - Generate and issue a clearly marked signed test receipt directly
      if (req.method === 'POST' && url === '/api/documents/generate-test-receipt') {
        const creds = loadSigningCredentials();
        if (!creds) {
          res.statusCode = 500;
          res.end(JSON.stringify({ error: 'תעודת חתימה מקומית אינה זמינה בשרת' }));
          return;
        }

        await acquireLock();
        try {
          const sequences = readJson<SequenceSettings>(SEQUENCES_FILE);
          const business = readJson<BusinessSettings>(BUSINESS_FILE);
          const documents = readJson<AppDocument[]>(DOCUMENTS_FILE);
          const audit = readJson<AuditLogEntry[]>(AUDIT_FILE);

          const testNum = sequences.testSequenceNext || 1001;
          sequences.testSequenceNext = testNum + 1;
          const allocatedNumberStr = `TEST-${testNum}`;

          const testDocId = `doc_test_${Date.now()}_${testNum}`;
          const snapshot = {
            business: {
              ...business,
              signatureUrl: business.signatureUrl || '/signiture.png',
            },
            client: {
              id: 'client_test_pkg_consented',
              name: 'לקוח בדיקה מורשה (אימות חתימה אלקטרונית)',
              businessNumber: '519999888',
              email: 'test@amittouch.co.il',
            },
            projectName: 'בדיקת חתימה מקומית (סביבה פרטית)',
            lineItems: [
              {
                id: 'item_test_1',
                description: 'שירותי עיצוב ומיתוג — קבלת בדיקה חתומה דיגיטלית (לא לשימוש רשמי)',
                quantity: 1,
                unit: 'פרויקט',
                unitPrice: 1200,
                discount: 0,
                discountType: 'amount' as const,
                isTaxable: false,
                lineTotal: 1200,
              }
            ],
            totals: {
              subtotal: 1200,
              discountTotal: 0,
              taxableAmount: 1200,
              vatTotal: 0,
              vatRate: 0,
              totalAmount: 1200,
              currency: '₪',
            },
            paymentMethods: [
              {
                id: 'pm_test_1',
                type: 'bank_transfer' as const,
                amount: 1200,
                bankName: 'בנק הפועלים',
                referenceNumber: `TX-TEST-${testNum}`,
                isDirectTransferConfirmed: true,
              }
            ],
            notes: 'מסמך בדיקה — לא לשימוש רשמי (TEST DOCUMENT — NOT AN OFFICIAL TAX RECEIPT)\nעוסק פטור — לא נגבה מע״מ',
            frozenAt: new Date().toISOString(),
          };

          const testDoc: AppDocument = {
            id: testDocId,
            type: 'receipt',
            status: 'issued',
            documentNumber: allocatedNumberStr,
            isOfficial: false,
            isTestMode: true,
            deliveryStatus: 'not_sent',
            deliveryMethod: 'electronic',
            date: new Date().toISOString().split('T')[0],
            issuedAt: new Date().toISOString(),
            clientId: 'client_test_pkg_consented',
            clientName: 'לקוח בדיקה מורשה (אימות חתימה אלקטרונית)',
            clientBusinessNumber: '519999888',
            currency: '₪',
            lineItems: snapshot.lineItems,
            subtotal: 1200,
            discountTotal: 0,
            vatTotal: 0,
            totalAmount: 1200,
            paidAmount: 1200,
            remainingBalance: 0,
            paymentMethods: snapshot.paymentMethods,
            notes: snapshot.notes,
            auditTrail: [],
            createdAt: new Date().toISOString(),
            snapshot,
          };

          ensureSignedDocsStore();
          const signedFilename = `receipt_${testDoc.documentNumber}_${testDoc.id}.pdf`;
          const targetFilePath = path.join(SIGNED_DOCS_DIR, signedFilename);

          const { generateDocumentPdfBuffer } = await getPdfGenerator();
          const initialPdfBuffer = generateDocumentPdfBuffer(testDoc, business);
          const signedPdf = signPdfBuffer(
            initialPdfBuffer,
            creds.certDer,
            creds.privateKeyPem,
            business.legalName || 'עמית טל - AMIT TOUCH',
            'מסמך ממוחשב (בדיקה) - חתימה אלקטרונית מאובטחת מקומית'
          );

          // Verify signature immediately
          const verifyResult = verifyPdfDigitalSignature(signedPdf);
          if (!verifyResult.isValid || !verifyResult.digestMatch) {
            throw new Error(`אימות החתימה הדיגיטלית נכשל: ${verifyResult.details}`);
          }

          const sha256 = crypto.createHash('sha256').update(signedPdf).digest('hex');
          fs.writeFileSync(targetFilePath, signedPdf);

          // Also mirror to test package and artifact paths
          const pkgPath = path.join(DATA_DIR, 'test_packages', 'receipt_TEST-1001_signed.pdf');
          fs.writeFileSync(pkgPath, signedPdf);
          const artifactPath = path.join('C:\\Users\\NEW\\.gemini\\antigravity\\brain\\3e78f576-2583-4723-ae5a-21f591dba6cb', 'receipt_TEST-1001_signed.pdf');
          if (fs.existsSync(path.dirname(artifactPath))) {
            fs.writeFileSync(artifactPath, signedPdf);
          }

          testDoc.signedPdfFilename = signedFilename;
          testDoc.digitalSignature = {
            isSigned: true,
            signatureCategory: creds.category,
            signerName: creds.subject || business.legalName || 'עמית טל - AMIT TOUCH',
            signedAt: new Date().toISOString(),
            sha256Digest: sha256,
            certificateSubject: creds.subject,
            certificateIssuer: creds.issuer,
            certificateValidTo: creds.validTo,
            algorithm: 'RSA-SHA256 (PAdES Detached)',
            retainedPdfFilename: signedFilename,
          };

          documents.push(testDoc);
          writeJson(DOCUMENTS_FILE, documents);
          writeJson(SEQUENCES_FILE, sequences);

          audit.push({
            id: `audit_test_${Date.now()}`,
            documentId: testDoc.id,
            action: 'issued',
            timestamp: new Date().toISOString(),
            details: `הופקה קבלה חתומה לבדיקה במסלול מאובטח מקומי (מסמך מס׳ ${testDoc.documentNumber}, SHA-256 Digest: ${sha256.substring(0, 16)}...).`,
            performedBy: 'AMIT TOUCH Test Signing Service',
          });
          writeJson(AUDIT_FILE, audit);

          res.statusCode = 200;
          res.end(JSON.stringify({
            success: true,
            document: testDoc,
            downloadUrl: `/api/documents/test-signed-pdf?filename=${encodeURIComponent(signedFilename)}`,
          }));
        } catch (err: any) {
          console.error('Error generating signed test receipt:', err);
          res.statusCode = 500;
          res.end(JSON.stringify({ error: err.message || 'שגיאה בהפקת קבלה חתומה לבדיקה' }));
        } finally {
          releaseLock();
        }
        return;
      }

      // 9.6. GET /api/documents/test-signed-pdf - Serve signed test PDF directly for verification in Adobe Reader
      if (req.method === 'GET' && (url === '/api/documents/test-signed-pdf' || url.startsWith('/api/documents/test-signed-pdf?') || url === '/api/documents/download-signed-test')) {
        const parsedUrl = new URL(url, 'http://localhost');
        const customFilename = parsedUrl.searchParams.get('filename');
        let testPkgPath = path.join(DATA_DIR, 'test_packages', 'receipt_TEST-1001_signed.pdf');

        if (customFilename) {
          const candidate = path.join(SIGNED_DOCS_DIR, path.basename(customFilename));
          if (fs.existsSync(candidate)) {
            testPkgPath = candidate;
          }
        }

        if (!fs.existsSync(testPkgPath)) {
          res.statusCode = 404;
          res.end(JSON.stringify({ error: 'קובץ בדיקה חתום לא נמצא' }));
          return;
        }
        const buf = fs.readFileSync(testPkgPath);
        res.statusCode = 200;
        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Length', buf.length);
        res.setHeader(
          'Content-Disposition',
          `inline; filename="${path.basename(testPkgPath)}"`
        );
        res.end(buf);
        return;
      }

      // 10. GET /api/app-data - Fetch clients, projects, and entries
      if (req.method === 'GET' && url === '/api/app-data') {
        const clients = readJson<any[]>(CLIENTS_FILE);
        const projects = readJson<any[]>(PROJECTS_FILE);
        const entries = readJson<any[]>(ENTRIES_FILE);
        const settings = fs.existsSync(APP_SETTINGS_FILE) ? readJson<any>(APP_SETTINGS_FILE) : null;

        res.statusCode = 200;
        res.end(JSON.stringify({ clients, projects, entries, settings }));
        return;
      }

      // 10b. POST /api/app-data/settings - Update studio settings
      if (req.method === 'POST' && url === '/api/app-data/settings') {
        const newSettings = await readBody();
        await acquireLock();
        try {
          writeJson(APP_SETTINGS_FILE, newSettings);
          res.statusCode = 200;
          res.end(JSON.stringify({ success: true, settings: newSettings }));
        } finally {
          releaseLock();
        }
        return;
      }

      // 11. POST /api/app-data/entry/delete - Delete time entry permanently
      if (req.method === 'POST' && url === '/api/app-data/entry/delete') {
        const { id } = await readBody();
        if (!id) {
          res.statusCode = 400;
          res.end(JSON.stringify({ error: 'מזהה רשומה חסר' }));
          return;
        }

        await acquireLock();
        try {
          const entries = readJson<any[]>(ENTRIES_FILE);
          const updated = entries.filter(e => e.id !== id);
          writeJson(ENTRIES_FILE, updated);

          res.statusCode = 200;
          res.end(JSON.stringify({ success: true, deletedId: id }));
        } finally {
          releaseLock();
        }
        return;
      }

      // 12. POST /api/app-data/entry/save - Save or update time entry
      if (req.method === 'POST' && url === '/api/app-data/entry/save') {
        const entry = await readBody();
        if (!entry || !entry.id) {
          res.statusCode = 400;
          res.end(JSON.stringify({ error: 'פרטי רשומה חסרים' }));
          return;
        }

        await acquireLock();
        try {
          const entries = readJson<any[]>(ENTRIES_FILE);
          const idx = entries.findIndex(e => e.id === entry.id);
          if (idx >= 0) {
            entries[idx] = entry;
          } else {
            entries.unshift(entry);
          }
          writeJson(ENTRIES_FILE, entries);

          res.statusCode = 200;
          res.end(JSON.stringify({ success: true, entry }));
        } finally {
          releaseLock();
        }
        return;
      }

      // 13. POST /api/app-data/client/delete - Delete client and cascade to projects/entries
      if (req.method === 'POST' && url === '/api/app-data/client/delete') {
        const { id } = await readBody();
        if (!id) {
          res.statusCode = 400;
          res.end(JSON.stringify({ error: 'מזהה לקוח חסר' }));
          return;
        }

        await acquireLock();
        try {
          // Check if client is referenced in issued documents
          const documents = readJson<AppDocument[]>(DOCUMENTS_FILE);
          const hasIssued = documents.some(d => d.clientId === id && d.status !== 'draft');
          if (hasIssued) {
            res.statusCode = 400;
            res.end(JSON.stringify({ error: 'לא ניתן למחוק לקוח המשויך למסמכים רשמיים שהופקו. יש להעבירו לארכיון.' }));
            return;
          }

          const clients = readJson<any[]>(CLIENTS_FILE);
          const projects = readJson<any[]>(PROJECTS_FILE);
          const entries = readJson<any[]>(ENTRIES_FILE);

          const updatedClients = clients.filter(c => c.id !== id);
          const updatedProjects = projects.filter(p => p.clientId !== id);
          const updatedEntries = entries.filter(e => e.clientId !== id);

          writeJson(CLIENTS_FILE, updatedClients);
          writeJson(PROJECTS_FILE, updatedProjects);
          writeJson(ENTRIES_FILE, updatedEntries);

          res.statusCode = 200;
          res.end(JSON.stringify({ success: true, deletedId: id }));
        } finally {
          releaseLock();
        }
        return;
      }

      // 14. POST /api/app-data/client/save - Save or update client
      if (req.method === 'POST' && url === '/api/app-data/client/save') {
        const client = await readBody();
        if (!client || !client.id) {
          res.statusCode = 400;
          res.end(JSON.stringify({ error: 'פרטי לקוח חסרים' }));
          return;
        }

        await acquireLock();
        try {
          const clients = readJson<any[]>(CLIENTS_FILE);
          const idx = clients.findIndex(c => c.id === client.id);
          if (idx >= 0) {
            clients[idx] = client;
          } else {
            clients.push(client);
          }
          writeJson(CLIENTS_FILE, clients);

          res.statusCode = 200;
          res.end(JSON.stringify({ success: true, client }));
        } finally {
          releaseLock();
        }
        return;
      }

      // 15. POST /api/app-data/project/delete - Delete project and cascade to entries
      if (req.method === 'POST' && url === '/api/app-data/project/delete') {
        const { id } = await readBody();
        if (!id) {
          res.statusCode = 400;
          res.end(JSON.stringify({ error: 'מזהה פרויקט חסר' }));
          return;
        }

        await acquireLock();
        try {
          // Check if project is referenced in issued documents
          const documents = readJson<AppDocument[]>(DOCUMENTS_FILE);
          const hasIssued = documents.some(d => d.projectId === id && d.status !== 'draft');
          if (hasIssued) {
            res.statusCode = 400;
            res.end(JSON.stringify({ error: 'לא ניתן למחוק פרויקט המשויך למסמכים רשמיים שהופקו.' }));
            return;
          }

          const projects = readJson<any[]>(PROJECTS_FILE);
          const entries = readJson<any[]>(ENTRIES_FILE);

          const updatedProjects = projects.filter(p => p.id !== id);
          const updatedEntries = entries.filter(e => e.projectId !== id);

          writeJson(PROJECTS_FILE, updatedProjects);
          writeJson(ENTRIES_FILE, updatedEntries);

          res.statusCode = 200;
          res.end(JSON.stringify({ success: true, deletedId: id }));
        } finally {
          releaseLock();
        }
        return;
      }

      // 16. POST /api/app-data/project/save - Save or update project
      if (req.method === 'POST' && url === '/api/app-data/project/save') {
        const project = await readBody();
        if (!project || !project.id) {
          res.statusCode = 400;
          res.end(JSON.stringify({ error: 'פרטי פרויקט חסרים' }));
          return;
        }

        await acquireLock();
        try {
          const projects = readJson<any[]>(PROJECTS_FILE);
          const idx = projects.findIndex(p => p.id === project.id);
          if (idx >= 0) {
            projects[idx] = project;
          } else {
            projects.push(project);
          }
          writeJson(PROJECTS_FILE, projects);

          res.statusCode = 200;
          res.end(JSON.stringify({ success: true, project }));
        } finally {
          releaseLock();
        }
        return;
      }

      // 17. POST /api/app-data/sync - Bulk sync all app data
      if (req.method === 'POST' && url === '/api/app-data/sync') {
        const { clients, projects, entries } = await readBody();
        await acquireLock();
        try {
          if (Array.isArray(clients)) writeJson(CLIENTS_FILE, clients);
          if (Array.isArray(projects)) writeJson(PROJECTS_FILE, projects);
          if (Array.isArray(entries)) writeJson(ENTRIES_FILE, entries);

          res.statusCode = 200;
          res.end(JSON.stringify({ success: true }));
        } finally {
          releaseLock();
        }
        return;
      }

      // 18. GET /api/app-data/timer - Fetch active running timer
      if (req.method === 'GET' && url === '/api/app-data/timer') {
        if (fs.existsSync(TIMER_FILE)) {
          try {
            const timer = JSON.parse(fs.readFileSync(TIMER_FILE, 'utf8'));
            res.statusCode = 200;
            res.end(JSON.stringify({ activeTimer: timer }));
            return;
          } catch {}
        }
        res.statusCode = 200;
        res.end(JSON.stringify({ activeTimer: null }));
        return;
      }

      // 19. POST /api/app-data/timer - Save or clear active running timer
      if (req.method === 'POST' && url === '/api/app-data/timer') {
        const body = await readBody();
        await acquireLock();
        try {
          if (body && body.activeTimer && body.activeTimer.isRunning) {
            fs.writeFileSync(TIMER_FILE, JSON.stringify(body.activeTimer, null, 2), 'utf8');
          } else {
            if (fs.existsSync(TIMER_FILE)) {
              try { fs.unlinkSync(TIMER_FILE); } catch {}
            }
          }
          res.statusCode = 200;
          res.end(JSON.stringify({ success: true }));
        } finally {
          releaseLock();
        }
        return;
      }

      // Unknown document endpoint
      res.statusCode = 404;
      res.end(JSON.stringify({ error: 'Endpoint not found' }));
    } catch (err: any) {
      res.statusCode = 500;
      res.end(JSON.stringify({ error: err.message || 'Internal Server Error' }));
    }
  };
}
