import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import type { IncomingMessage, ServerResponse } from 'http';
import {
  resolveDataDir,
  persistFilePath,
  deletePersistedFilePath,
} from './persistentStore.ts';

function getDataDir(): string {
  return resolveDataDir();
}
function getAuthFile(): string {
  return path.join(getDataDir(), 'auth.json');
}
function getSessionsFile(): string {
  return path.join(getDataDir(), 'sessions.json');
}
function getSetupTokenFile(): string {
  return path.join(getDataDir(), '.setup_token');
}

export interface OwnerAccount {
  email: string;
  passwordHash: string;
  salt: string;
  createdAt: string;
  lastLoginAt?: string;
}

export interface SessionRecord {
  token: string;
  email: string;
  createdAt: number;
  expiresAt: number;
  ip?: string;
  userAgent?: string;
}

// In-memory rate limiting for login attempts
interface RateLimitRecord {
  failures: number;
  firstFailureTime: number;
  blockedUntil?: number;
}
const loginRateLimitMap = new Map<string, RateLimitRecord>();
const recoveryRateLimitMap = new Map<string, RateLimitRecord>();

const MAX_LOGIN_FAILURES = 5;
const RATE_LIMIT_WINDOW_MS = 15 * 60 * 1000; // 15 minutes
const BLOCK_DURATION_MS = 15 * 60 * 1000; // 15 minutes lockout
const SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

const MAX_RECOVERY_FAILURES = 3;
const RECOVERY_BLOCK_MS = 30 * 60 * 1000; // 30 minutes lockout on recovery abuse
const MIN_RECOVERY_KEY_LENGTH = 16;

const SESSION_SECRET = process.env.SESSION_SECRET || 'amit-touch-secure-session-salt-2026';

export function getConfiguredRecoverySecret(): string | null {
  const envKey = (process.env.OWNER_RECOVERY_KEY || process.env.SETUP_TOKEN || '').trim();
  if (!envKey) {
    return null;
  }
  if (envKey.length < MIN_RECOVERY_KEY_LENGTH) {
    console.warn(
      `[AMIT TOUCH SECURITY] Configured recovery key is too short (${envKey.length} chars). Minimum ${MIN_RECOVERY_KEY_LENGTH} chars required. Recovery is disabled.`
    );
    return null;
  }
  return envKey;
}

export function isOwnerRecoveryEnabled(): boolean {
  return getConfiguredRecoverySecret() !== null;
}

// Single-use recovery ticket store (10 minute TTL)
interface RecoveryTicket {
  id: string;
  email: string;
  createdAt: number;
  expiresAt: number;
  used: boolean;
}
const recoveryTickets = new Map<string, RecoveryTicket>();
const RECOVERY_TICKET_TTL_MS = 10 * 60 * 1000; // 10 minutes

// Helper: Ensure auth storage files exist
function ensureAuthStore(): void {
  const dir = getDataDir();
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

// Read owner account
let inMemorySetupToken: string | null = null;

export function getOrCreateSetupToken(): string | null {
  // If owner already exists, no setup token needed
  if (getOwnerAccount()) {
    return null;
  }
  const configured = getConfiguredRecoverySecret();
  if (configured) {
    return configured;
  }
  if (inMemorySetupToken) {
    return inMemorySetupToken;
  }
  const setupTokenFile = getSetupTokenFile();
  if (fs.existsSync(setupTokenFile)) {
    try {
      const stored = fs.readFileSync(setupTokenFile, 'utf8').trim();
      if (stored && stored.length >= MIN_RECOVERY_KEY_LENGTH) {
        inMemorySetupToken = stored;
        return stored;
      }
    } catch {}
  }
  
  // Generate strong 32-byte cryptographically secure random token (64 hex characters)
  const token = crypto.randomBytes(32).toString('hex');
  inMemorySetupToken = token;
  try {
    ensureAuthStore();
    fs.writeFileSync(setupTokenFile, token, { mode: 0o600 });
    persistFilePath(setupTokenFile, token);
  } catch {}
  return token;
}

export function verifySetupToken(inputToken: string): boolean {
  if (!inputToken) return false;
  const trimmed = inputToken.trim();
  const configured = getConfiguredRecoverySecret();
  const candidates: string[] = [];
  if (configured) candidates.push(configured);
  const activeToken = getOrCreateSetupToken();
  if (activeToken) candidates.push(activeToken.trim());

  if (candidates.length === 0) {
    return false;
  }

  for (const candidate of candidates) {
    try {
      const a = Buffer.from(trimmed, 'utf8');
      const b = Buffer.from(candidate, 'utf8');
      if (a.length === b.length && crypto.timingSafeEqual(a, b)) {
        return true;
      }
    } catch {}
  }
  return false;
}

export function consumeSetupToken(): void {
  inMemorySetupToken = null;
  const setupTokenFile = getSetupTokenFile();
  if (fs.existsSync(setupTokenFile)) {
    try { fs.unlinkSync(setupTokenFile); } catch {}
    deletePersistedFilePath(setupTokenFile);
  }
}

export function getOwnerAccount(): OwnerAccount | null {
  ensureAuthStore();
  const authFile = getAuthFile();
  if (fs.existsSync(authFile)) {
    try {
      const owner: OwnerAccount = JSON.parse(fs.readFileSync(authFile, 'utf8'));
      // Only execute password reset from environment if explicit one-time flag BOOTSTRAP_RESET_OWNER is enabled
      if (
        process.env.BOOTSTRAP_RESET_OWNER === 'true' &&
        process.env.OWNER_PASSWORD &&
        process.env.OWNER_PASSWORD.trim()
      ) {
        const envPass = process.env.OWNER_PASSWORD.trim();
        const newSalt = crypto.randomBytes(32).toString('hex');
        owner.passwordHash = hashPassword(envPass, newSalt);
        owner.salt = newSalt;
        if (process.env.OWNER_EMAIL && process.env.OWNER_EMAIL.trim()) {
          owner.email = process.env.OWNER_EMAIL.trim().toLowerCase();
        }
        saveOwnerAccount(owner);
        console.log('[AMIT TOUCH SECURITY] One-time explicit owner password reset applied via BOOTSTRAP_RESET_OWNER.');
      }
      return owner;
    } catch {}
  }

  // Fallback 1: check environment variable credentials for initial cold bootstrap
  const envEmail = (process.env.OWNER_EMAIL || process.env.ADMIN_EMAIL || '').trim().toLowerCase();
  const envPass = (process.env.OWNER_PASSWORD || process.env.ADMIN_PASSWORD || '').trim();
  if (envEmail && envPass) {
    const salt = crypto.randomBytes(32).toString('hex');
    const hash = hashPassword(envPass, salt);
    const initialOwner: OwnerAccount = {
      email: envEmail,
      passwordHash: hash,
      salt,
      createdAt: new Date().toISOString(),
    };
    saveOwnerAccount(initialOwner);
    return initialOwner;
  }

  // Fallback 2: Check seed fallback ONLY when ALLOW_SEED_AUTOLOAD is explicitly enabled
  if (process.env.ALLOW_SEED_AUTOLOAD === 'true') {
    const seedAuthPath = path.resolve(process.cwd(), 'server', 'seed', 'auth.json');
    if (fs.existsSync(seedAuthPath)) {
      try {
        const seedData = JSON.parse(fs.readFileSync(seedAuthPath, 'utf8'));
        saveOwnerAccount(seedData);
        return seedData;
      } catch {}
    }
  }

  return null;
}

export function checkRecoveryRateLimit(req: IncomingMessage): { allowed: boolean; remainingSec?: number } {
  const ip = getClientIp(req);
  const key = `recovery_${ip}`;
  const record = recoveryRateLimitMap.get(key);
  if (!record) return { allowed: true };

  const now = Date.now();
  if (record.blockedUntil && record.blockedUntil > now) {
    const remainingSec = Math.ceil((record.blockedUntil - now) / 1000);
    return { allowed: false, remainingSec };
  }

  if (now - record.firstFailureTime > RECOVERY_BLOCK_MS) {
    recoveryRateLimitMap.delete(key);
    return { allowed: true };
  }

  return { allowed: true };
}

export function recordRecoveryFailure(req: IncomingMessage): { remainingAttempts: number; isBlocked: boolean } {
  const ip = getClientIp(req);
  const key = `recovery_${ip}`;
  const now = Date.now();
  let record = recoveryRateLimitMap.get(key);

  if (!record || now - record.firstFailureTime > RECOVERY_BLOCK_MS) {
    record = { failures: 1, firstFailureTime: now };
  } else {
    record.failures += 1;
  }

  if (record.failures >= MAX_RECOVERY_FAILURES) {
    record.blockedUntil = now + RECOVERY_BLOCK_MS;
    recoveryRateLimitMap.set(key, record);
    return { remainingAttempts: 0, isBlocked: true };
  }

  recoveryRateLimitMap.set(key, record);
  return { remainingAttempts: MAX_RECOVERY_FAILURES - record.failures, isBlocked: false };
}

export function clearRecoveryFailures(req: IncomingMessage): void {
  const ip = getClientIp(req);
  const key = `recovery_${ip}`;
  recoveryRateLimitMap.delete(key);
}

export function resetRecoveryRateLimitsForTesting(): void {
  recoveryRateLimitMap.clear();
  loginRateLimitMap.clear();
}

// Issue a short-lived, single-use recovery ticket upon valid recoveryKey verification
export function issueRecoveryTicket(
  req: IncomingMessage,
  recoveryKey: string,
  email?: string
): { success: boolean; error?: string; ticket?: string } {
  const rate = checkRecoveryRateLimit(req);
  if (!rate.allowed) {
    return {
      success: false,
      error: `גישת השחזור נחסמה זמנית עקב ניסיונות כושלים. אנא נסה שוב בעוד ${rate.remainingSec} שניות.`,
    };
  }

  if (!isOwnerRecoveryEnabled()) {
    return {
      success: false,
      error: 'שחזור חשבון בעלים אינו מופעל בשרת (לא הוגדר מפתח שחזור מאובטח ב-OWNER_RECOVERY_KEY).',
    };
  }

  const cleanKey = (recoveryKey || '').trim();
  if (!cleanKey || !verifySetupToken(cleanKey)) {
    const failInfo = recordRecoveryFailure(req);
    return {
      success: false,
      error: failInfo.isBlocked
        ? 'מפתח שחזור שגוי. גישת השחזור נחסמה זמנית ל-30 דקות עקב ריבוי ניסיונות שגויים.'
        : `מפתח שחזור שגוי. נותרו ${failInfo.remainingAttempts} ניסיונות לפני נעילה זמנית.`,
    };
  }

  clearRecoveryFailures(req);
  const owner = getOwnerAccount();
  const targetEmail = (email || '').trim().toLowerCase() || (owner ? owner.email.toLowerCase() : 'amit2001tal@gmail.com');

  const ticketId = `rec_${crypto.randomBytes(32).toString('hex')}`;
  const now = Date.now();
  recoveryTickets.set(ticketId, {
    id: ticketId,
    email: targetEmail,
    createdAt: now,
    expiresAt: now + RECOVERY_TICKET_TTL_MS,
    used: false,
  });

  return { success: true, ticket: ticketId };
}

// Complete recovery using single-use ticket or direct verified recovery key
export function recoverOwnerAccount(params: {
  req: IncomingMessage;
  recoveryKey?: string;
  ticket?: string;
  newPassword: string;
  email?: string;
}): { success: boolean; error?: string; owner?: OwnerAccount } {
  const { req, recoveryKey, ticket, newPassword, email } = params;
  const cleanPass = (newPassword || '').trim();

  if (!cleanPass || cleanPass.length < 8) {
    return {
      success: false,
      error: 'הסיסמה החדשה חייבת להכיל לפחות 8 תווים',
    };
  }

  let targetEmail = (email || '').trim().toLowerCase();

  // Mode 1: Single-use ticket
  if (ticket) {
    const ticketRecord = recoveryTickets.get(ticket.trim());
    if (!ticketRecord) {
      return { success: false, error: 'כרטיס שחזור חד-פעמי אינו קיים או שפג תוקפו' };
    }
    if (ticketRecord.used) {
      recoveryTickets.delete(ticket.trim());
      return { success: false, error: 'כרטיס שחזור זה כבר נוצל ואינו תקף שנית' };
    }
    if (ticketRecord.expiresAt < Date.now()) {
      recoveryTickets.delete(ticket.trim());
      return { success: false, error: 'תוקף כרטיס השחזור פג (מוגבל ל-10 דקות)' };
    }
    ticketRecord.used = true;
    recoveryTickets.delete(ticket.trim());
    targetEmail = ticketRecord.email;
  } else if (recoveryKey) {
    // Mode 2: Direct recovery key check with rate-limiting
    const ticketRes = issueRecoveryTicket(req, recoveryKey, email);
    if (!ticketRes.success || !ticketRes.ticket) {
      return { success: false, error: ticketRes.error || 'אימות מפתח שחזור נכשל' };
    }
    const ticketRecord = recoveryTickets.get(ticketRes.ticket);
    if (ticketRecord) {
      ticketRecord.used = true;
      recoveryTickets.delete(ticketRes.ticket);
    }
  } else {
    return { success: false, error: 'נדרש כרטיס שחזור חד-פעמי או מפתח שחזור מאובטח' };
  }

  const existingOwner = getOwnerAccount();
  const finalEmail = targetEmail || (existingOwner ? existingOwner.email.toLowerCase() : 'amit2001tal@gmail.com');

  const salt = crypto.randomBytes(32).toString('hex');
  const passwordHash = hashPassword(cleanPass, salt);
  const nowIso = new Date().toISOString();

  const updatedOwner: OwnerAccount = {
    email: finalEmail,
    passwordHash,
    salt,
    createdAt: existingOwner?.createdAt || nowIso,
    lastLoginAt: nowIso,
  };

  saveOwnerAccount(updatedOwner);

  // Crucial: Invalidate ALL existing active sessions so no stale or unauthorized sessions remain valid
  invalidateAllSessions();
  clearLoginFailures(req, finalEmail);
  clearRecoveryFailures(req);

  return { success: true, owner: updatedOwner };
}

// Save owner account
export function saveOwnerAccount(account: OwnerAccount): void {
  ensureAuthStore();
  const authFile = getAuthFile();
  const content = JSON.stringify(account, null, 2);
  fs.writeFileSync(authFile, content, 'utf8');
  persistFilePath(authFile, content);
}

// Password hashing
export function hashPassword(password: string, salt: string): string {
  return crypto.pbkdf2Sync(password, salt, 100000, 64, 'sha512').toString('hex');
}

export function verifyPassword(password: string, hash: string, salt: string): boolean {
  try {
    const computed = hashPassword(password, salt);
    return crypto.timingSafeEqual(Buffer.from(computed, 'hex'), Buffer.from(hash, 'hex'));
  } catch {
    return false;
  }
}

// Read sessions
function readSessions(): Record<string, SessionRecord> {
  ensureAuthStore();
  const sessionsFile = getSessionsFile();
  if (!fs.existsSync(sessionsFile)) {
    return {};
  }
  try {
    const raw = fs.readFileSync(sessionsFile, 'utf8');
    const sessions: Record<string, SessionRecord> = JSON.parse(raw);
    // Purge expired sessions
    const now = Date.now();
    let modified = false;
    for (const [token, s] of Object.entries(sessions)) {
      if (s.expiresAt < now) {
        delete sessions[token];
        modified = true;
      }
    }
    if (modified) {
      writeSessions(sessions);
    }
    return sessions;
  } catch {
    return {};
  }
}

function writeSessions(sessions: Record<string, SessionRecord>): void {
  ensureAuthStore();
  const sessionsFile = getSessionsFile();
  const content = JSON.stringify(sessions, null, 2);
  fs.writeFileSync(sessionsFile, content, 'utf8');
  persistFilePath(sessionsFile, content);
}

// Create new session - generates cryptographically tamper-proof HMAC tokens
export function createSession(email: string, ip?: string, userAgent?: string): string {
  const now = Date.now();
  const expiresAt = now + SESSION_TTL_MS;
  const payload = `${email.toLowerCase()}|${now}|${expiresAt}`;
  const sig = crypto.createHmac('sha256', SESSION_SECRET).update(payload).digest('hex');
  const token = `at_${Buffer.from(payload).toString('base64url')}_${sig}`;

  const session: SessionRecord = {
    token,
    email: email.toLowerCase(),
    createdAt: now,
    expiresAt,
    ip,
    userAgent,
  };
  try {
    const sessions = readSessions();
    sessions[token] = session;
    writeSessions(sessions);
  } catch {}
  return token;
}

// In-memory revoked tokens (for explicit logouts)
const revokedTokens = new Set<string>();

// Validate session with dual-layer verification (file-backed + HMAC signature fallback across container restarts)
export function validateSessionToken(token: string): SessionRecord | null {
  if (!token) return null;
  if (revokedTokens.has(token)) return null;

  // 1. Check local session file store
  try {
    const sessions = readSessions();
    const session = sessions[token];
    if (session) {
      if (session.expiresAt < Date.now()) {
        delete sessions[token];
        writeSessions(sessions);
        return null;
      }
      return session;
    }
  } catch {}

  // 2. Fallback to stateless HMAC verification if container restarted and wiped ephemeral sessions.json
  if (token.startsWith('at_')) {
    try {
      const parts = token.split('_');
      if (parts.length === 3) {
        const payloadBase64 = parts[1];
        const clientSig = parts[2];
        const payload = Buffer.from(payloadBase64, 'base64url').toString('utf8');
        const expectedSig = crypto.createHmac('sha256', SESSION_SECRET).update(payload).digest('hex');

        if (
          clientSig.length === expectedSig.length &&
          crypto.timingSafeEqual(Buffer.from(clientSig), Buffer.from(expectedSig))
        ) {
          const [email, createdAtStr, expiresAtStr] = payload.split('|');
          const expiresAt = parseInt(expiresAtStr, 10);
          const createdAt = parseInt(createdAtStr, 10);
          if (expiresAt > Date.now()) {
            return {
              token,
              email,
              createdAt,
              expiresAt,
            };
          }
        }
      }
    } catch {}
  }

  return null;
}

// Invalidate session (logout)
export function destroySession(token: string): void {
  if (!token) return;
  revokedTokens.add(token);
  try {
    const sessions = readSessions();
    if (sessions[token]) {
      delete sessions[token];
      writeSessions(sessions);
    }
  } catch {}
}

// Invalidate ALL sessions across the entire system (on password reset / recovery)
export function invalidateAllSessions(): void {
  ensureAuthStore();
  try {
    const sessions = readSessions();
    for (const token of Object.keys(sessions)) {
      revokedTokens.add(token);
    }
    writeSessions({});
  } catch {}
}

// Cookie helpers
export function parseSessionCookie(req: IncomingMessage): string | null {
  const cookieHeader = req.headers.cookie;
  if (!cookieHeader) return null;
  const cookies = cookieHeader.split(';').map(c => c.trim());
  const prefix = 'amit_session=';
  const found = cookies.find(c => c.startsWith(prefix));
  if (!found) return null;
  return found.substring(prefix.length).trim();
}

export function setSessionCookie(res: ServerResponse, token: string, isHttps = false): void {
  const maxAgeSec = Math.floor(SESSION_TTL_MS / 1000);
  const secureFlag = isHttps ? '; Secure' : '';
  const cookieVal = `amit_session=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAgeSec}${secureFlag}`;
  res.setHeader('Set-Cookie', cookieVal);
}

export function clearSessionCookie(res: ServerResponse): void {
  res.setHeader('Set-Cookie', 'amit_session=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0');
}

// Abuse Protection / Rate Limiting
function getClientIp(req: IncomingMessage): string {
  const forwarded = req.headers['x-forwarded-for'];
  if (typeof forwarded === 'string') {
    return forwarded.split(',')[0].trim();
  }
  return req.socket.remoteAddress || 'unknown';
}

export function checkLoginRateLimit(req: IncomingMessage, email: string): { allowed: boolean; remainingSec?: number } {
  const ip = getClientIp(req);
  const key = `${ip}_${email.trim().toLowerCase()}`;
  const record = loginRateLimitMap.get(key);
  if (!record) return { allowed: true };

  const now = Date.now();
  if (record.blockedUntil && record.blockedUntil > now) {
    const remainingSec = Math.ceil((record.blockedUntil - now) / 1000);
    return { allowed: false, remainingSec };
  }

  // Clear old window
  if (now - record.firstFailureTime > RATE_LIMIT_WINDOW_MS) {
    loginRateLimitMap.delete(key);
    return { allowed: true };
  }

  return { allowed: true };
}

export function recordLoginFailure(req: IncomingMessage, email: string): { remainingAttempts: number; isBlocked: boolean } {
  const ip = getClientIp(req);
  const key = `${ip}_${email.trim().toLowerCase()}`;
  const now = Date.now();
  let record = loginRateLimitMap.get(key);

  if (!record || now - record.firstFailureTime > RATE_LIMIT_WINDOW_MS) {
    record = { failures: 1, firstFailureTime: now };
  } else {
    record.failures += 1;
  }

  if (record.failures >= MAX_LOGIN_FAILURES) {
    record.blockedUntil = now + BLOCK_DURATION_MS;
    loginRateLimitMap.set(key, record);
    return { remainingAttempts: 0, isBlocked: true };
  }

  loginRateLimitMap.set(key, record);
  return { remainingAttempts: MAX_LOGIN_FAILURES - record.failures, isBlocked: false };
}

export function clearLoginFailures(req: IncomingMessage, email: string): void {
  const ip = getClientIp(req);
  const key = `${ip}_${email.trim().toLowerCase()}`;
  loginRateLimitMap.delete(key);
}

// Request Auth Check Helper
export function authenticateRequest(req: IncomingMessage): { authenticated: boolean; email?: string } {
  const token = parseSessionCookie(req);
  if (!token) return { authenticated: false };
  const session = validateSessionToken(token);
  if (!session) return { authenticated: false };
  return { authenticated: true, email: session.email };
}
