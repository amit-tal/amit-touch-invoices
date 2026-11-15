import type { Client, Project, TimeEntry } from '../types';
import type { AppDocument, SequenceSettings } from '../types/documents';

export interface DeletionRecord {
  id: string;
  deletedAt: string;
  type?: string;
}

export interface DeletionsStore {
  entries: Record<string, DeletionRecord>;
  clients: Record<string, DeletionRecord>;
  projects: Record<string, DeletionRecord>;
  documents: Record<string, DeletionRecord>;
}

export interface ServerSyncMeta {
  datasetState?: 'empty_uninitialized' | 'active';
  storageBackend?: 'postgres' | 'local_filesystem';
  isDurable?: boolean;
  isEphemeralWarning?: boolean;
  revision?: number;
  counts?: {
    clients: number;
    projects: number;
    entries: number;
    documents: number;
    officialDocuments: number;
  };
  maxEntryDate?: string | null;
  maxReceiptNumber?: number;
  maxPaymentRequestNumber?: number;
  receiptNext?: number;
  paymentRequestNext?: number;
}

export interface SyncConflictInfo {
  scope: 'app_data' | 'documents';
  shouldPauseSync: boolean;
  reason?:
    | 'server_dataset_empty_or_reset'
    | 'local_has_newer_entries'
    | 'local_has_unmerged_entries'
    | 'local_has_unsaved_changes'
    | 'server_sequences_regressed'
    | 'local_has_missing_official_documents';
  message?: string;
  localCount: number;
  serverCount: number;
  localMaxDate?: string | null;
  serverMaxDate?: string | null;
  missingOfficialNumbers?: string[];
  prunedClientIds?: string[];
  prunedProjectIds?: string[];
  prunedEntryIds?: string[];
  prunedDocumentIds?: string[];
  detectedAt: string;
}

function getItemTimestamp(item: { updatedAt?: string; createdAt?: string } | undefined | null): string {
  if (!item) return '';
  if (typeof item.updatedAt === 'string' && item.updatedAt) return item.updatedAt;
  if (typeof item.createdAt === 'string' && item.createdAt) return item.createdAt;
  return '';
}

function filterTombstoned<T extends { id: string; updatedAt?: string; createdAt?: string }>(
  items: T[],
  tombstones?: Record<string, DeletionRecord>
): { active: T[]; prunedIds: string[] } {
  if (!tombstones || Object.keys(tombstones).length === 0) {
    return { active: items, prunedIds: [] };
  }
  const active: T[] = [];
  const prunedIds: string[] = [];
  for (const item of items) {
    const deletion = item?.id ? tombstones[item.id] : undefined;
    if (deletion?.deletedAt) {
      const itemTs = getItemTimestamp(item);
      if (!itemTs || itemTs <= deletion.deletedAt) {
        prunedIds.push(item.id);
        continue;
      }
    }
    active.push(item);
  }
  return { active, prunedIds };
}

function getMaxDate(entries: Array<{ date?: string }>): string | null {
  let max: string | null = null;
  for (const e of entries) {
    const d = typeof e?.date === 'string' ? e.date : '';
    if (d && (!max || d > max)) max = d;
  }
  return max;
}

export function evaluateAppDataSync(params: {
  localClients: Client[];
  localProjects: Project[];
  localEntries: TimeEntry[];
  serverData: {
    clients?: Client[];
    projects?: Project[];
    entries?: TimeEntry[];
    deletions?: Partial<DeletionsStore>;
    syncMeta?: ServerSyncMeta;
  };
}): SyncConflictInfo {
  const { localClients, localProjects, localEntries, serverData } = params;
  const serverClients = Array.isArray(serverData?.clients) ? serverData.clients : [];
  const serverProjects = Array.isArray(serverData?.projects) ? serverData.projects : [];
  const serverEntries = Array.isArray(serverData?.entries) ? serverData.entries : [];
  const deletions = serverData?.deletions;
  const syncMeta = serverData?.syncMeta;

  const { active: activeLocalClients, prunedIds: prunedClientIds } = filterTombstoned(
    localClients,
    deletions?.clients
  );
  const { active: activeLocalProjects, prunedIds: prunedProjectIds } = filterTombstoned(
    localProjects,
    deletions?.projects
  );
  const { active: activeLocalEntries, prunedIds: prunedEntryIds } = filterTombstoned(
    localEntries,
    deletions?.entries
  );

  const now = new Date().toISOString();
  const localHasData =
    activeLocalEntries.length > 0 || activeLocalClients.length > 0 || activeLocalProjects.length > 0;
  const serverIsEmptyOrReset =
    syncMeta?.datasetState === 'empty_uninitialized' ||
    (serverEntries.length === 0 && serverClients.length === 0 && serverProjects.length === 0);

  const localMaxDate = getMaxDate(activeLocalEntries);
  const serverMaxDate = getMaxDate(serverEntries);

  if (localHasData && serverIsEmptyOrReset) {
    return {
      scope: 'app_data',
      shouldPauseSync: true,
      reason: 'server_dataset_empty_or_reset',
      message: `הסנכרון הושהה למניעת איבוד נתונים: מאגר השרת ריק או אופס, בעוד שבדפדפן שמורות ${activeLocalEntries.length} רשומות זמן (עד ${localMaxDate || 'ללא תאריך'}).`,
      localCount: activeLocalEntries.length,
      serverCount: serverEntries.length,
      localMaxDate,
      serverMaxDate,
      prunedClientIds,
      prunedProjectIds,
      prunedEntryIds,
      detectedAt: now,
    };
  }

  if (activeLocalEntries.length > 0 && localMaxDate && (!serverMaxDate || localMaxDate > serverMaxDate)) {
    return {
      scope: 'app_data',
      shouldPauseSync: true,
      reason: 'local_has_newer_entries',
      message: `הסנכרון הושהה: בדפדפן שמורות רשומות חדשות יותר (עד ${localMaxDate}) לעומת השרת (${serverMaxDate || 'ללא רשומות'}).`,
      localCount: activeLocalEntries.length,
      serverCount: serverEntries.length,
      localMaxDate,
      serverMaxDate,
      prunedClientIds,
      prunedProjectIds,
      prunedEntryIds,
      detectedAt: now,
    };
  }

  const serverEntryMap = new Map(serverEntries.map(e => [e.id, e]));
  const missingLocalEntries = activeLocalEntries.filter(e => e?.id && !serverEntryMap.has(e.id));
  if (missingLocalEntries.length > 0) {
    return {
      scope: 'app_data',
      shouldPauseSync: true,
      reason: 'local_has_unmerged_entries',
      message: `הסנכרון הושהה: בדפדפן קיימות ${missingLocalEntries.length} רשומות זמן שאינן נמצאות בשרת.`,
      localCount: activeLocalEntries.length,
      serverCount: serverEntries.length,
      localMaxDate,
      serverMaxDate,
      prunedClientIds,
      prunedProjectIds,
      prunedEntryIds,
      detectedAt: now,
    };
  }

  const serverClientMap = new Map(serverClients.map(c => [c.id, c]));
  const serverProjectMap = new Map(serverProjects.map(p => [p.id, p]));
  const missingClients = activeLocalClients.filter(c => c?.id && !serverClientMap.has(c.id));
  const missingProjects = activeLocalProjects.filter(p => p?.id && !serverProjectMap.has(p.id));
  const hasEditedEntry = activeLocalEntries.some(e => {
    const s = serverEntryMap.get(e.id);
    return Boolean(s && e.updatedAt && e.updatedAt > getItemTimestamp(s));
  });
  const hasEditedClient = activeLocalClients.some(c => {
    const s = serverClientMap.get(c.id);
    return Boolean(s && c.updatedAt && c.updatedAt > getItemTimestamp(s));
  });
  const hasEditedProject = activeLocalProjects.some(p => {
    const s = serverProjectMap.get(p.id);
    return Boolean(s && p.updatedAt && p.updatedAt > getItemTimestamp(s));
  });

  if (missingClients.length > 0 || missingProjects.length > 0 || hasEditedEntry || hasEditedClient || hasEditedProject) {
    return {
      scope: 'app_data',
      shouldPauseSync: true,
      reason: 'local_has_unsaved_changes',
      message: 'הסנכרון הושהה: בדפדפן קיימים שינויים מקומיים (לקוחות, פרויקטים או עריכות) שטרם נשמרו בשרת.',
      localCount: activeLocalEntries.length,
      serverCount: serverEntries.length,
      localMaxDate,
      serverMaxDate,
      prunedClientIds,
      prunedProjectIds,
      prunedEntryIds,
      detectedAt: now,
    };
  }

  return {
    scope: 'app_data',
    shouldPauseSync: false,
    localCount: activeLocalEntries.length,
    serverCount: serverEntries.length,
    localMaxDate,
    serverMaxDate,
    prunedClientIds,
    prunedProjectIds,
    prunedEntryIds,
    detectedAt: now,
  };
}

export function evaluateDocumentsSync(params: {
  localDocuments: AppDocument[];
  localSequences: SequenceSettings;
  serverData: {
    documents?: AppDocument[];
    sequences?: SequenceSettings;
    deletions?: Partial<DeletionsStore>;
    syncMeta?: ServerSyncMeta;
  };
}): SyncConflictInfo {
  const { localDocuments, localSequences, serverData } = params;
  const serverDocs = Array.isArray(serverData?.documents) ? serverData.documents : [];
  const serverSequences = serverData?.sequences;
  const deletions = serverData?.deletions;
  const syncMeta = serverData?.syncMeta;
  const now = new Date().toISOString();

  const { active: activeLocalDocs, prunedIds: prunedDocumentIds } = filterTombstoned(
    localDocuments,
    deletions?.documents
  );

  const localHasState = activeLocalDocs.length > 0 || Boolean(localSequences?.isLocked);
  const serverIsEmptyOrReset =
    syncMeta?.datasetState === 'empty_uninitialized' ||
    (serverDocs.length === 0 && !serverSequences?.isLocked);

  if (localHasState && serverIsEmptyOrReset) {
    return {
      scope: 'documents',
      shouldPauseSync: true,
      reason: 'server_dataset_empty_or_reset',
      message: `סנכרון המסמכים הושהה: השרת אותחל במצב ריק בעוד שבדפדפן שמורים ${activeLocalDocs.length} מסמכים.`,
      localCount: activeLocalDocs.length,
      serverCount: serverDocs.length,
      prunedDocumentIds,
      detectedAt: now,
    };
  }

  const serverDocKeys = new Set(
    serverDocs.map(d => (d.isOfficial && d.documentNumber ? `${d.type}:${d.documentNumber}` : d.id))
  );
  const missingOfficial = activeLocalDocs.filter(
    d => d.isOfficial && d.documentNumber && !serverDocKeys.has(`${d.type}:${d.documentNumber}`)
  );
  if (missingOfficial.length > 0) {
    return {
      scope: 'documents',
      shouldPauseSync: true,
      reason: 'local_has_missing_official_documents',
      message: `סנכרון המסמכים הושהה: מסמכים רשמיים שמורים בדפדפן חסרים בשרת (${missingOfficial.map(d => d.documentNumber).join(', ')}).`,
      localCount: activeLocalDocs.length,
      serverCount: serverDocs.length,
      missingOfficialNumbers: missingOfficial.map(d => String(d.documentNumber)),
      prunedDocumentIds,
      detectedAt: now,
    };
  }

  const serverDocIds = new Set(serverDocs.map(d => d.id));
  const missingDrafts = activeLocalDocs.filter(d => !d.isOfficial && d.id && !serverDocIds.has(d.id));
  if (missingDrafts.length > 0) {
    return {
      scope: 'documents',
      shouldPauseSync: true,
      reason: 'local_has_unsaved_changes',
      message: `סנכרון המסמכים הושהה: בדפדפן שמורות ${missingDrafts.length} טיוטות שאינן נמצאות בשרת.`,
      localCount: activeLocalDocs.length,
      serverCount: serverDocs.length,
      prunedDocumentIds,
      detectedAt: now,
    };
  }

  const localReceiptNext = localSequences?.receiptNext || 0;
  const serverReceiptNext = serverSequences?.receiptNext || 0;
  const localPrNext = localSequences?.paymentRequestNext || 0;
  const serverPrNext = serverSequences?.paymentRequestNext || 0;

  if (localReceiptNext > serverReceiptNext || localPrNext > serverPrNext) {
    return {
      scope: 'documents',
      shouldPauseSync: true,
      reason: 'server_sequences_regressed',
      message: `סנכרון המסמכים הושהה: מספרי הרצף בשרת נמוכים מהרצף השמור בדפדפן (קבלות: מקומי ${localReceiptNext} מול שרת ${serverReceiptNext}).`,
      localCount: activeLocalDocs.length,
      serverCount: serverDocs.length,
      prunedDocumentIds,
      detectedAt: now,
    };
  }

  return {
    scope: 'documents',
    shouldPauseSync: false,
    localCount: activeLocalDocs.length,
    serverCount: serverDocs.length,
    prunedDocumentIds,
    detectedAt: now,
  };
}
