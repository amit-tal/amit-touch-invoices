import fs from 'fs';
import path from 'path';
import nodemailer from 'nodemailer';

const DATA_DIR = path.resolve(process.cwd(), 'data');
const GMAIL_TOKENS_FILE = path.join(DATA_DIR, 'gmailTokens.json');

export interface GmailTokenData {
  connected: boolean;
  email: string;
  accessToken: string;
  refreshToken: string;
  expiresAt: number; // epoch timestamp in ms
  connectedAt: string;
  scope?: string;
}

export interface GmailOAuthStatus {
  isConfigured: boolean; // Has GMAIL_CLIENT_ID and GMAIL_CLIENT_SECRET
  isConnected: boolean; // Has valid refresh token
  connectedEmail?: string;
  connectedAt?: string;
  missingEnv: string[];
}

/**
 * Read stored Gmail tokens from data/gmailTokens.json
 */
export function getStoredGmailTokens(): GmailTokenData | null {
  if (!fs.existsSync(GMAIL_TOKENS_FILE)) {
    return null;
  }
  try {
    const raw = fs.readFileSync(GMAIL_TOKENS_FILE, 'utf8');
    const data = JSON.parse(raw);
    if (data && data.connected && data.refreshToken) {
      return data;
    }
    return null;
  } catch {
    return null;
  }
}

/**
 * Save Gmail tokens to data/gmailTokens.json
 */
export function saveGmailTokens(tokens: GmailTokenData): void {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
  fs.writeFileSync(GMAIL_TOKENS_FILE, JSON.stringify(tokens, null, 2), {
    encoding: 'utf8',
    mode: 0o600,
  });
}

/**
 * Clear stored Gmail tokens (disconnect)
 */
export function clearGmailTokens(): void {
  if (fs.existsSync(GMAIL_TOKENS_FILE)) {
    try {
      fs.unlinkSync(GMAIL_TOKENS_FILE);
    } catch {}
  }
}

/**
 * Get OAuth client credentials from environment
 */
export function getGoogleOAuthCredentials() {
  const clientId = process.env.GMAIL_CLIENT_ID?.trim() || '';
  const clientSecret = process.env.GMAIL_CLIENT_SECRET?.trim() || '';
  return { clientId, clientSecret };
}

/**
 * Determine redirect URI based on explicit env or request origin
 */
export function getRedirectUri(origin?: string): string {
  if (process.env.GMAIL_REDIRECT_URI?.trim()) {
    return process.env.GMAIL_REDIRECT_URI.trim();
  }
  const base = (
    origin ||
    process.env.APP_BASE_URL ||
    process.env.RENDER_EXTERNAL_URL ||
    `http://localhost:${process.env.PORT || '3000'}`
  ).replace(/\/+$/, '');
  return `${base}/api/auth/google/callback`;
}

/**
 * Check overall Gmail OAuth status
 */
export function getGmailOAuthStatus(): GmailOAuthStatus {
  const { clientId, clientSecret } = getGoogleOAuthCredentials();
  const missingEnv: string[] = [];

  if (!clientId) missingEnv.push('GMAIL_CLIENT_ID');
  if (!clientSecret) missingEnv.push('GMAIL_CLIENT_SECRET');

  const tokens = getStoredGmailTokens();
  const isConnected = !!(tokens && tokens.connected && tokens.refreshToken);

  return {
    isConfigured: missingEnv.length === 0,
    isConnected,
    connectedEmail: tokens?.email,
    connectedAt: tokens?.connectedAt,
    missingEnv,
  };
}

/**
 * Generate Google OAuth2 authorization URL
 */
export function getGoogleAuthUrl(origin?: string): string {
  const { clientId } = getGoogleOAuthCredentials();
  if (!clientId) {
    throw new Error('משתנה סביבה GMAIL_CLIENT_ID אינו מוגדר בשרת');
  }

  const redirectUri = getRedirectUri(origin);

  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: 'code',
    scope: 'https://www.googleapis.com/auth/gmail.send email openid',
    access_type: 'offline',
    prompt: 'consent', // Forces Google to issue a refresh_token
    include_granted_scopes: 'true',
  });

  return `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`;
}

/**
 * Exchange authorization code for tokens and extract authenticated email
 */
export function parseJwtPayload(token: string): any {
  try {
    const parts = token.split('.');
    if (parts.length < 2) return null;
    const base64 = parts[1].replace(/-/g, '+').replace(/_/g, '/');
    return JSON.parse(Buffer.from(base64, 'base64').toString('utf8'));
  } catch {
    return null;
  }
}

export async function exchangeCodeForTokens(code: string, origin?: string): Promise<GmailTokenData> {
  const { clientId, clientSecret } = getGoogleOAuthCredentials();
  if (!clientId || !clientSecret) {
    throw new Error('משתני GMAIL_CLIENT_ID או GMAIL_CLIENT_SECRET חסרים בשרת');
  }

  const redirectUri = getRedirectUri(origin);

  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      code,
      client_id: clientId,
      client_secret: clientSecret,
      redirect_uri: redirectUri,
      grant_type: 'authorization_code',
    }),
  });

  const data: any = await res.json().catch(() => ({}));
  if (!res.ok) {
    const desc = data.error_description || data.error || JSON.stringify(data);
    throw new Error(`שגיאה באימות קוד Google OAuth: ${desc}`);
  }

  // Extract email address
  let email = '';
  if (data.id_token) {
    const payload = parseJwtPayload(data.id_token);
    if (payload?.email) {
      email = payload.email.toLowerCase();
    }
  }

  // Fallback to userinfo API if needed
  if (!email && data.access_token) {
    try {
      const userRes = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', {
        headers: { Authorization: `Bearer ${data.access_token}` },
      });
      if (userRes.ok) {
        const udata: any = await userRes.json();
        if (udata.email) email = udata.email.toLowerCase();
      }
    } catch {}
  }

  if (!email) {
    email = (process.env.OWNER_EMAIL || 'amit2001tal@gmail.com').toLowerCase();
  }

  const existing = getStoredGmailTokens();
  const refreshToken = data.refresh_token || existing?.refreshToken;

  if (!refreshToken) {
    throw new Error('Google לא החזיר refresh_token. נסה לנתק ולחבר מחדש עם הרשאת prompt=consent.');
  }

  const tokenRecord: GmailTokenData = {
    connected: true,
    email,
    accessToken: data.access_token,
    refreshToken,
    expiresAt: Date.now() + ((data.expires_in || 3600) * 1000) - (60 * 1000), // 1 min buffer
    connectedAt: new Date().toISOString(),
    scope: data.scope,
  };

  saveGmailTokens(tokenRecord);
  return tokenRecord;
}

/**
 * Get valid access token, automatically refreshing if expired
 */
export async function getValidGmailAccessToken(): Promise<{ accessToken: string; email: string }> {
  const tokens = getStoredGmailTokens();
  if (!tokens || !tokens.connected || !tokens.refreshToken) {
    throw new Error('חשבון Gmail אינו מחובר. יש לבצע "חיבור לחשבון Gmail" בהגדרות.');
  }

  // Check if current access token is still fresh
  if (tokens.accessToken && tokens.expiresAt && tokens.expiresAt > Date.now()) {
    return { accessToken: tokens.accessToken, email: tokens.email };
  }

  // Refresh the token
  const { clientId, clientSecret } = getGoogleOAuthCredentials();
  if (!clientId || !clientSecret) {
    throw new Error('משתני GMAIL_CLIENT_ID או GMAIL_CLIENT_SECRET חסרים בשרת לביצוע רענון');
  }

  console.log(`[GMAIL_API] Access token expired. Refreshing token for <${tokens.email}>...`);

  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      refresh_token: tokens.refreshToken,
      grant_type: 'refresh_token',
    }),
  });

  const data: any = await res.json().catch(() => ({}));
  if (!res.ok) {
    const desc = data.error_description || data.error || JSON.stringify(data);
    throw new Error(`שגיאה ברענון גישת Gmail API מול Google: ${desc}`);
  }

  tokens.accessToken = data.access_token;
  tokens.expiresAt = Date.now() + ((data.expires_in || 3600) * 1000) - (60 * 1000);
  if (data.refresh_token) {
    tokens.refreshToken = data.refresh_token;
  }

  saveGmailTokens(tokens);
  return { accessToken: tokens.accessToken, email: tokens.email };
}

/**
 * Build RFC 2822 MIME message and send via Gmail API (POST https://gmail.googleapis.com/gmail/v1/users/me/messages/send)
 */
export interface SendGmailApiOptions {
  from: string;
  to: string;
  bcc?: string;
  subject: string;
  text: string;
  html: string;
  attachments?: Array<{
    filename: string;
    content: Buffer | string;
    contentType?: string;
    cid?: string;
    path?: string;
  }>;
}

export async function sendEmailViaGmailApi(options: SendGmailApiOptions): Promise<{ messageId: string; threadId: string }> {
  const { accessToken } = await getValidGmailAccessToken();

  // 1. Build authentic RFC 2822 message buffer using Nodemailer streamTransport
  const mailOptions: any = {
    from: options.from,
    to: options.to,
    subject: options.subject,
    text: options.text,
    html: options.html,
    attachments: options.attachments,
  };

  if (options.bcc) {
    mailOptions.bcc = options.bcc;
  }

  const transporter = nodemailer.createTransport({
    streamTransport: true,
    buffer: true,
  });

  const info: any = await transporter.sendMail(mailOptions);
  const rawBuffer: Buffer = info.message;
  const rawBase64Url = rawBuffer.toString('base64url');

  console.log(`[GMAIL_API] Sending RFC 2822 message (${rawBuffer.length} bytes) via Gmail REST API (Port 443)...`);

  // 2. Dispatch to Gmail REST API
  const res = await fetch('https://gmail.googleapis.com/gmail/v1/users/me/messages/send', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ raw: rawBase64Url }),
  });

  const resJson: any = await res.json().catch(() => ({}));
  if (!res.ok) {
    const errorDetails = resJson.error?.message || JSON.stringify(resJson);
    console.error(`[GMAIL_API] Error from Google (${res.status}):`, errorDetails);
    throw new Error(`שגיאה בשליחת דוא״ל דרך Gmail API (${res.status}): ${errorDetails}`);
  }

  console.log(`[GMAIL_API] Message successfully accepted by Gmail API. ID: ${resJson.id}, ThreadId: ${resJson.threadId}`);

  return {
    messageId: resJson.id || `gmail_${Date.now()}`,
    threadId: resJson.threadId,
  };
}
