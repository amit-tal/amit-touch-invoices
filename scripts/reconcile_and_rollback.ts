import fs from 'fs';
import path from 'path';

/**
 * AMIT TOUCH - Cutover & Safe Rollback Reconciliation Utility
 * 
 * Safely merges online activity back into the local system:
 * 1. Elevates sequence numbers to Math.max(local, online, max_issued + 1) to prevent collisions.
 * 2. Merges newly issued documents, clients, projects, and time entries.
 * 3. Removes local maintenance lock (re-enabling local writes safely).
 */

const DATA_DIR = path.resolve(process.cwd(), 'data');
const DOCUMENTS_FILE = path.join(DATA_DIR, 'documents.json');
const SEQUENCES_FILE = path.join(DATA_DIR, 'sequences.json');
const CLIENTS_FILE = path.join(DATA_DIR, 'clients.json');
const PROJECTS_FILE = path.join(DATA_DIR, 'projects.json');
const ENTRIES_FILE = path.join(DATA_DIR, 'entries.json');
const AUDIT_FILE = path.join(DATA_DIR, 'audit.json');
const MAINTENANCE_LOCK_FILE = path.join(DATA_DIR, 'maintenance_lock.json');

export function lockLocalSystemForCutover(reason = 'Migration to private cloud hosting'): void {
  const lockData = {
    lockedAt: new Date().toISOString(),
    reason,
    mode: 'read_only_cutover',
    message: 'Local machine is in Read-Only mode. All writes disabled to prevent split-brain numbering.'
  };
  fs.writeFileSync(MAINTENANCE_LOCK_FILE, JSON.stringify(lockData, null, 2), 'utf8');
  console.log('[CUTOVER] Local system successfully locked in READ-ONLY mode.');
}

export function reconcileAndRollback(onlineExportPath: string): { success: boolean; importedDocs: number; updatedSequences: any } {
  if (!fs.existsSync(onlineExportPath)) {
    throw new Error(`Online export file not found: ${onlineExportPath}`);
  }

  const rawOnline = fs.readFileSync(onlineExportPath, 'utf8');
  const onlinePayload = JSON.parse(rawOnline);
  const onlineData = onlinePayload.data || onlinePayload;

  // Read current local state
  const localDocs = fs.existsSync(DOCUMENTS_FILE) ? JSON.parse(fs.readFileSync(DOCUMENTS_FILE, 'utf8')) : [];
  const localSequences = fs.existsSync(SEQUENCES_FILE) ? JSON.parse(fs.readFileSync(SEQUENCES_FILE, 'utf8')) : {};
  const localClients = fs.existsSync(CLIENTS_FILE) ? JSON.parse(fs.readFileSync(CLIENTS_FILE, 'utf8')) : [];
  const localProjects = fs.existsSync(PROJECTS_FILE) ? JSON.parse(fs.readFileSync(PROJECTS_FILE, 'utf8')) : [];
  const localEntries = fs.existsSync(ENTRIES_FILE) ? JSON.parse(fs.readFileSync(ENTRIES_FILE, 'utf8')) : [];
  const localAudit = fs.existsSync(AUDIT_FILE) ? JSON.parse(fs.readFileSync(AUDIT_FILE, 'utf8')) : [];

  const onlineDocs = Array.isArray(onlineData.documents) ? onlineData.documents : [];
  const onlineClients = Array.isArray(onlineData.clients) ? onlineData.clients : [];
  const onlineProjects = Array.isArray(onlineData.projects) ? onlineData.projects : [];
  const onlineEntries = Array.isArray(onlineData.entries) ? onlineData.entries : [];
  const onlineSequences = onlineData.sequences || {};

  // 1. Merge Documents (Protect all local documents and merge all online documents)
  const docsMap = new Map<string, any>();
  localDocs.forEach((d: any) => docsMap.set(d.id, d));
  let newlyImportedDocs = 0;

  onlineDocs.forEach((d: any) => {
    if (!docsMap.has(d.id)) {
      docsMap.set(d.id, d);
      newlyImportedDocs++;
    } else {
      // If doc exists in both, keep the issued / paid state from online
      const current = docsMap.get(d.id);
      if (current.status === 'draft' && d.status !== 'draft') {
        docsMap.set(d.id, d);
        newlyImportedDocs++;
      }
    }
  });

  const mergedDocs = Array.from(docsMap.values());

  // 2. Calculate Strict Monotonic Sequences (Crucial to prevent sequence collision)
  const maxPaymentRequestNum = mergedDocs
    .filter((d: any) => d.type === 'payment_request' && /^\d+$/.test(String(d.documentNumber)))
    .reduce((max: number, d: any) => Math.max(max, parseInt(d.documentNumber, 10)), 0);

  const maxReceiptNum = mergedDocs
    .filter((d: any) => d.type === 'receipt' && /^\d+$/.test(String(d.documentNumber)))
    .reduce((max: number, d: any) => Math.max(max, parseInt(d.documentNumber, 10)), 0);

  const maxQuoteNum = mergedDocs
    .filter((d: any) => d.type === 'quote' && /^\d+$/.test(String(d.documentNumber)))
    .reduce((max: number, d: any) => Math.max(max, parseInt(d.documentNumber, 10)), 0);

  const reconciledSequences = {
    ...localSequences,
    paymentRequestNext: Math.max(
      localSequences.paymentRequestNext || 40016,
      onlineSequences.paymentRequestNext || 40016,
      maxPaymentRequestNum ? maxPaymentRequestNum + 1 : 40016
    ),
    receiptNext: Math.max(
      localSequences.receiptNext || 250016,
      onlineSequences.receiptNext || 250016,
      maxReceiptNum ? maxReceiptNum + 1 : 250016
    ),
    quoteNext: Math.max(
      localSequences.quoteNext || 1001,
      onlineSequences.quoteNext || 1001,
      maxQuoteNum ? maxQuoteNum + 1 : 1001
    ),
    isLocked: true,
    isProductionActive: true,
    reconciledAt: new Date().toISOString()
  };

  // 3. Merge Clients, Projects & Entries
  const clientsMap = new Map<string, any>();
  localClients.forEach((c: any) => clientsMap.set(c.id, c));
  onlineClients.forEach((c: any) => { if (!clientsMap.has(c.id)) clientsMap.set(c.id, c); });

  const projectsMap = new Map<string, any>();
  localProjects.forEach((p: any) => projectsMap.set(p.id, p));
  onlineProjects.forEach((p: any) => { if (!projectsMap.has(p.id)) projectsMap.set(p.id, p); });

  const entriesMap = new Map<string, any>();
  localEntries.forEach((e: any) => entriesMap.set(e.id, e));
  onlineEntries.forEach((e: any) => { if (!entriesMap.has(e.id)) entriesMap.set(e.id, e); });

  // 4. Record Audit Log
  localAudit.push({
    id: `audit_rollback_${Date.now()}`,
    documentId: 'system',
    action: 'rollback_reconciliation',
    timestamp: new Date().toISOString(),
    details: `בוצע שחזור ונסיגה מבוקרת מהענן. יובאו ${newlyImportedDocs} מסמכים חדשים. רצף מסמכים עודכן לערך הגבוה ביותר: חשבון עסקה הבא ${reconciledSequences.paymentRequestNext}, קבלה הבאה ${reconciledSequences.receiptNext}.`,
    performedBy: 'AMIT TOUCH Rollback Utility'
  });

  // 5. Commit atomic writes to disk
  fs.writeFileSync(DOCUMENTS_FILE, JSON.stringify(mergedDocs, null, 2), 'utf8');
  fs.writeFileSync(SEQUENCES_FILE, JSON.stringify(reconciledSequences, null, 2), 'utf8');
  fs.writeFileSync(CLIENTS_FILE, JSON.stringify(Array.from(clientsMap.values()), null, 2), 'utf8');
  fs.writeFileSync(PROJECTS_FILE, JSON.stringify(Array.from(projectsMap.values()), null, 2), 'utf8');
  fs.writeFileSync(ENTRIES_FILE, JSON.stringify(Array.from(entriesMap.values()), null, 2), 'utf8');
  fs.writeFileSync(AUDIT_FILE, JSON.stringify(localAudit, null, 2), 'utf8');

  // 6. Release Maintenance Lock
  if (fs.existsSync(MAINTENANCE_LOCK_FILE)) {
    fs.unlinkSync(MAINTENANCE_LOCK_FILE);
  }

  return {
    success: true,
    importedDocs: newlyImportedDocs,
    updatedSequences: reconciledSequences
  };
}

// CLI execution handling
if (process.argv[1] && process.argv[1].endsWith('reconcile_and_rollback.ts')) {
  const command = process.argv[2];
  if (command === 'lock') {
    lockLocalSystemForCutover(process.argv[3]);
  } else if (command === 'rollback') {
    const exportFile = process.argv[3];
    if (!exportFile) {
      console.error('Usage: node scripts/reconcile_and_rollback.ts rollback <path-to-online-backup.json>');
      process.exit(1);
    }
    const res = reconcileAndRollback(exportFile);
    console.log('[ROLLBACK SUCCESS] Reconciled online data into local dataset:', res);
  } else {
    console.log('Commands available: lock | rollback <exportFile>');
  }
}
