import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import type { IncomingMessage, ServerResponse } from 'http';

const DATA_DIR = path.resolve(process.cwd(), 'data');
const AUTH_FILE = path.join(DATA_DIR, 'auth.json');
const SESSIONS_FILE = path.join(DATA_DIR, 'sessions.json');

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

const MAX_LOGIN_FAILURES = 5;
const RATE_LIMIT_WINDOW_MS = 15 * 60 * 1000; // 15 minutes
const BLOCK_DURATION_MS = 15 * 60 * 1000; // 15 minutes lockout
const SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

// Helper: Ensure auth storage files exist
function ensureAuthStore(): void {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
}

// Read owner account
let inMemorySetupToken: string | null = null;
const SETUP_TOKEN_FILE = path.join(DATA_DIR, '.setup_token');

export function getOrCreateSetupToken(): string | null {
  // If owner already exists, no setup token needed
  if (getOwnerAccount()) {
    return null;
  }
  if (process.env.SETUP_TOKEN) {
    return process.env.SETUP_TOKEN.trim();
  }
  if (inMemorySetupToken) {
    return inMemorySetupToken;
  }
  if (fs.existsSync(SETUP_TOKEN_FILE)) {
    try {
      const stored = fs.readFileSync(SETUP_TOKEN_FILE, 'utf8').trim();
      if (stored) {
        inMemorySetupToken = stored;
        return stored;
      }
    } catch {}
  }
  // Generate a cryptographically secure 256-bit token
  const token = crypto.randomBytes(32).toString('hex');
  inMemorySetupToken = token;
  try {
    fs.writeFileSync(SETUP_TOKEN_FILE, token, { mode: 0o600 });
  } catch {}
  console.log('========================================================================');
  console.log('[AMIT TOUCH SECURITY] FIRST-TIME OWNER SETUP IS REQUIRED.');
  console.log(`[AMIT TOUCH SECURITY] Private Setup Token: ${token}`);
  console.log('[AMIT TOUCH SECURITY] Keep this token private. It is required to claim initial ownership.');
  console.log('========================================================================');
  return token;
}

export function verifySetupToken(inputToken: string): boolean {
  const activeToken = getOrCreateSetupToken();
  if (!activeToken || !inputToken) return false;
  try {
    const a = Buffer.from(inputToken.trim(), 'utf8');
    const b = Buffer.from(activeToken.trim(), 'utf8');
    if (a.length !== b.length) return false;
    return crypto.timingSafeEqual(a, b);
  } catch {
    return false;
  }
}

export function consumeSetupToken(): void {
  inMemorySetupToken = null;
  if (fs.existsSync(SETUP_TOKEN_FILE)) {
    try { fs.unlinkSync(SETUP_TOKEN_FILE); } catch {}
  }
}

export function getOwnerAccount(): OwnerAccount | null {
  ensureAuthStore();
  if (!fs.existsSync(AUTH_FILE)) {
    // Check environment variable fallback
    const envEmail = process.env.OWNER_EMAIL || process.env.ADMIN_EMAIL;
    const envPass = process.env.OWNER_PASSWORD || process.env.ADMIN_PASSWORD;
    if (envEmail && envPass) {
      const salt = crypto.randomBytes(32).toString('hex');
      const hash = hashPassword(envPass, salt);
      const initialOwner: OwnerAccount = {
        email: envEmail.trim().toLowerCase(),
        passwordHash: hash,
        salt,
        createdAt: new Date().toISOString(),
      };
      saveOwnerAccount(initialOwner);
      return initialOwner;
    }
    return null;
  }
  try {
    return JSON.parse(fs.readFileSync(AUTH_FILE, 'utf8'));
  } catch {
    return null;
  }
}

// Save owner account
export function saveOwnerAccount(account: OwnerAccount): void {
  ensureAuthStore();
  fs.writeFileSync(AUTH_FILE, JSON.stringify(account, null, 2), 'utf8');
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
  if (!fs.existsSync(SESSIONS_FILE)) {
    return {};
  }
  try {
    const raw = fs.readFileSync(SESSIONS_FILE, 'utf8');
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
      fs.writeFileSync(SESSIONS_FILE, JSON.stringify(sessions, null, 2), 'utf8');
    }
    return sessions;
  } catch {
    return {};
  }
}

function writeSessions(sessions: Record<string, SessionRecord>): void {
  ensureAuthStore();
  fs.writeFileSync(SESSIONS_FILE, JSON.stringify(sessions, null, 2), 'utf8');
}

// Create new session
export function createSession(email: string, ip?: string, userAgent?: string): string {
  const token = crypto.randomBytes(32).toString('hex');
  const now = Date.now();
  const session: SessionRecord = {
    token,
    email,
    createdAt: now,
    expiresAt: now + SESSION_TTL_MS,
    ip,
    userAgent,
  };
  const sessions = readSessions();
  sessions[token] = session;
  writeSessions(sessions);
  return token;
}

// Validate session
export function validateSessionToken(token: string): SessionRecord | null {
  if (!token) return null;
  const sessions = readSessions();
  const session = sessions[token];
  if (!session) return null;
  if (session.expiresAt < Date.now()) {
    delete sessions[token];
    writeSessions(sessions);
    return null;
  }
  return session;
}

// Invalidate session (logout)
export function destroySession(token: string): void {
  if (!token) return;
  const sessions = readSessions();
  if (sessions[token]) {
    delete sessions[token];
    writeSessions(sessions);
  }
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
