import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { Pool } from 'pg';

export interface PersistentStorageStatus {
  backend: 'postgres' | 'local_filesystem';
  isDurable: boolean;
  isEphemeralWarning: boolean;
  dbConfigured: boolean;
  dbConnected: boolean;
  hydratedRowCount: number;
  lastSyncedAt: string | null;
  lastError: string | null;
}

export interface StoreMeta {
  schemaVersion: number;
  instanceId: string;
  initializedAt: string;
  lastMutationAt: string | null;
  datasetState: 'empty_uninitialized' | 'active';
  revision?: number;
}

export function resolveDataDir(): string {
  return process.env.DATA_DIR
    ? path.resolve(process.env.DATA_DIR)
    : path.resolve(process.cwd(), 'data');
}

export function resolveCertsDir(): string {
  return path.resolve(process.cwd(), 'certs');
}

const PERSISTED_ROOT_FILES = new Set([
  'documents.json',
  'sequences.json',
  'business.json',
  'audit.json',
  'idempotency.json',
  'clients.json',
  'projects.json',
  'entries.json',
  'deletions.json',
  'timer.json',
  'settings.json',
  'backup_status.json',
  'maintenance_lock.json',
  'auth.json',
  'sessions.json',
  '.setup_token',
  '.store_meta.json',
  'emailConfig.json',
  'gmailTokens.json',
]);

let pool: Pool | null = null;
let initPromise: Promise<void> | null = null;
let writeChain: Promise<void> = Promise.resolve();
let pendingWriteError: Error | null = null;
let dbConnected = false;
let hydratedRowCount = 0;
let lastSyncedAt: string | null = null;
let lastError: string | null = null;
let customTestPool: any = null;

export function setPersistentPoolForTesting(mockPool: any): void {
  customTestPool = mockPool;
  pool = mockPool;
  initPromise = null;
  dbConnected = Boolean(mockPool);
  hydratedRowCount = 0;
  lastSyncedAt = null;
  lastError = null;
}

export function resetPersistentStoreStateForTesting(): void {
  customTestPool = null;
  pool = null;
  initPromise = null;
  writeChain = Promise.resolve();
  pendingWriteError = null;
  dbConnected = false;
  hydratedRowCount = 0;
  lastSyncedAt = null;
  lastError = null;
}

function getDatabaseUrl(): string {
  return (process.env.DATABASE_URL || '').trim();
}

export function isDatabaseConfigured(): boolean {
  return Boolean(customTestPool || getDatabaseUrl());
}

function createPool(): Pool | null {
  if (customTestPool) return customTestPool;
  const databaseUrl = getDatabaseUrl();
  if (!databaseUrl) return null;

  const isLocalHost =
    databaseUrl.includes('localhost') ||
    databaseUrl.includes('127.0.0.1') ||
    databaseUrl.includes('::1');

  const disableSsl =
    process.env.DATABASE_SSL === 'false' ||
    (isLocalHost && process.env.DATABASE_SSL !== 'true');

  return new Pool({
    connectionString: databaseUrl,
    max: 5,
    idleTimeoutMillis: 30_000,
    connectionTimeoutMillis: 10_000,
    ssl: disableSsl ? false : { rejectUnauthorized: false },
  });
}

export function toStoreKeyFromPath(targetPath: string): string | null {
  const normalizedTarget = path.resolve(targetPath);
  const dataDir = resolveDataDir();
  const certsDir = resolveCertsDir();

  if (normalizedTarget.startsWith(dataDir + path.sep)) {
    const rel = path.relative(dataDir, normalizedTarget).replace(/\\/g, '/');
    if (rel.startsWith('signed_documents/') && rel.endsWith('.pdf')) {
      return rel;
    }
    if (!rel.includes('/') && PERSISTED_ROOT_FILES.has(rel)) {
      return rel;
    }
    return null;
  }

  if (normalizedTarget.startsWith(certsDir + path.sep)) {
    const rel = path.relative(certsDir, normalizedTarget).replace(/\\/g, '/');
    if (!rel.includes('/')) {
      return `certs/${rel}`;
    }
  }

  return null;
}

function isBinaryKey(storeKey: string): boolean {
  return storeKey.startsWith('signed_documents/') || storeKey.endsWith('.der') || storeKey.endsWith('.pdf');
}

function sha256Of(data: Buffer | string): string {
  return crypto.createHash('sha256').update(data).digest('hex');
}

async function ensureSchema(activePool: Pool): Promise<void> {
  await activePool.query(`
    CREATE TABLE IF NOT EXISTS amit_persistent_store (
      store_key TEXT PRIMARY KEY,
      content_type TEXT NOT NULL,
      text_value TEXT,
      binary_base64 TEXT,
      sha256 TEXT NOT NULL,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);
}

export async function initPersistentStore(): Promise<void> {
  if (initPromise) return initPromise;

  initPromise = (async () => {
    const dataDir = resolveDataDir();
    const certsDir = resolveCertsDir();
    if (!fs.existsSync(dataDir)) {
      fs.mkdirSync(dataDir, { recursive: true });
    }
    if (!fs.existsSync(certsDir)) {
      fs.mkdirSync(certsDir, { recursive: true });
    }

    if (!isDatabaseConfigured()) {
      dbConnected = false;
      const isCloudEnv = Boolean(process.env.RENDER || process.env.RENDER_EXTERNAL_URL || process.env.NODE_ENV === 'production');
      if (isCloudEnv) {
        console.warn('================================================================================');
        console.warn('[AMIT TOUCH STORAGE WARNING] DATABASE_URL is NOT configured!');
        console.warn('[AMIT TOUCH STORAGE WARNING] Running on local filesystem only. On Render Free,');
        console.warn('[AMIT TOUCH STORAGE WARNING] /app/data is EPHEMERAL and will reset on restart/deploy.');
        console.warn('================================================================================');
      }
      return;
    }

    try {
      pool = createPool();
      if (!pool) return;

      await ensureSchema(pool);
      const result = await pool.query(
        'SELECT store_key, content_type, text_value, binary_base64, sha256 FROM amit_persistent_store'
      );

      hydratedRowCount = result.rows.length;
      for (const row of result.rows) {
        const key = String(row.store_key);
        const dest = key.startsWith('certs/')
          ? path.join(certsDir, key.slice('certs/'.length))
          : path.join(dataDir, key);

        const destDir = path.dirname(dest);
        if (!fs.existsSync(destDir)) {
          fs.mkdirSync(destDir, { recursive: true });
        }

        if (row.content_type === 'binary' && typeof row.binary_base64 === 'string') {
          const buf = Buffer.from(row.binary_base64, 'base64');
          fs.writeFileSync(dest, buf);
        } else if (typeof row.text_value === 'string') {
          fs.writeFileSync(dest, row.text_value, 'utf8');
        }
      }

      dbConnected = true;
      lastSyncedAt = new Date().toISOString();
      lastError = null;
      console.log(
        `[AMIT TOUCH STORAGE] Durable PostgreSQL backend connected (${hydratedRowCount} hydrated store keys).`
      );
    } catch (err: any) {
      dbConnected = false;
      lastError = err?.message || String(err);
      console.error('[AMIT TOUCH STORAGE ERROR] Failed initializing PostgreSQL persistent store:', lastError);
      throw err;
    }
  })();

  return initPromise;
}

export async function ensurePersistentStoreReady(): Promise<void> {
  if (!initPromise || (!dbConnected && isDatabaseConfigured())) {
    initPromise = null;
    await initPersistentStore();
  } else {
    await initPromise;
  }
}

function enqueueDbOperation(fn: (activePool: Pool) => Promise<void>): void {
  if (!pool || !dbConnected) return;
  const activePool = pool;
  writeChain = writeChain
    .then(async () => {
      await fn(activePool);
      lastSyncedAt = new Date().toISOString();
      lastError = null;
    })
    .catch((err: any) => {
      const msg = err?.message || String(err);
      lastError = msg;
      pendingWriteError = new Error(`שגיאה בשמירה למסד הנתונים הקבוע: ${msg}`);
      console.error('[AMIT TOUCH STORAGE ERROR] Persist write failed:', lastError);
    });
}

export function persistTextByKey(storeKey: string, textValue: string): void {
  if (!pool || !dbConnected) return;
  const digest = sha256Of(textValue);
  enqueueDbOperation(async (activePool) => {
    await activePool.query(
      `INSERT INTO amit_persistent_store (store_key, content_type, text_value, binary_base64, sha256, updated_at)
       VALUES ($1, 'text', $2, NULL, $3, NOW())
       ON CONFLICT (store_key) DO UPDATE SET
         content_type = EXCLUDED.content_type,
         text_value = EXCLUDED.text_value,
         binary_base64 = NULL,
         sha256 = EXCLUDED.sha256,
         updated_at = NOW()`,
      [storeKey, textValue, digest]
    );
  });
}

export function persistBinaryByKey(storeKey: string, buf: Buffer): void {
  if (!pool || !dbConnected) return;
  const digest = sha256Of(buf);
  const b64 = buf.toString('base64');
  enqueueDbOperation(async (activePool) => {
    await activePool.query(
      `INSERT INTO amit_persistent_store (store_key, content_type, text_value, binary_base64, sha256, updated_at)
       VALUES ($1, 'binary', NULL, $2, $3, NOW())
       ON CONFLICT (store_key) DO UPDATE SET
         content_type = EXCLUDED.content_type,
         text_value = NULL,
         binary_base64 = EXCLUDED.binary_base64,
         sha256 = EXCLUDED.sha256,
         updated_at = NOW()`,
      [storeKey, b64, digest]
    );
  });
}

export function persistFilePath(targetPath: string, data: Buffer | string): void {
  const key = toStoreKeyFromPath(targetPath);
  if (!key) return;
  if (Buffer.isBuffer(data) || isBinaryKey(key)) {
    const buf = Buffer.isBuffer(data) ? data : Buffer.from(data, 'utf8');
    persistBinaryByKey(key, buf);
  } else {
    persistTextByKey(key, data);
  }
}

export function deletePersistedKey(storeKey: string): void {
  if (!pool || !dbConnected) return;
  enqueueDbOperation(async (activePool) => {
    await activePool.query('DELETE FROM amit_persistent_store WHERE store_key = $1', [storeKey]);
  });
}

export function deletePersistedFilePath(targetPath: string): void {
  const key = toStoreKeyFromPath(targetPath);
  if (!key) return;
  deletePersistedKey(key);
}

export async function fetchPersistedBinaryFallback(storeKey: string): Promise<Buffer | null> {
  if (!pool || !dbConnected) return null;
  try {
    const res = await pool.query(
      'SELECT binary_base64 FROM amit_persistent_store WHERE store_key = $1 LIMIT 1',
      [storeKey]
    );
    const b64 = res.rows[0]?.binary_base64;
    if (typeof b64 === 'string' && b64.length > 0) {
      return Buffer.from(b64, 'base64');
    }
  } catch (err: any) {
    lastError = err?.message || String(err);
  }
  return null;
}

export async function flushPersistentWrites(): Promise<void> {
  await writeChain;
  if (pendingWriteError) {
    const err = pendingWriteError;
    pendingWriteError = null;
    throw err;
  }
}

export function getPersistentStorageStatus(): PersistentStorageStatus {
  const dbConfigured = isDatabaseConfigured();
  const isCloudEnv = Boolean(process.env.RENDER || process.env.RENDER_EXTERNAL_URL || process.env.NODE_ENV === 'production');
  const isDurable = dbConfigured && dbConnected;

  return {
    backend: isDurable ? 'postgres' : 'local_filesystem',
    isDurable,
    isEphemeralWarning: isCloudEnv && !isDurable,
    dbConfigured,
    dbConnected,
    hydratedRowCount,
    lastSyncedAt,
    lastError,
  };
}

export async function closePersistentStore(): Promise<void> {
  await flushPersistentWrites();
  if (pool && !customTestPool && typeof (pool as any).end === 'function') {
    await (pool as any).end();
  }
  pool = null;
  initPromise = null;
  dbConnected = false;
}
