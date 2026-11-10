import fs from 'fs';
import path from 'path';
import nodemailer from 'nodemailer';
import type { AppDocument, BusinessSettings } from '../src/types/documents.ts';
import { 
  getStoredGmailTokens, 
  getGmailOAuthStatus, 
  sendEmailViaGmailApi 
} from './gmailService.ts';

const DATA_DIR = path.resolve(process.cwd(), 'data');
const EMAIL_CONFIG_FILE = path.join(DATA_DIR, 'emailConfig.json');

export type EmailProviderType = 'gmail' | 'resend' | 'brevo' | 'sendgrid' | 'smtp' | 'none';

export interface EmailConfig {
  provider: EmailProviderType;
  fromEmail: string;
  fromName: string;
  smtp?: {
    host: string;
    port: number;
    secure: boolean;
    user: string;
    pass: string;
  };
  resendApiKey?: string;
  brevoApiKey?: string;
  sendgridApiKey?: string;
}

// In-flight sending locks to prevent duplicate sends from repeated clicks
const inFlightSends = new Set<string>();

// Optional test transporter override (used for deterministic unit/integration testing)
let _customSmtpTransporter: any = null;
export function setCustomSmtpTransporter(t: any): void {
  _customSmtpTransporter = t;
}

/**
 * Load email configuration from environment variables or data/emailConfig.json
 */
export function getEmailConfig(): EmailConfig {
  let fileConfig: Partial<EmailConfig> = {};
  if (fs.existsSync(EMAIL_CONFIG_FILE)) {
    try {
      fileConfig = JSON.parse(fs.readFileSync(EMAIL_CONFIG_FILE, 'utf8'));
    } catch {
      fileConfig = {};
    }
  }

  const envProvider = (process.env.EMAIL_PROVIDER || '').trim().toLowerCase() as EmailProviderType;
  const envResendApiKey = process.env.RESEND_API_KEY?.trim();
  const envBrevoApiKey = process.env.BREVO_API_KEY?.trim();
  const envSendgridApiKey = process.env.SENDGRID_API_KEY?.trim();

  const envSmtpHost = process.env.SMTP_HOST?.trim();
  const envSmtpPort = process.env.SMTP_PORT ? parseInt(process.env.SMTP_PORT, 10) : undefined;
  const envSmtpUser = process.env.SMTP_USER?.trim();
  const envSmtpPass = process.env.SMTP_PASS?.trim();
  const envSmtpSecure = process.env.SMTP_SECURE === 'true' || (envSmtpPort === 465);

  const envFromEmail = process.env.EMAIL_FROM?.trim() || fileConfig.fromEmail || '';
  const envFromName = process.env.EMAIL_FROM_NAME?.trim() || fileConfig.fromName || 'AMIT TOUCH';

  const resendApiKey = envResendApiKey || fileConfig.resendApiKey || '';
  const brevoApiKey = envBrevoApiKey || fileConfig.brevoApiKey || '';
  const sendgridApiKey = envSendgridApiKey || fileConfig.sendgridApiKey || '';

  const gmailTokens = getStoredGmailTokens();
  const isGmailActive = !!(gmailTokens?.connected && gmailTokens?.refreshToken);

  // Smart provider resolution:
  // 1. Explicit EMAIL_PROVIDER environment variable takes precedence
  // 2. Otherwise stored fileConfig if not 'none'
  // 3. Otherwise connected Gmail OAuth account
  // 4. Otherwise HTTPS API key present (Resend -> Brevo -> SendGrid)
  // 5. Otherwise SMTP environment variables
  let provider: EmailProviderType = 'none';

  if (envProvider && ['gmail', 'resend', 'brevo', 'sendgrid', 'smtp', 'none'].includes(envProvider)) {
    provider = envProvider;
  } else if (fileConfig.provider && fileConfig.provider !== 'none') {
    provider = fileConfig.provider;
  } else if (isGmailActive) {
    provider = 'gmail';
  } else if (resendApiKey) {
    provider = 'resend';
  } else if (brevoApiKey) {
    provider = 'brevo';
  } else if (sendgridApiKey) {
    provider = 'sendgrid';
  } else if (envSmtpHost && envSmtpUser && envSmtpPass) {
    provider = 'smtp';
  }

  // If using Gmail API and fromEmail is not manually overridden, use authenticated Gmail address
  const effectiveFromEmail = (provider === 'gmail' && gmailTokens?.email)
    ? (envFromEmail || gmailTokens.email)
    : envFromEmail;

  return {
    provider,
    fromEmail: effectiveFromEmail,
    fromName: envFromName,
    resendApiKey,
    brevoApiKey,
    sendgridApiKey,
    smtp: {
      host: envSmtpHost || fileConfig.smtp?.host || '',
      port: envSmtpPort || fileConfig.smtp?.port || 587,
      secure: envSmtpSecure ?? (fileConfig.smtp?.secure ?? false),
      user: envSmtpUser || fileConfig.smtp?.user || '',
      pass: envSmtpPass || fileConfig.smtp?.pass || '',
    },
  };
}

/**
 * Save updated email configuration (called by server admin/setup endpoint)
 */
export function saveEmailConfig(config: EmailConfig): void {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
  fs.writeFileSync(EMAIL_CONFIG_FILE, JSON.stringify(config, null, 2), 'utf8');
}

export interface EmailProviderStatus {
  isConfigured: boolean;
  provider: EmailProviderType;
  fromEmail?: string;
  fromName?: string;
  smtpHost?: string;
  missingRequirements: string[];
}

/**
 * Check whether a valid provider and verified sender are configured
 */
export function checkEmailProviderStatus(): EmailProviderStatus {
  const config = getEmailConfig();
  const missingRequirements: string[] = [];

  if (!config.fromEmail || !config.fromEmail.includes('@')) {
    missingRequirements.push('כתובת שולח מאומתת (EMAIL_FROM)');
  }

  if (config.provider === 'gmail') {
    const oauthStatus = getGmailOAuthStatus();
    if (!oauthStatus.isConfigured) {
      missingRequirements.push(`הגדרות Google Cloud חסרות בשרת (${oauthStatus.missingEnv.join(', ')})`);
    }
    if (!oauthStatus.isConnected) {
      missingRequirements.push('חיבור לחשבון Gmail באמצעות כפתור "חיבור לחשבון Gmail"');
    }
  } else if (config.provider === 'smtp') {
    if (!config.smtp?.host) missingRequirements.push('כתובת שרת SMTP (SMTP_HOST)');
    if (!config.smtp?.user) missingRequirements.push('שם משתמש לשרת SMTP (SMTP_USER)');
    if (!config.smtp?.pass) missingRequirements.push('סיסמה לשרת SMTP או App Password (SMTP_PASS)');
  } else if (config.provider === 'resend') {
    if (!config.resendApiKey) missingRequirements.push('מפתח API של Resend (RESEND_API_KEY)');
  } else if (config.provider === 'brevo') {
    if (!config.brevoApiKey) missingRequirements.push('מפתח API של Brevo (BREVO_API_KEY)');
  } else if (config.provider === 'sendgrid') {
    if (!config.sendgridApiKey) missingRequirements.push('מפתח API של SendGrid (SENDGRID_API_KEY)');
  } else {
    missingRequirements.push('ספק דוא״ל מאומת (חיבור Gmail API, מפתח Resend HTTPS API, או Gmail SMTP)');
  }

  const isConfigured = missingRequirements.length === 0 && config.provider !== 'none';

  return {
    isConfigured,
    provider: config.provider,
    fromEmail: config.fromEmail,
    fromName: config.fromName,
    smtpHost: config.smtp?.host,
    missingRequirements,
  };
}

export interface SendDocumentEmailParams {
  document: AppDocument;
  business: BusinessSettings;
  recipient: string;
  bcc?: string;
  subject: string;
  messageBody: string;
  pdfBuffer: Buffer;
  pdfFilename: string;
}

export interface SendDocumentEmailResult {
  success: boolean;
  provider: string;
  providerMessageId: string;
  sentAt: string;
  recipient: string;
  bcc?: string;
  subject: string;
  pdfFilename: string;
  previewUrl?: string;
}

/**
 * Generate formatted HTML email body
 */
function escapeHtml(str: string): string {
  if (!str) return '';
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/**
 * Generate clean, refined AMIT TOUCH branded HTML email
 */
function buildHtmlEmail(params: SendDocumentEmailParams): string {
  const { business, messageBody } = params;

  // Split into paragraphs by blank lines (\n\n or \r\n\r\n)
  const paragraphBlocks = messageBody
    .split(/\r?\n\s*\r?\n/)
    .map(block => block.trim())
    .filter(Boolean);

  const formattedParagraphs = paragraphBlocks
    .map(block => {
      const lines = block.split(/\r?\n/).map(line => escapeHtml(line.trim()));
      return `<p style="margin: 0 0 16px 0; line-height: 1.65; color: #2B1816; font-size: 15px;">${lines.join('<br />')}</p>`;
    })
    .join('\n');

  const businessDisplayName = escapeHtml(business.legalName || business.tradingName || 'AMIT TOUCH');
  const businessNumberStr = business.businessNumber ? escapeHtml(business.businessNumber) : '';

  const baseUrl = process.env.APP_BASE_URL || process.env.RENDER_EXTERNAL_URL;
  const logoSrc = baseUrl
    ? `${baseUrl.replace(/\/+$/, '')}/amit-touch-logo.png`
    : 'cid:amit-touch-logo@amittouch';

  return `
<!DOCTYPE html>
<html dir="rtl" lang="he" xmlns="http://www.w3.org/1999/xhtml">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta http-equiv="X-UA-Compatible" content="IE=edge">
  <meta name="color-scheme" content="light dark">
  <meta name="supported-color-schemes" content="light dark">
  <title>${escapeHtml(params.subject)}</title>
  <!--[if mso]>
  <noscript>
    <xml>
      <o:OfficeDocumentSettings>
        <o:PixelsPerInch>96</o:PixelsPerInch>
      </o:OfficeDocumentSettings>
    </xml>
  </noscript>
  <![endif]-->
  <style>
    @import url('https://fonts.googleapis.com/css2?family=Heebo:wght@400;500;600;700&display=swap');

    body, table, td, p, a, span, div {
      font-family: 'Heebo', Arial, Helvetica, sans-serif !important;
      -webkit-text-size-adjust: 100%;
      -ms-text-size-adjust: 100%;
      box-sizing: border-box;
    }
    body {
      margin: 0 !important;
      padding: 0 !important;
      background-color: #F8F6F5;
      color: #2B1816;
    }
    @media only screen and (max-width: 600px) {
      body {
        padding: 12px 6px !important;
      }
      .email-card-table {
        width: 100% !important;
        max-width: 100% !important;
        border-radius: 10px !important;
      }
      .email-card-header {
        padding: 20px 16px 16px 16px !important;
      }
      .email-card-body {
        padding: 20px 18px 20px 18px !important;
      }
      .email-footer-cell {
        padding: 16px 18px !important;
      }
    }
    @media (prefers-color-scheme: dark) {
      body, .email-bg-table {
        background-color: #1E1A19 !important;
        color: #F5EFEB !important;
      }
      .email-card-table {
        background-color: #272221 !important;
        border-color: #443836 !important;
      }
      .email-card-cell {
        background-color: #272221 !important;
      }
      .email-content-text p {
        color: #F5EFEB !important;
      }
      .email-notice-box {
        background-color: #2D2625 !important;
        border-color: #554442 !important;
        color: #E2CECC !important;
      }
      .email-footer-cell {
        background-color: #201C1B !important;
        border-color: #382E2C !important;
        color: #BDB0AE !important;
      }
      .email-footer-title {
        color: #EAE1DF !important;
      }
      .email-footer-phone, .email-footer-email, .email-footer-addr {
        color: #CFC1BF !important;
      }
    }
  </style>
</head>
<body style="margin: 0; padding: 28px 12px; background-color: #F8F6F5; font-family: 'Heebo', Arial, Helvetica, sans-serif; direction: rtl; text-align: right; -webkit-font-smoothing: antialiased;">
  <!-- Centered container table -->
  <table role="presentation" class="email-bg-table" width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color: #F8F6F5; margin: 0; padding: 0;">
    <tr>
      <td align="center" style="padding: 0;">
        <!-- Compact card (max-width: 580px) -->
        <table role="presentation" class="email-card-table" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width: 580px; width: 100%; margin: 0 auto; background-color: #FFFFFF; border-radius: 14px; border: 1px solid #EAE1DF; box-shadow: 0 4px 18px rgba(188, 121, 111, 0.05); overflow: hidden;">
          
          <!-- Logo Header -->
          <tr>
            <td align="center" class="email-card-cell email-card-header" style="padding: 28px 28px 20px 28px; background-color: #FFFFFF; border-bottom: 1px solid #F3ECEB;">
              <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin: 0 auto;">
                <tr>
                  <td align="center">
                    <img src="${logoSrc}" alt="AMIT TOUCH" width="120" style="display: block; width: 120px; max-width: 120px; height: auto; border: 0; outline: none; text-decoration: none;" />
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- Content Body -->
          <tr>
            <td class="email-card-cell email-card-body" style="padding: 28px 32px 24px 32px; background-color: #FFFFFF;">
              <div class="email-content-text" style="font-size: 15px; line-height: 1.65; color: #2B1816; direction: rtl; text-align: right;">
                ${formattedParagraphs}
              </div>

              <!-- Clean attachment notice -->
              <div class="email-notice-box" style="margin-top: 24px; padding: 12px 16px; background-color: #FAF6F5; border-right: 3px solid #BC796F; border-radius: 6px; font-size: 13px; color: #6E4E49; direction: rtl; text-align: right;">
                המסמך מצורף למייל כקובץ PDF
              </div>
            </td>
          </tr>

          <!-- Refined Footer -->
          <tr>
            <td class="email-footer-cell" style="padding: 20px 32px; background-color: #FAF7F6; border-top: 1px solid #EFE8E6; font-size: 12px; line-height: 1.6; color: #7D5A56; direction: rtl; text-align: right;">
              <div class="email-footer-title" style="font-weight: 700; color: #3E2421; font-size: 13px; margin-bottom: 4px;">
                ${businessDisplayName}
                ${businessNumberStr ? `<span style="font-weight: 400; color: #8C6D68; font-size: 12px;"> | ח.פ/ע.מ <bdi dir="ltr">${businessNumberStr}</bdi></span>` : ''}
              </div>
              ${business.phone ? `<div class="email-footer-phone" style="margin-top: 2px; color: #5C4542;">טלפון: <bdi dir="ltr" style="unicode-bidi: embed; font-weight: 500;">${escapeHtml(business.phone)}</bdi></div>` : ''}
              ${business.email ? `<div class="email-footer-email" style="margin-top: 2px; color: #5C4542;">דוא״ל: <bdi dir="ltr" style="unicode-bidi: embed; color: #88463F;">${escapeHtml(business.email)}</bdi></div>` : ''}
              ${business.address ? `<div class="email-footer-addr" style="margin-top: 2px; color: #7D5A56;">כתובת: ${escapeHtml(business.address)}</div>` : ''}
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>
</body>
</html>
  `.trim();
}

/**
 * Send document email through configured provider (HTTPS API or SMTP)
 */
export async function sendDocumentEmail(
  params: SendDocumentEmailParams
): Promise<SendDocumentEmailResult> {
  const { document, recipient, subject, messageBody, pdfBuffer, pdfFilename } = params;

  // 1. Prevent duplicate sends from repeated clicks (in-flight locking)
  const lockKey = `${document.id}_${recipient.trim().toLowerCase()}`;
  if (inFlightSends.has(lockKey)) {
    throw new Error('בקשת שליחה למסמך זה נמצאת כעת בעיבוד פעיל מול ספק הדוא״ל. מניעת שליחה כפולה.');
  }

  // 2. Validate provider configuration
  const status = checkEmailProviderStatus();
  if (!status.isConfigured) {
    const missing = status.missingRequirements.join(', ');
    throw new Error(
      `לא הוגדר ספק דוא״ל מאומת לשליחת מסמכים. שדות חסרים בשרת: ${missing}. יש להגדיר מפתח Resend HTTPS API ב-Render או שרת SMTP ללוקאלי. לא בוצעה סימולציה.`
    );
  }

  // 3. Validate recipient email format
  const cleanRecipient = recipient.trim();
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!cleanRecipient || !emailRegex.test(cleanRecipient)) {
    throw new Error(`כתובת הדוא״ל של הנמען אינה תקינה: "${cleanRecipient}".`);
  }

  inFlightSends.add(lockKey);
  try {
    const config = getEmailConfig();
    const html = buildHtmlEmail(params);
    const fromAddress = config.fromName ? `"${config.fromName}" <${config.fromEmail}>` : config.fromEmail;

    // 4. Resolve automatic BCC address (e.g. amit2001tal@gmail.com)
    // Automatically BCCs the studio owner on all customer-facing messages.
    // Keeps customer in To, and only adds BCC if customer is NOT already that address (prevents duplicate copy).
    const defaultOwnerBcc = 'amit2001tal@gmail.com';
    const autoBccConfig = (params.bcc || process.env.AUTO_BCC_EMAIL || process.env.OWNER_EMAIL || defaultOwnerBcc).trim();
    const effectiveBcc = (autoBccConfig && autoBccConfig.toLowerCase() !== cleanRecipient.toLowerCase())
      ? autoBccConfig
      : undefined;

    // =========================================================================
    // PROVIDER: GMAIL API (Google OAuth2 over HTTPS Port 443 - Direct from Owner Gmail)
    // =========================================================================
    if (config.provider === 'gmail') {
      console.log(`[EMAIL_SERVER] Sending document "${document.documentNumber || document.id}" to <${cleanRecipient}>${effectiveBcc ? ` (BCC: <${effectiveBcc}>)` : ''} via Gmail API (Port 443)...`);

      const logoPath = path.resolve(process.cwd(), 'public', 'amit-touch-logo.png');
      const attachments: any[] = [
        {
          filename: `${pdfFilename}.pdf`,
          content: pdfBuffer,
          contentType: 'application/pdf',
        },
      ];

      if (fs.existsSync(logoPath)) {
        attachments.push({
          filename: 'amit-touch-logo.png',
          path: logoPath,
          cid: 'amit-touch-logo@amittouch',
        });
      }

      const gmailResult = await sendEmailViaGmailApi({
        from: fromAddress,
        to: cleanRecipient,
        bcc: effectiveBcc,
        subject: subject.trim(),
        text: messageBody.trim(),
        html,
        attachments,
      });

      console.log(`[EMAIL_SERVER] Email successfully accepted by Gmail API for document "${document.documentNumber || document.id}". Message-ID: ${gmailResult.messageId}`);

      return {
        success: true,
        provider: 'gmail',
        providerMessageId: gmailResult.messageId,
        sentAt: new Date().toISOString(),
        recipient: cleanRecipient,
        bcc: effectiveBcc,
        subject: subject.trim(),
        pdfFilename,
      };
    }

    // =========================================================================
    // PROVIDER: RESEND (HTTPS REST API over Port 443 - Recommended for Render Free)
    // =========================================================================
    if (config.provider === 'resend') {
      if (!config.resendApiKey) throw new Error('מפתח API של Resend חסר (RESEND_API_KEY)');

      console.log(`[EMAIL_SERVER] Sending document "${document.documentNumber || document.id}" to <${cleanRecipient}>${effectiveBcc ? ` (BCC: <${effectiveBcc}>)` : ''} via Resend HTTPS REST API (Port 443)...`);

      const attachments = [
        {
          filename: `${pdfFilename}.pdf`,
          content: pdfBuffer.toString('base64'),
        },
      ];

      const resendPayload: any = {
        from: fromAddress,
        to: [cleanRecipient],
        subject: subject.trim(),
        text: messageBody.trim(),
        html,
        attachments,
      };

      if (effectiveBcc) {
        resendPayload.bcc = [effectiveBcc];
      }

      const res = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${config.resendApiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(resendPayload),
      });

      const resJson: any = await res.json().catch(() => ({}));
      if (!res.ok) {
        const errorDetails = resJson.message || resJson.error?.message || JSON.stringify(resJson);
        console.error(`[EMAIL_SERVER] Resend API error (${res.status}):`, errorDetails);
        throw new Error(`שגיאה בשליחת דוא״ל דרך Resend (${res.status}): ${errorDetails}`);
      }

      console.log(`[EMAIL_SERVER] Email successfully accepted by Resend for document "${document.documentNumber || document.id}". Message-ID: ${resJson.id}`);

      return {
        success: true,
        provider: 'resend',
        providerMessageId: resJson.id || `resend_${Date.now()}`,
        sentAt: new Date().toISOString(),
        recipient: cleanRecipient,
        bcc: effectiveBcc,
        subject: subject.trim(),
        pdfFilename,
      };
    }

    // =========================================================================
    // PROVIDER: BREVO (HTTPS REST API over Port 443)
    // =========================================================================
    if (config.provider === 'brevo') {
      if (!config.brevoApiKey) throw new Error('מפתח API של Brevo חסר (BREVO_API_KEY)');

      console.log(`[EMAIL_SERVER] Sending document "${document.documentNumber || document.id}" to <${cleanRecipient}>${effectiveBcc ? ` (BCC: <${effectiveBcc}>)` : ''} via Brevo HTTPS REST API (Port 443)...`);

      const brevoPayload: any = {
        sender: {
          name: config.fromName || 'AMIT TOUCH',
          email: config.fromEmail,
        },
        to: [{ email: cleanRecipient }],
        subject: subject.trim(),
        htmlContent: html,
        textContent: messageBody.trim(),
        attachment: [
          {
            name: `${pdfFilename}.pdf`,
            content: pdfBuffer.toString('base64'),
          },
        ],
      };

      if (effectiveBcc) {
        brevoPayload.bcc = [{ email: effectiveBcc }];
      }

      const res = await fetch('https://api.brevo.com/v3/smtp/email', {
        method: 'POST',
        headers: {
          'api-key': config.brevoApiKey,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(brevoPayload),
      });

      const resJson: any = await res.json().catch(() => ({}));
      if (!res.ok) {
        const errorDetails = resJson.message || JSON.stringify(resJson);
        console.error(`[EMAIL_SERVER] Brevo API error (${res.status}):`, errorDetails);
        throw new Error(`שגיאה בשליחת דוא״ל דרך Brevo (${res.status}): ${errorDetails}`);
      }

      console.log(`[EMAIL_SERVER] Email successfully accepted by Brevo for document "${document.documentNumber || document.id}". Message-ID: ${resJson.messageId}`);

      return {
        success: true,
        provider: 'brevo',
        providerMessageId: resJson.messageId || `brevo_${Date.now()}`,
        sentAt: new Date().toISOString(),
        recipient: cleanRecipient,
        bcc: effectiveBcc,
        subject: subject.trim(),
        pdfFilename,
      };
    }

    // =========================================================================
    // PROVIDER: SENDGRID (HTTPS REST API over Port 443)
    // =========================================================================
    if (config.provider === 'sendgrid') {
      if (!config.sendgridApiKey) throw new Error('מפתח API של SendGrid חסר (SENDGRID_API_KEY)');

      console.log(`[EMAIL_SERVER] Sending document "${document.documentNumber || document.id}" to <${cleanRecipient}>${effectiveBcc ? ` (BCC: <${effectiveBcc}>)` : ''} via SendGrid HTTPS REST API (Port 443)...`);

      const personalization: any = { to: [{ email: cleanRecipient }] };
      if (effectiveBcc) {
        personalization.bcc = [{ email: effectiveBcc }];
      }

      const res = await fetch('https://api.sendgrid.com/v3/mail/send', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${config.sendgridApiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          personalizations: [personalization],
          from: {
            email: config.fromEmail,
            name: config.fromName || 'AMIT TOUCH',
          },
          subject: subject.trim(),
          content: [
            { type: 'text/plain', value: messageBody.trim() },
            { type: 'text/html', value: html },
          ],
          attachments: [
            {
              content: pdfBuffer.toString('base64'),
              filename: `${pdfFilename}.pdf`,
              type: 'application/pdf',
              disposition: 'attachment',
            },
          ],
        }),
      });

      if (!res.ok) {
        const resJson: any = await res.json().catch(() => ({}));
        const errorDetails = resJson.errors?.[0]?.message || JSON.stringify(resJson);
        console.error(`[EMAIL_SERVER] SendGrid API error (${res.status}):`, errorDetails);
        throw new Error(`שגיאה בשליחת דוא״ל דרך SendGrid (${res.status}): ${errorDetails}`);
      }

      const messageId = res.headers.get('x-message-id') || `sendgrid_${Date.now()}`;
      console.log(`[EMAIL_SERVER] Email successfully accepted by SendGrid for document "${document.documentNumber || document.id}". Message-ID: ${messageId}`);

      return {
        success: true,
        provider: 'sendgrid',
        providerMessageId: messageId,
        sentAt: new Date().toISOString(),
        recipient: cleanRecipient,
        bcc: effectiveBcc,
        subject: subject.trim(),
        pdfFilename,
      };
    }

    // =========================================================================
    // PROVIDER: SMTP (Nodemailer - Preserved for Localhost / Development)
    // =========================================================================
    if (config.provider === 'smtp') {
      if (!config.smtp || !config.smtp.host) throw new Error('הגדרות SMTP חסרות בשרת');

      const transporter = _customSmtpTransporter || nodemailer.createTransport({
        host: config.smtp.host,
        port: config.smtp.port,
        secure: config.smtp.secure,
        auth: {
          user: config.smtp.user,
          pass: config.smtp.pass,
        },
      });

      // Verify SMTP transport connection before sending
      await transporter.verify();

      console.log(`[EMAIL_SERVER] Sending document "${document.documentNumber || document.id}" to <${cleanRecipient}>${effectiveBcc ? ` (BCC: <${effectiveBcc}>)` : ''} via SMTP (${config.smtp.host}:${config.smtp.port})...`);

      const logoPath = path.resolve(process.cwd(), 'public', 'amit-touch-logo.png');
      const attachments: any[] = [
        {
          filename: `${pdfFilename}.pdf`,
          content: pdfBuffer,
          contentType: 'application/pdf',
        },
      ];

      if (fs.existsSync(logoPath)) {
        attachments.push({
          filename: 'amit-touch-logo.png',
          path: logoPath,
          cid: 'amit-touch-logo@amittouch',
        });
      }

      const mailOptions: any = {
        from: fromAddress,
        to: cleanRecipient,
        subject: subject.trim(),
        text: messageBody.trim(),
        html,
        attachments,
      };

      if (effectiveBcc) {
        mailOptions.bcc = effectiveBcc;
      }

      const info = await transporter.sendMail(mailOptions);

      console.log(`[EMAIL_SERVER] Email successfully accepted by SMTP server for document "${document.documentNumber || document.id}". Message-ID: ${info.messageId}`);

      return {
        success: true,
        provider: 'smtp',
        providerMessageId: info.messageId,
        sentAt: new Date().toISOString(),
        recipient: cleanRecipient,
        bcc: effectiveBcc,
        subject: subject.trim(),
        pdfFilename,
      };
    }

    throw new Error(`ספק דוא״ל מסוג "${config.provider}" אינו נתמך. יש להגדיר חיבור Resend HTTPS API או SMTP.`);
  } finally {
    // Release the duplicate-send lock after 4 seconds to protect against double clicks
    setTimeout(() => {
      inFlightSends.delete(lockKey);
    }, 4000);
  }
}
