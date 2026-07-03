'use strict';

require('dotenv').config();
const express     = require('express');
const cors        = require('cors');
const helmet      = require('helmet');
const rateLimit   = require('express-rate-limit');
const nodemailer  = require('nodemailer');
const { body, validationResult } = require('express-validator');

// ─── Env validation ───────────────────────────────────────────────────────────
const REQUIRED_ENV = ['SMTP_USER', 'SMTP_PASS', 'CONTACT_TO'];
const missing = REQUIRED_ENV.filter((k) => !process.env[k]);
if (missing.length) {
  console.error(`[startup] Missing required env vars: ${missing.join(', ')}`);
  console.error('[startup] Copy server/.env.example to server/.env and fill in the values.');
  process.exit(1);
}

const PORT            = parseInt(process.env.PORT || '3001', 10);
const CONTACT_TO      = process.env.CONTACT_TO;
const SMTP_USER       = process.env.SMTP_USER;
const SMTP_PASS       = process.env.SMTP_PASS;
const REPLY_TO_SENDER = process.env.REPLY_TO_SENDER !== 'false'; // default true
const ALLOWED_ORIGINS = (process.env.ALLOWED_ORIGINS || 'http://localhost:8000')
  .split(',')
  .map((o) => o.trim());

// ─── Nodemailer transporter (Gmail SMTP) ─────────────────────────────────────
const transporter = nodemailer.createTransport({
  host: 'smtp.gmail.com',
  port: 465,
  secure: true,
  auth: { user: SMTP_USER, pass: SMTP_PASS },
  connectionTimeout: 10000,
  greetingTimeout: 10000,
  socketTimeout: 10000,
});

// Verify connection on startup — logs result but never crashes the server.
transporter.verify((err) => {
  if (err) {
    console.warn('[mailer] SMTP verify failed (will retry on first send):', err.message);
  } else {
    console.log(`[mailer] SMTP ready — sending as ${SMTP_USER}`);
  }
});

// ─── Express app ─────────────────────────────────────────────────────────────
const app = express();

// Security headers
app.use(helmet());

// CORS — only allow requests from the configured frontend origin(s)
app.use(
  cors({
    origin: (origin, cb) => {
      // Allow requests with no origin (curl, Postman, server-side) in dev
      if (!origin || ALLOWED_ORIGINS.includes(origin)) return cb(null, true);
      cb(new Error(`CORS: origin "${origin}" not allowed`));
    },
    methods: ['POST', 'GET', 'OPTIONS'],
    allowedHeaders: ['Content-Type'],
  })
);

// Body parsing — max 50kb, enough for a contact message, blocks payload attacks
app.use(express.json({ limit: '50kb' }));
app.use(express.urlencoded({ extended: false, limit: '50kb' }));

// Rate limiting — max 5 contact submissions per IP per 15 minutes
const contactLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    ok: false,
    error: 'Too many messages sent. Please wait 15 minutes before trying again.',
  },
});

// ─── Routes ──────────────────────────────────────────────────────────────────

// Health check — confirms the server is running
app.get('/api/health', (_req, res) => {
  res.json({ ok: true, timestamp: new Date().toISOString() });
});

// Contact form submission
app.post(
  '/api/contact',
  contactLimiter,

  // Input validation rules
  body('name')
    .trim()
    .notEmpty().withMessage('Name is required.')
    .isLength({ max: 100 }).withMessage('Name must be under 100 characters.'),

  body('email')
    .trim()
    .notEmpty().withMessage('Email is required.')
    .isEmail().withMessage('Please enter a valid email address.')
    .normalizeEmail(),

  body('subject')
    .trim()
    .optional({ checkFalsy: true })
    .isLength({ max: 200 }).withMessage('Subject must be under 200 characters.'),

  body('message')
    .trim()
    .notEmpty().withMessage('Message is required.')
    .isLength({ min: 10, max: 5000 })
    .withMessage('Message must be between 10 and 5000 characters.'),

  async (req, res) => {
    // Return validation errors as a structured response the frontend can use
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(422).json({
        ok: false,
        errors: errors.array().reduce((acc, e) => {
          acc[e.path] = e.msg;
          return acc;
        }, {}),
      });
    }

    const { name, email, subject, message } = req.body;
    const timestamp  = new Date().toLocaleString('en-KE', { timeZone: 'Africa/Nairobi', dateStyle: 'full', timeStyle: 'short' });
    const subjectLine = subject
      ? `[Portfolio] ${subject}`
      : `[Portfolio] New message from ${name}`;

    /* ── 1. Notification email → Henry ───────────────────────────────────── */
    const notifyMail = {
      from: `"Portfolio Contact" <${SMTP_USER}>`,
      to: CONTACT_TO,
      ...(REPLY_TO_SENDER && { replyTo: `"${name}" <${email}>` }),
      subject: subjectLine,
      text: [
        `New contact form submission`,
        `─────────────────────────────────`,
        `Name:      ${name}`,
        `Email:     ${email}`,
        `Subject:   ${subject || '(not provided)'}`,
        `Received:  ${timestamp}`,
        ``,
        `Message:`,
        message,
        ``,
        `─────────────────────────────────`,
        `Sent via your portfolio contact form.`,
        REPLY_TO_SENDER ? `Reply to this email to respond directly to ${name}.` : '',
      ].join('\n'),
      html: `<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:24px 0;background:#f0ede6;font-family:Inter,Helvetica,Arial,sans-serif">
  <div style="max-width:580px;margin:0 auto">

    <!-- Header -->
    <div style="background:#0E1525;border-radius:12px 12px 0 0;padding:28px 32px 24px">
      <p style="margin:0 0 6px;font-family:monospace;font-size:11px;letter-spacing:0.08em;text-transform:uppercase;color:#B8924A">
        Henry Maina · Portfolio
      </p>
      <h1 style="margin:0;font-size:22px;font-weight:700;color:#FCFBF8;line-height:1.3">
        New message from ${escapeHtml(name)}
      </h1>
      <p style="margin:8px 0 0;font-size:13px;color:#8891A3">${timestamp}</p>
    </div>

    <!-- Sender meta -->
    <div style="background:#fff;border-left:1px solid #dedad2;border-right:1px solid #dedad2;padding:22px 32px 0">
      <table style="width:100%;border-collapse:collapse">
        <tr>
          <td style="padding:10px 0;border-bottom:1px solid #f0ede6;width:90px;font-size:12px;color:#69728A;text-transform:uppercase;letter-spacing:0.05em;font-weight:600">From</td>
          <td style="padding:10px 0;border-bottom:1px solid #f0ede6;font-size:14px;color:#0E1525">
            ${escapeHtml(name)} &nbsp;·&nbsp; <a href="mailto:${escapeHtml(email)}" style="color:#1A2540;text-decoration:none">${escapeHtml(email)}</a>
          </td>
        </tr>
        ${subject ? `
        <tr>
          <td style="padding:10px 0;border-bottom:1px solid #f0ede6;font-size:12px;color:#69728A;text-transform:uppercase;letter-spacing:0.05em;font-weight:600">Subject</td>
          <td style="padding:10px 0;border-bottom:1px solid #f0ede6;font-size:14px;color:#0E1525">${escapeHtml(subject)}</td>
        </tr>` : ''}
      </table>
    </div>

    <!-- Message body -->
    <div style="background:#fff;border-left:1px solid #dedad2;border-right:1px solid #dedad2;padding:24px 32px">
      <p style="margin:0 0 12px;font-size:12px;color:#69728A;text-transform:uppercase;letter-spacing:0.05em;font-weight:600">Message</p>
      <div style="background:#f7f5f0;border-left:3px solid #B8924A;border-radius:0 8px 8px 0;padding:18px 20px;font-size:15px;line-height:1.75;color:#0E1525;white-space:pre-wrap">${escapeHtml(message)}</div>
    </div>

    <!-- Reply CTA -->
    <div style="background:#fff;border:1px solid #dedad2;border-top:none;border-radius:0 0 12px 12px;padding:20px 32px 26px">
      <a href="mailto:${escapeHtml(email)}?subject=Re: ${escapeHtml(subjectLine)}"
         style="display:inline-block;background:#0E1525;color:#FCFBF8;text-decoration:none;font-size:13px;font-weight:600;padding:12px 24px;border-radius:8px;letter-spacing:0.01em">
        Reply to ${escapeHtml(name)} →
      </a>
      <p style="margin:16px 0 0;font-size:12px;color:#8891A3">
        ${REPLY_TO_SENDER ? `Replying will go directly to <strong>${escapeHtml(email)}</strong>.` : ''}
        Sent via your portfolio contact form.
      </p>
    </div>

    <!-- Footer -->
    <p style="text-align:center;margin:18px 0 0;font-size:11px;color:#9CA3AF">
      Henry Maina Portfolio &nbsp;·&nbsp; mwangihenry622@gmail.com
    </p>
  </div>
</body>
</html>`,
    };

    /* ── 2. Auto-reply → sender ───────────────────────────────────────────── */
    const autoReplyMail = {
      from: `"Henry Maina" <${SMTP_USER}>`,
      to: `"${name}" <${email}>`,
      subject: `Thank you for contacting me, ${name} — I'll be in touch shortly`,
      text: [
        `Dear ${name},`,
        ``,
        `Thank you for reaching out. Your message has been received and I will get back to you as soon as possible — typically within 24 to 48 hours.`,
        ``,
        `For your reference, here is a copy of your message:`,
        `─────────────────────────────────`,
        subject ? `Subject: ${subject}` : '',
        ``,
        message,
        `─────────────────────────────────`,
        ``,
        `In the meantime, you are welcome to explore my work:`,
        `· HM Analytics Agency: https://hmanalytics.netlify.app`,
        `· Elite Traders: https://elitetraderslimited.netlify.app`,
        ``,
        `Warm regards,`,
        ``,
        `Henry Maina`,
        `CEO, HM Analytics Agency`,
        `Co-Founder & Director, Elite Traders`,
        `mwangihenry622@gmail.com`,
        ``,
        `─────────────────────────────────`,
        `This is an automated confirmation. Please do not reply to this email directly.`,
        `To contact Henry, visit: https://hmanalytics.netlify.app`,
      ].join('\n'),
      html: `<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:32px 0;background:#f0ede6;font-family:Inter,Helvetica,Arial,sans-serif">
  <div style="max-width:580px;margin:0 auto">

    <!-- Header bar -->
    <div style="background:#0E1525;border-radius:12px 12px 0 0;padding:32px 36px">
      <p style="margin:0 0 8px;font-family:monospace;font-size:11px;letter-spacing:0.09em;text-transform:uppercase;color:#B8924A;font-weight:600">
        Henry Maina · Official Response
      </p>
      <h1 style="margin:0 0 6px;font-size:24px;font-weight:700;color:#FCFBF8;line-height:1.25;font-family:Georgia,serif">
        Thank you for contacting me,<br>${escapeHtml(name)}.
      </h1>
      <p style="margin:10px 0 0;font-size:13px;color:#8891A3">
        This confirmation was sent automatically — ${timestamp}
      </p>
    </div>

    <!-- Green confirmation strip -->
    <div style="background:#1a3d2b;padding:14px 36px;display:flex;align-items:center;gap:12px">
      <span style="font-size:18px">✅</span>
      <p style="margin:0;font-size:13.5px;color:#a3e0bc;font-weight:600;letter-spacing:0.01em">
        Your message has been received and is in good hands.
      </p>
    </div>

    <!-- Body -->
    <div style="background:#ffffff;border:1px solid #dedad2;border-top:none;padding:32px 36px">

      <p style="margin:0 0 20px;font-size:15.5px;line-height:1.8;color:#0E1525">
        Dear <strong>${escapeHtml(name)}</strong>,
      </p>
      <p style="margin:0 0 20px;font-size:15px;line-height:1.8;color:#2C3A4A">
        I appreciate you taking the time to reach out. Your message has been successfully received
        and I will respond personally within <strong style="color:#0E1525">24 to 48 hours</strong>.
      </p>
      <p style="margin:0 0 28px;font-size:15px;line-height:1.8;color:#2C3A4A">
        For reference, here is a copy of what you sent:
      </p>

      <!-- Message copy block -->
      <div style="background:#f7f5f0;border-left:4px solid #B8924A;border-radius:0 8px 8px 0;padding:20px 24px;margin-bottom:32px">
        ${subject ? `
        <p style="margin:0 0 12px;font-size:11px;text-transform:uppercase;letter-spacing:0.06em;color:#8891A3;font-weight:700">
          Subject: ${escapeHtml(subject)}
        </p>` : ''}
        <p style="margin:0;font-size:14.5px;line-height:1.75;color:#0E1525;white-space:pre-wrap">${escapeHtml(message)}</p>
      </div>

      <!-- Divider with label -->
      <div style="display:flex;align-items:center;gap:14px;margin-bottom:28px">
        <div style="flex:1;height:1px;background:#e8e5de"></div>
        <p style="margin:0;font-size:11px;color:#B8924A;text-transform:uppercase;letter-spacing:0.07em;font-weight:600;white-space:nowrap">Explore My Work</p>
        <div style="flex:1;height:1px;background:#e8e5de"></div>
      </div>

      <!-- CTA buttons -->
      <table style="width:100%;border-collapse:collapse;margin-bottom:28px">
        <tr>
          <td style="padding-right:8px;width:50%">
            <a href="https://hmanalytics.netlify.app"
               style="display:block;background:#0E1525;color:#FCFBF8;text-decoration:none;font-size:13px;font-weight:700;padding:14px 18px;border-radius:8px;text-align:center;letter-spacing:0.01em">
              HM Analytics Agency →
            </a>
          </td>
          <td style="padding-left:8px;width:50%">
            <a href="https://elitetraderslimited.netlify.app"
               style="display:block;background:#B8924A;color:#1A1300;text-decoration:none;font-size:13px;font-weight:700;padding:14px 18px;border-radius:8px;text-align:center;letter-spacing:0.01em">
              Elite Traders →
            </a>
          </td>
        </tr>
      </table>

      <hr style="border:none;border-top:1px solid #eeece6;margin:0 0 26px">

      <!-- Signature -->
      <table style="border-collapse:collapse;width:100%">
        <tr>
          <td style="width:52px;padding-right:16px;vertical-align:top">
            <div style="width:48px;height:48px;border-radius:50%;background:linear-gradient(150deg,#1A2540,#3A4A6B);text-align:center;line-height:48px;font-family:Georgia,serif;font-size:17px;font-weight:700;color:#fff">HM</div>
          </td>
          <td style="vertical-align:top">
            <p style="margin:0 0 2px;font-size:16px;font-weight:700;color:#0E1525;font-family:Georgia,serif">Henry Maina</p>
            <p style="margin:0 0 1px;font-size:12.5px;color:#69728A">CEO, HM Analytics Agency</p>
            <p style="margin:0 0 8px;font-size:12.5px;color:#69728A">Co-Founder &amp; Director, Elite Traders</p>
            <p style="margin:0;font-size:12.5px">
              <a href="mailto:mwangihenry622@gmail.com" style="color:#B8924A;text-decoration:none;font-weight:600">mwangihenry622@gmail.com</a>
            </p>
          </td>
        </tr>
      </table>
    </div>

    <!-- Footer -->
    <div style="padding:18px 36px 0;text-align:center">
      <p style="margin:0 0 6px;font-size:11px;color:#9CA3AF;line-height:1.6">
        This is an automated confirmation email. Please do not reply to this message directly.
      </p>
      <p style="margin:0;font-size:11px;color:#9CA3AF">
        You received this because you submitted the contact form on
        <a href="https://hmanalytics.netlify.app" style="color:#B8924A;text-decoration:none">Henry Maina's portfolio</a>.
      </p>
    </div>

  </div>
</body>
</html>`,
    };

    try {
      /* Send both emails in parallel — neither blocks the other */
      await Promise.all([
        transporter.sendMail(notifyMail),
        transporter.sendMail(autoReplyMail),
      ]);
      console.log(`[contact] Notification + auto-reply sent for ${email} (${name})`);
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

// 404 catch-all for unknown API routes
app.use('/api/*', (_req, res) => {
  res.status(404).json({ ok: false, error: 'Not found.' });
});

// ─── Start ────────────────────────────────────────────────────────────────────
app.listen(PORT, () => {
  console.log(`[server] Running on http://localhost:${PORT}`);
  console.log(`[server] Delivering contact emails to: ${CONTACT_TO}`);
  console.log(`[server] Allowed origins: ${ALLOWED_ORIGINS.join(', ')}`);
});

// ─── Helpers ─────────────────────────────────────────────────────────────────
function escapeHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#x27;');
}
