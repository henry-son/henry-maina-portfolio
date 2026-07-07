'use strict';

try { require('dotenv').config(); } catch (_) {}

const express    = require('express');
const cors       = require('cors');
const helmet     = require('helmet');
const rateLimit  = require('express-rate-limit');
const { Resend } = require('resend');
const { body, validationResult } = require('express-validator');

// ─── Env validation ───────────────────────────────────────────────────────────
console.log('[debug] RESEND_API_KEY present:', !!process.env.RESEND_API_KEY);
console.log('[debug] CONTACT_TO present:', !!process.env.CONTACT_TO);

const REQUIRED_ENV = ['RESEND_API_KEY', 'CONTACT_TO'];
const missing = REQUIRED_ENV.filter((k) => !process.env[k] || process.env[k].trim() === '');
if (missing.length) {
  console.error(`[startup] Missing required env vars: ${missing.join(', ')}`);
  process.exit(1);
}

const PORT            = parseInt(process.env.PORT || '3001', 10);
const CONTACT_TO      = process.env.CONTACT_TO;
const REPLY_TO_SENDER = process.env.REPLY_TO_SENDER !== 'false';
const ALLOWED_ORIGINS = (process.env.ALLOWED_ORIGINS || 'http://localhost:8000')
  .split(',').map((o) => o.trim());

const resend = new Resend(process.env.RESEND_API_KEY);
console.log('[mailer] Resend client ready');

// ─── Express app ─────────────────────────────────────────────────────────────
const app = express();
app.set('trust proxy', 1);
app.use(helmet());
app.use(cors({
  origin: (origin, cb) => {
    if (!origin || ALLOWED_ORIGINS.includes(origin)) return cb(null, true);
    cb(new Error(`CORS: origin "${origin}" not allowed`));
  },
  methods: ['POST', 'GET', 'OPTIONS'],
  allowedHeaders: ['Content-Type'],
}));
app.use(express.json({ limit: '50kb' }));
app.use(express.urlencoded({ extended: false, limit: '50kb' }));

const contactLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
  message: { ok: false, error: 'Too many messages sent. Please wait 15 minutes before trying again.' },
});

// ─── Routes ──────────────────────────────────────────────────────────────────
app.get('/api/health', (_req, res) => {
  res.json({ ok: true, timestamp: new Date().toISOString() });
});

app.post('/api/contact', contactLimiter,
  body('name').trim().notEmpty().withMessage('Name is required.').isLength({ max: 100 }),
  body('email').trim().notEmpty().isEmail().withMessage('Please enter a valid email address.').normalizeEmail(),
  body('subject').trim().optional({ checkFalsy: true }).isLength({ max: 200 }),
  body('message').trim().notEmpty().withMessage('Message is required.').isLength({ min: 10, max: 5000 }),

  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(422).json({
        ok: false,
        errors: errors.array().reduce((acc, e) => { acc[e.path] = e.msg; return acc; }, {}),
      });
    }

    const { name, email, subject, message } = req.body;
    const timestamp = new Date().toLocaleString('en-KE', {
      timeZone: 'Africa/Nairobi', dateStyle: 'full', timeStyle: 'short',
    });
    const subjectLine = subject ? `[Portfolio] ${subject}` : `[Portfolio] New message from ${name}`;

    // ── 1. Notification → Henry ──────────────────────────────────────────────
    const notifyHtml = `<!DOCTYPE html>
<html><head><meta charset="UTF-8"></head>
<body style="margin:0;padding:24px 0;background:#f0ede6;font-family:Inter,Helvetica,Arial,sans-serif">
<div style="max-width:580px;margin:0 auto">
  <div style="background:#0E1525;border-radius:12px 12px 0 0;padding:28px 32px 24px">
    <p style="margin:0 0 6px;font-family:monospace;font-size:11px;letter-spacing:0.08em;text-transform:uppercase;color:#B8924A">Henry Maina · Portfolio</p>
    <h1 style="margin:0;font-size:22px;font-weight:700;color:#FCFBF8">New message from ${escapeHtml(name)}</h1>
    <p style="margin:8px 0 0;font-size:13px;color:#8891A3">${timestamp}</p>
  </div>
  <div style="background:#fff;border:1px solid #dedad2;border-top:none;padding:24px 32px">
    <table style="width:100%;border-collapse:collapse;margin-bottom:20px">
      <tr><td style="padding:8px 0;border-bottom:1px solid #f0ede6;width:80px;font-size:12px;color:#69728A;font-weight:600;text-transform:uppercase">From</td>
          <td style="padding:8px 0;border-bottom:1px solid #f0ede6;font-size:14px;color:#0E1525">${escapeHtml(name)} · <a href="mailto:${escapeHtml(email)}" style="color:#1A2540">${escapeHtml(email)}</a></td></tr>
      ${subject ? `<tr><td style="padding:8px 0;font-size:12px;color:#69728A;font-weight:600;text-transform:uppercase">Subject</td><td style="padding:8px 0;font-size:14px;color:#0E1525">${escapeHtml(subject)}</td></tr>` : ''}
    </table>
    <div style="background:#f7f5f0;border-left:3px solid #B8924A;border-radius:0 8px 8px 0;padding:18px 20px;font-size:15px;line-height:1.75;color:#0E1525;white-space:pre-wrap">${escapeHtml(message)}</div>
  </div>
  <div style="background:#fff;border:1px solid #dedad2;border-top:none;border-radius:0 0 12px 12px;padding:20px 32px 26px">
    <a href="mailto:${escapeHtml(email)}?subject=Re: ${escapeHtml(subjectLine)}"
       style="display:inline-block;background:#0E1525;color:#FCFBF8;text-decoration:none;font-size:13px;font-weight:600;padding:12px 24px;border-radius:8px">
      Reply to ${escapeHtml(name)} →
    </a>
  </div>
</div>
</body></html>`;

    // ── 2. Auto-reply → sender ───────────────────────────────────────────────
    const autoReplyHtml = `<!DOCTYPE html>
<html><head><meta charset="UTF-8"></head>
<body style="margin:0;padding:32px 0;background:#f0ede6;font-family:Inter,Helvetica,Arial,sans-serif">
<div style="max-width:580px;margin:0 auto">
  <div style="background:#0E1525;border-radius:12px 12px 0 0;padding:32px 36px">
    <p style="margin:0 0 8px;font-family:monospace;font-size:11px;letter-spacing:0.09em;text-transform:uppercase;color:#B8924A;font-weight:600">Henry Maina · Official Response</p>
    <h1 style="margin:0;font-size:24px;font-weight:700;color:#FCFBF8;font-family:Georgia,serif">Thank you for contacting me,<br>${escapeHtml(name)}.</h1>
    <p style="margin:10px 0 0;font-size:13px;color:#8891A3">Sent automatically — ${timestamp}</p>
  </div>
  <div style="background:#1a3d2b;padding:14px 36px">
    <p style="margin:0;font-size:13.5px;color:#a3e0bc;font-weight:600">✅ Your message has been received and is in good hands.</p>
  </div>
  <div style="background:#fff;border:1px solid #dedad2;border-top:none;padding:32px 36px">
    <p style="margin:0 0 20px;font-size:15px;line-height:1.8;color:#0E1525">Dear <strong>${escapeHtml(name)}</strong>,</p>
    <p style="margin:0 0 20px;font-size:15px;line-height:1.8;color:#2C3A4A">
      I appreciate you reaching out. Your message has been received and I will respond personally within <strong>24 to 48 hours</strong>.
    </p>
    <div style="background:#f7f5f0;border-left:4px solid #B8924A;border-radius:0 8px 8px 0;padding:20px 24px;margin-bottom:32px">
      ${subject ? `<p style="margin:0 0 10px;font-size:11px;text-transform:uppercase;color:#8891A3;font-weight:700">Subject: ${escapeHtml(subject)}</p>` : ''}
      <p style="margin:0;font-size:14.5px;line-height:1.75;color:#0E1525;white-space:pre-wrap">${escapeHtml(message)}</p>
    </div>
    <table style="width:100%;border-collapse:collapse;margin-bottom:28px">
      <tr>
        <td style="padding-right:8px;width:50%">
          <a href="https://hmanalytics.netlify.app" style="display:block;background:#0E1525;color:#FCFBF8;text-decoration:none;font-size:13px;font-weight:700;padding:14px 18px;border-radius:8px;text-align:center">HM Analytics Agency →</a>
        </td>
        <td style="padding-left:8px;width:50%">
          <a href="https://elitetraderslimited.netlify.app" style="display:block;background:#B8924A;color:#1A1300;text-decoration:none;font-size:13px;font-weight:700;padding:14px 18px;border-radius:8px;text-align:center">Elite Traders →</a>
        </td>
      </tr>
    </table>
    <hr style="border:none;border-top:1px solid #eeece6;margin:0 0 24px">
    <table style="border-collapse:collapse">
      <tr>
        <td style="width:52px;padding-right:16px;vertical-align:top">
          <div style="width:48px;height:48px;border-radius:50%;background:linear-gradient(150deg,#1A2540,#3A4A6B);text-align:center;line-height:48px;font-family:Georgia,serif;font-size:17px;font-weight:700;color:#fff">HM</div>
        </td>
        <td style="vertical-align:top">
          <p style="margin:0 0 2px;font-size:16px;font-weight:700;color:#0E1525;font-family:Georgia,serif">Henry Maina</p>
          <p style="margin:0 0 1px;font-size:12.5px;color:#69728A">CEO, HM Analytics Agency</p>
          <p style="margin:0 0 8px;font-size:12.5px;color:#69728A">Co-Founder &amp; Director, Elite Traders</p>
          <a href="mailto:mwangihenry622@gmail.com" style="font-size:12.5px;color:#B8924A;text-decoration:none;font-weight:600">mwangihenry622@gmail.com</a>
        </td>
      </tr>
    </table>
  </div>
  <p style="text-align:center;margin:18px 0 0;font-size:11px;color:#9CA3AF">
    This is an automated confirmation. Please do not reply directly.<br>
    You received this from <a href="https://henry-maina.netlify.app" style="color:#B8924A;text-decoration:none">Henry Maina's portfolio</a>.
  </p>
</div>
</body></html>`;

    try {
      await Promise.all([
        resend.emails.send({
          from: 'Portfolio Contact <onboarding@resend.dev>',
          to: [CONTACT_TO],
          ...(REPLY_TO_SENDER && { replyTo: `${name} <${email}>` }),
          subject: subjectLine,
          html: notifyHtml,
        }),
        resend.emails.send({
          from: 'Henry Maina <onboarding@resend.dev>',
          to: [email],
          subject: `Thank you for contacting me, ${name} — I'll be in touch shortly`,
          html: autoReplyHtml,
        }),
      ]);
      console.log(`[contact] Emails sent for ${email} (${name})`);
      return res.json({ ok: true, message: "Your message has been sent. I'll be in touch within 24–48 hours." });
    } catch (err) {
      console.error('[contact] Failed to send email:', err.message);
      return res.status(500).json({
        ok: false,
        error: 'Failed to send your message. Please try again or email mwangihenry622@gmail.com directly.',
      });
    }
  }
);

app.use('/api/*', (_req, res) => {
  res.status(404).json({ ok: false, error: 'Not found.' });
});

// ─── Start ────────────────────────────────────────────────────────────────────
app.listen(PORT, '0.0.0.0', () => {
  console.log(`[server] Running on http://0.0.0.0:${PORT}`);
  console.log(`[server] Delivering contact emails to: ${CONTACT_TO}`);
  console.log(`[server] Allowed origins: ${ALLOWED_ORIGINS.join(', ')}`);
});

function escapeHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#x27;');
}
