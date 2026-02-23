import 'dotenv/config';
import { createServer } from 'node:http';
import { randomUUID } from 'node:crypto';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { PrismaClient } from '@prisma/client';
import jwt from 'jsonwebtoken';
import Stripe from 'stripe';
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import nodemailer from 'nodemailer';

const prisma = new PrismaClient();
const PORT = Number(process.env.PORT || process.env.API_PORT || 4000);
const ALLOWED_ORIGIN = process.env.ALLOWED_ORIGIN || 'http://localhost:5173';
const ALLOWED_ORIGINS = String(process.env.ALLOWED_ORIGINS || '')
  .split(',')
  .map((origin) => origin.trim())
  .filter(Boolean);
const CORS_ALLOWED_ORIGINS = Array.from(new Set([ALLOWED_ORIGIN, ...ALLOWED_ORIGINS]));
const ADMIN_DASHBOARD_KEY = process.env.ADMIN_DASHBOARD_KEY || '';
const ADMIN_SETUP_KEY = process.env.ADMIN_SETUP_KEY || '';
const JWT_SECRET = process.env.JWT_SECRET || '';
const ADMIN_TOKEN_TTL = process.env.ADMIN_TOKEN_TTL || '12h';
const USER_TOKEN_TTL = process.env.USER_TOKEN_TTL || '30d';
const STRIPE_SECRET_KEY = process.env.STRIPE_SECRET_KEY || '';
const STRIPE_WEBHOOK_SECRET = process.env.STRIPE_WEBHOOK_SECRET || '';
const STRIPE_PLATFORM_COMMISSION_PERCENT = Number(process.env.STRIPE_PLATFORM_COMMISSION_PERCENT || 15);
const DEFAULT_VAT_RATE = Number(process.env.DEFAULT_VAT_RATE || 0.19);
const FRONTEND_BASE_URL = process.env.FRONTEND_BASE_URL || ALLOWED_ORIGIN;
const STRIPE_CONNECT_REFRESH_URL = process.env.STRIPE_CONNECT_REFRESH_URL || `${FRONTEND_BASE_URL}/vendor-portfolio`;
const STRIPE_CONNECT_RETURN_URL = process.env.STRIPE_CONNECT_RETURN_URL || `${FRONTEND_BASE_URL}/vendor-portfolio`;
const AUTH_GOOGLE_ID = process.env.AUTH_GOOGLE_ID || '';
const R2_ACCOUNT_ID = process.env.R2_ACCOUNT_ID || '';
const R2_ACCESS_KEY_ID = process.env.R2_ACCESS_KEY_ID || '';
const R2_SECRET_ACCESS_KEY = process.env.R2_SECRET_ACCESS_KEY || '';
const R2_BUCKET_NAME = process.env.R2_BUCKET_NAME || '';
const R2_PUBLIC_BASE_URL = process.env.R2_PUBLIC_BASE_URL || '';
const SMTP_HOST = process.env.SMTP_HOST || '';
const SMTP_PORT = Number(process.env.SMTP_PORT || 587);
const SMTP_USER = process.env.SMTP_USER || '';
const SMTP_PASS = process.env.SMTP_PASS || '';
const SMTP_FROM = process.env.SMTP_FROM || '';
const ADMIN_NOTIFY_EMAIL = process.env.ADMIN_NOTIFY_EMAIL || '';
const BOOKING_FLOW_MODE = String(process.env.BOOKING_FLOW_MODE || 'both').toLowerCase();
const VENDOR_CONTRACT_VERSION = process.env.VENDOR_CONTRACT_VERSION || 'v1.0';
const VENDOR_COMPLIANCE_FILE = process.env.VENDOR_COMPLIANCE_FILE || path.join(process.cwd(), 'backend', 'data', 'vendor-compliance.json');
const ENABLE_LEGACY_COMPLIANCE_JSON = String(process.env.ENABLE_LEGACY_COMPLIANCE_JSON || 'true').toLowerCase() !== 'false';
const SERVICE_AGREEMENT_VERSION = process.env.SERVICE_AGREEMENT_VERSION || 'v1.0';
const SERVICE_AGREEMENT_FILE = process.env.SERVICE_AGREEMENT_FILE || path.join(process.cwd(), 'backend', 'data', 'service-agreements.json');
const ENFORCE_VENDOR_PAYOUT_READINESS = String(process.env.ENFORCE_VENDOR_PAYOUT_READINESS || 'true').toLowerCase() !== 'false';
const CONTRACT_SIGNING_PROVIDER = process.env.CONTRACT_SIGNING_PROVIDER || 'external';
const CONTRACT_SIGNING_WEBHOOK_SECRET = process.env.CONTRACT_SIGNING_WEBHOOK_SECRET || '';
const DEFAULT_RESPONSE_HOURS = 48;
const MAX_RESPONSE_HOURS = 168;
const RATE_LIMIT_WINDOW_MS = Number(process.env.RATE_LIMIT_WINDOW_MS || 60_000);
const rateLimitStore = new Map();
const RATE_LIMITS = {
  auth: { max: Number(process.env.RATE_LIMIT_AUTH_MAX || 30), windowMs: RATE_LIMIT_WINDOW_MS },
  admin: { max: Number(process.env.RATE_LIMIT_ADMIN_MAX || 20), windowMs: RATE_LIMIT_WINDOW_MS },
  payment: { max: Number(process.env.RATE_LIMIT_PAYMENT_MAX || 60), windowMs: RATE_LIMIT_WINDOW_MS },
  webhook: { max: Number(process.env.RATE_LIMIT_WEBHOOK_MAX || 180), windowMs: RATE_LIMIT_WINDOW_MS },
};
const stripe = STRIPE_SECRET_KEY ? new Stripe(STRIPE_SECRET_KEY) : null;
const mailTransporter =
  SMTP_HOST && SMTP_USER && SMTP_PASS
    ? nodemailer.createTransport({
        host: SMTP_HOST,
        port: SMTP_PORT,
        secure: SMTP_PORT === 465,
        auth: { user: SMTP_USER, pass: SMTP_PASS },
      })
    : null;
const r2Client =
  R2_ACCOUNT_ID && R2_ACCESS_KEY_ID && R2_SECRET_ACCESS_KEY
    ? new S3Client({
        region: 'auto',
        endpoint: `https://${R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
        credentials: {
          accessKeyId: R2_ACCESS_KEY_ID,
          secretAccessKey: R2_SECRET_ACCESS_KEY,
        },
      })
    : null;

const REQUIRED_SECRETS = [
  ['JWT_SECRET', JWT_SECRET],
  ['ADMIN_SETUP_KEY', ADMIN_SETUP_KEY],
  ['ADMIN_DASHBOARD_KEY', ADMIN_DASHBOARD_KEY],
];
const missingSecrets = REQUIRED_SECRETS.filter(([, value]) => !String(value || '').trim()).map(([key]) => key);
if (missingSecrets.length > 0) {
  console.error(`Missing required env vars: ${missingSecrets.join(', ')}`);
  process.exit(1);
}
if (!['legacy', 'structured', 'both'].includes(BOOKING_FLOW_MODE)) {
  console.error('Invalid BOOKING_FLOW_MODE. Use one of: legacy, structured, both');
  process.exit(1);
}

function sendJson(res, status, data) {
  const corsOrigin = resolveCorsOrigin(res.req);
  res.writeHead(status, {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': corsOrigin,
    'Access-Control-Allow-Methods': 'GET,POST,PATCH,OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization, x-admin-key, x-admin-setup-key',
    Vary: 'Origin',
  });
  res.end(JSON.stringify(data));
}

function notFound(res) {
  sendJson(res, 404, { error: 'Not found' });
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let data = '';
    req.on('data', (chunk) => {
      data += chunk;
      if (data.length > 1_000_000) reject(new Error('Payload too large'));
    });
    req.on('end', () => {
      if (!data) return resolve({});
      try {
        resolve(JSON.parse(data));
      } catch {
        reject(new Error('Invalid JSON'));
      }
    });
    req.on('error', reject);
  });
}

function readRawBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on('data', (chunk) => chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)));
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}

function withCors(req, res) {
  const corsOrigin = resolveCorsOrigin(req);
  if (req.method === 'OPTIONS') {
    res.writeHead(204, {
      'Access-Control-Allow-Origin': corsOrigin,
      'Access-Control-Allow-Methods': 'GET,POST,PATCH,OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization, x-admin-key, x-admin-setup-key',
      Vary: 'Origin',
    });
    res.end();
    return true;
  }
  return false;
}

function resolveCorsOrigin(req) {
  const origin = String(req?.headers?.origin || '').trim();
  if (!origin) return CORS_ALLOWED_ORIGINS[0] || 'http://localhost:5173';
  if (CORS_ALLOWED_ORIGINS.includes(origin)) return origin;
  return CORS_ALLOWED_ORIGINS[0] || 'http://localhost:5173';
}

function isAdminAuthorized(req) {
  const payload = getJwtPayload(req);
  if (payload?.role === 'admin') return true;

  const authHeader = req.headers.authorization || '';
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : '';
  if (token) {
    try {
      const payload = jwt.verify(token, JWT_SECRET);
      return payload && typeof payload === 'object' && payload.role === 'admin';
    } catch {
      return false;
    }
  }

  // Backward-compatible fallback for legacy dashboard key
  const legacyHeader = req.headers['x-admin-key'];
  if (Array.isArray(legacyHeader)) return legacyHeader[0] === ADMIN_DASHBOARD_KEY;
  return legacyHeader === ADMIN_DASHBOARD_KEY;
}

function signAdminToken(adminUser) {
  return jwt.sign(
    {
      sub: adminUser.id,
      role: 'admin',
      email: adminUser.email,
      name: adminUser.name,
    },
    JWT_SECRET,
    { expiresIn: ADMIN_TOKEN_TTL },
  );
}

function signUserToken(user) {
  return jwt.sign(
    {
      sub: user.id,
      role: user.role,
      email: user.email,
      name: user.name,
    },
    JWT_SECRET,
    { expiresIn: USER_TOKEN_TTL },
  );
}

function getJwtPayload(req) {
  const authHeader = req.headers.authorization || '';
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : '';
  if (!token) return null;
  try {
    const payload = jwt.verify(token, JWT_SECRET);
    if (!payload || typeof payload !== 'object') return null;
    return payload;
  } catch {
    return null;
  }
}

function requireJwt(req, ...roles) {
  const payload = getJwtPayload(req);
  if (!payload) throw httpError(401, 'Unauthorized');
  if (roles.length > 0 && !roles.includes(payload.role)) {
    throw httpError(403, 'Forbidden');
  }
  return payload;
}

function getClientIp(req) {
  const forwarded = req.headers['x-forwarded-for'];
  const raw = Array.isArray(forwarded) ? forwarded[0] : forwarded;
  if (raw) return String(raw).split(',')[0].trim();
  return String(req.socket?.remoteAddress || 'unknown');
}

function enforceRateLimit(req, res, scope) {
  const cfg = RATE_LIMITS[scope];
  const now = Date.now();
  const key = `${scope}:${getClientIp(req)}`;
  const existing = rateLimitStore.get(key);
  if (!existing || now - existing.windowStart > cfg.windowMs) {
    rateLimitStore.set(key, { windowStart: now, count: 1 });
    return false;
  }
  existing.count += 1;
  if (existing.count > cfg.max) {
    const retryAfter = Math.ceil((cfg.windowMs - (now - existing.windowStart)) / 1000);
    res.setHeader('Retry-After', String(Math.max(1, retryAfter)));
    sendJson(res, 429, { error: 'Too many requests, please try again shortly.' });
    return true;
  }
  return false;
}

function ensureStructuredFlowEnabled() {
  if (BOOKING_FLOW_MODE === 'legacy') {
    throw httpError(409, 'Structured booking flow is disabled by configuration');
  }
}

function ensureLegacyFlowEnabled() {
  if (BOOKING_FLOW_MODE === 'structured') {
    throw httpError(409, 'Legacy booking flow is disabled by configuration');
  }
}

function serializeRequest(request) {
  return {
    ...request,
    customerPhone: request.customerPhone || null,
    budget: Number(request.budget),
    offerResponseHours: Number(request.offerResponseHours || DEFAULT_RESPONSE_HOURS),
    selectedServices: Array.isArray(request.selectedServices) ? request.selectedServices : [],
    offers: (request.offers || []).map((offer) => ({
      ...offer,
      price: Number(offer.price),
      message: offer.message || '',
      paymentStatus: offer.paymentStatus || 'unpaid',
      stripeSessionId: offer.stripeSessionId || null,
      stripePaymentIntent: offer.stripePaymentIntent || null,
      paidAt: offer.paidAt || null,
    })),
  };
}

async function expireStaleRequests() {
  await prisma.serviceRequest.updateMany({
    where: {
      status: 'open',
      expiresAt: { lt: new Date() },
    },
    data: {
      status: 'expired',
      closedAt: new Date(),
      closedReason: 'time_limit',
    },
  });
  await prisma.vendorOffer.updateMany({
    where: {
      status: 'pending',
      request: {
        status: 'expired',
      },
    },
    data: {
      status: 'ignored',
    },
  });
}

function normalizeResponseHours(input) {
  const hours = Number(input || DEFAULT_RESPONSE_HOURS);
  if (!Number.isFinite(hours)) return DEFAULT_RESPONSE_HOURS;
  return Math.min(MAX_RESPONSE_HOURS, Math.max(1, Math.round(hours)));
}

function normalizeOptionalString(input, maxLength = 255) {
  const value = String(input || '').trim();
  if (!value) return null;
  return value.slice(0, maxLength);
}

function normalizeMatchText(input) {
  return String(input || '')
    .toLowerCase()
    .replace(/[^a-z0-9\u00c0-\u024f]+/g, ' ')
    .trim();
}

function extractKeywordSet(values) {
  const stopwords = new Set([
    'event',
    'events',
    'service',
    'services',
    'client',
    'customer',
    'selected',
    'venue',
    'budget',
    'email',
    'phone',
    'message',
    'request',
    'anbieter',
    'kunde',
  ]);
  const result = new Set();
  for (const value of values || []) {
    const normalized = normalizeMatchText(value);
    if (!normalized) continue;
    for (const token of normalized.split(/\s+/)) {
      if (token.length >= 3 && !stopwords.has(token)) result.add(token);
    }
  }
  return result;
}

function resolveVendorCategoryKeywords(vendor, posts) {
  const haystack = normalizeMatchText([
    vendor?.businessName || '',
    ...(posts || []).map((post) => `${post.serviceName || ''} ${post.title || ''} ${post.description || ''}`),
  ].join(' '));
  const categories = new Set();
  if (/(^|\s)(dj|music|musician|sound|audio|band)(\s|$)/.test(haystack)) categories.add('dj');
  if (/(^|\s)(catering|food|chef|kitchen|drink|bar)(\s|$)/.test(haystack)) categories.add('catering');
  if (/(^|\s)(decor|deco|decoration|florist|flowers|styling)(\s|$)/.test(haystack)) categories.add('decor');
  if (/(^|\s)(photo|video|camera|filmer)(\s|$)/.test(haystack)) categories.add('media');
  if (/(^|\s)(venue|hall|location|space)(\s|$)/.test(haystack)) categories.add('venue');
  return categories;
}

function resolveRequestCategoryKeywords(request) {
  const categories = new Set();
  const source = normalizeMatchText(
    [
      ...(Array.isArray(request?.selectedServices) ? request.selectedServices : []),
      request?.notes || '',
    ].join(' '),
  );
  if (/(^|\s)(dj|music|musician|sound|audio|band)(\s|$)/.test(source)) categories.add('dj');
  if (/(^|\s)(catering|food|chef|kitchen|drink|bar)(\s|$)/.test(source)) categories.add('catering');
  if (/(^|\s)(decor|deco|decoration|florist|flowers|styling)(\s|$)/.test(source)) categories.add('decor');
  if (/(^|\s)(photo|video|camera|filmer)(\s|$)/.test(source)) categories.add('media');
  if (/(^|\s)(venue|hall|location|space)(\s|$)/.test(source)) categories.add('venue');
  return categories;
}

function intersects(setA, setB) {
  for (const item of setA) {
    if (setB.has(item)) return true;
  }
  return false;
}

function intersectionCount(setA, setB) {
  let count = 0;
  for (const item of setA) {
    if (setB.has(item)) count += 1;
  }
  return count;
}

const EMAIL_PATTERN = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i;
const URL_OR_SOCIAL_PATTERN = /(https?:\/\/|www\.|\.com|\.de|\.net|\.io|instagram|whatsapp|telegram|t\.me)/i;
const PHONE_PATTERN = /(\+?\d[\d\s().-]{7,}\d)/;
const LONG_DIGIT_RUN_PATTERN = /\d{8,}/;

function containsContactInfo(text) {
  const value = String(text || '');
  if (!value) return false;
  return (
    EMAIL_PATTERN.test(value) ||
    URL_OR_SOCIAL_PATTERN.test(value) ||
    PHONE_PATTERN.test(value) ||
    LONG_DIGIT_RUN_PATTERN.test(value)
  );
}

function assertNoContactInfo(text) {
  if (containsContactInfo(text)) {
    throw httpError(400, "Please keep communication on the platform. Don't share contact info.");
  }
}

function toPositiveInt(value, fieldName) {
  const num = Number(value);
  if (!Number.isFinite(num) || num <= 0) throw httpError(400, `${fieldName} must be > 0`);
  return Math.round(num);
}

function centsToLegacyPrice(cents) {
  return Math.max(1, Math.round(Number(cents || 0) / 100));
}

function computeTotalsFromGross(grossAmountCents, vatRate = DEFAULT_VAT_RATE, commissionRate = STRIPE_PLATFORM_COMMISSION_PERCENT / 100) {
  const grossAmount = Math.max(0, Math.round(Number(grossAmountCents || 0)));
  const safeVatRate = Number.isFinite(vatRate) && vatRate >= 0 ? vatRate : 0;
  const safeCommissionRate = Number.isFinite(commissionRate) && commissionRate >= 0 ? commissionRate : 0;
  const netAmount = safeVatRate > 0 ? Math.round(grossAmount / (1 + safeVatRate)) : grossAmount;
  const vatAmount = Math.max(0, grossAmount - netAmount);
  const platformFee = Math.max(0, Math.round(grossAmount * safeCommissionRate));
  const vendorNetAmount = Math.max(0, grossAmount - platformFee);
  return {
    netAmount,
    vatRate: safeVatRate,
    vatAmount,
    grossAmount,
    platformFee,
    vendorNetAmount,
  };
}

function centsToEur(value) {
  return Number((Number(value || 0) / 100).toFixed(2));
}

function buildBookingApprovalStatement({ booking, customer, items, agreement, invoice, payouts }) {
  const services = (items || [])
    .map((item) => `${item?.service?.title || 'Service'} (${item?.status || 'unknown'})`)
    .join(', ');
  return [
    'BOOKING APPROVAL CERTIFICATE',
    `Booking ID: ${booking.id}`,
    `Booking status: ${booking.status}`,
    `Event date: ${booking.eventDate ? new Date(booking.eventDate).toISOString() : '-'}`,
    `Customer: ${customer?.name || '-'} <${customer?.email || '-'}>`,
    `Customer address: ${customer?.customerProfile?.address || '-'}`,
    `Services: ${services || '-'}`,
    `Agreement version: ${agreement?.agreementVersion || '-'}`,
    `Customer accepted at: ${agreement?.customerAcceptedAt ? new Date(agreement.customerAcceptedAt).toISOString() : '-'}`,
    `Vendor accepted at: ${agreement?.vendorAcceptedAt ? new Date(agreement.vendorAcceptedAt).toISOString() : '-'}`,
    `Invoice status: ${invoice?.status || '-'}`,
    `Invoice amount (EUR): ${centsToEur(invoice?.amount || 0).toFixed(2)}`,
    `Invoice paid at: ${invoice?.paidAt ? new Date(invoice.paidAt).toISOString() : '-'}`,
    `Payouts count: ${(payouts || []).length}`,
    `Generated at: ${new Date().toISOString()}`,
  ].join('\n');
}

function escapePdfText(input) {
  const ascii = String(input || '')
    .replace(/[^\x20-\x7e]/g, '?')
    .replace(/\\/g, '\\\\')
    .replace(/\(/g, '\\(')
    .replace(/\)/g, '\\)');
  return ascii;
}

function buildSimplePdfBuffer(lines) {
  const maxLinesPerPage = 48;
  const lineChunks = [];
  for (let i = 0; i < lines.length; i += maxLinesPerPage) {
    lineChunks.push(lines.slice(i, i + maxLinesPerPage));
  }
  if (lineChunks.length === 0) lineChunks.push(['']);

  const objects = new Map();
  objects.set(1, '<< /Type /Catalog /Pages 2 0 R >>');
  const fontObjNum = 3;

  const kids = [];
  lineChunks.forEach((chunk, index) => {
    const pageObjNum = 4 + index * 2;
    const contentObjNum = pageObjNum + 1;
    kids.push(`${pageObjNum} 0 R`);
    const streamLines = [
      'BT',
      '/F1 10 Tf',
      '50 800 Td',
    ];
    chunk.forEach((line, idx) => {
      if (idx > 0) streamLines.push('0 -16 Td');
      streamLines.push(`(${escapePdfText(line)}) Tj`);
    });
    streamLines.push('ET');
    const stream = `${streamLines.join('\n')}\n`;
    objects.set(contentObjNum, `<< /Length ${Buffer.byteLength(stream, 'utf8')} >>\nstream\n${stream}endstream`);
    objects.set(
      pageObjNum,
      `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 ${fontObjNum} 0 R >> >> /Contents ${contentObjNum} 0 R >>`,
    );
  });

  objects.set(2, `<< /Type /Pages /Count ${lineChunks.length} /Kids [${kids.join(' ')}] >>`);
  objects.set(fontObjNum, '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>');

  const objectNumbers = Array.from(objects.keys()).sort((a, b) => a - b);
  let pdf = '%PDF-1.4\n';
  const offsets = new Map();
  for (const objNum of objectNumbers) {
    offsets.set(objNum, Buffer.byteLength(pdf, 'utf8'));
    pdf += `${objNum} 0 obj\n${objects.get(objNum)}\nendobj\n`;
  }
  const xrefPos = Buffer.byteLength(pdf, 'utf8');
  const maxObjNum = objectNumbers[objectNumbers.length - 1] || 0;
  pdf += `xref\n0 ${maxObjNum + 1}\n`;
  pdf += '0000000000 65535 f \n';
  for (let i = 1; i <= maxObjNum; i += 1) {
    const offset = offsets.get(i) || 0;
    pdf += `${String(offset).padStart(10, '0')} 00000 n \n`;
  }
  pdf += `trailer\n<< /Size ${maxObjNum + 1} /Root 1 0 R >>\nstartxref\n${xrefPos}\n%%EOF`;
  return Buffer.from(pdf, 'utf8');
}

function buildAccountingPackPdfLines(pack) {
  const lines = [
    'EventVenue Marketplace - Accounting Pack',
    `Generated: ${pack.generatedAt || '-'}`,
    `Booking ID: ${pack.booking?.id || '-'}`,
    `Booking Status: ${pack.booking?.status || '-'}`,
    `Event Date: ${pack.booking?.eventDate || '-'}`,
    '',
    'Customer',
    `Name: ${pack.customer?.name || '-'}`,
    `Email: ${pack.customer?.email || '-'}`,
    `Address: ${pack.customer?.address || '-'}`,
    `Phone: ${pack.customer?.phone || '-'}`,
    '',
    'Services',
  ];

  for (const service of pack.services || []) {
    lines.push(
      `- ${service.serviceTitle || service.serviceId || 'Service'} | ${service.status} | Offered EUR ${(Number(service.priceOfferedCents || 0) / 100).toFixed(2)} | Vendor ${service.vendor?.businessName || service.vendor?.email || '-'}`,
    );
  }

  lines.push('', 'Agreement');
  lines.push(`Customer accepted: ${pack.agreement?.customerAccepted ? 'yes' : 'no'} at ${pack.agreement?.customerAcceptedAt || '-'}`);
  lines.push(`Vendor accepted: ${pack.agreement?.vendorAccepted ? 'yes' : 'no'} at ${pack.agreement?.vendorAcceptedAt || '-'}`);
  lines.push('', 'Invoice');
  lines.push(`Invoice ID: ${pack.invoice?.id || '-'}`);
  lines.push(`Status: ${pack.invoice?.status || '-'}`);
  lines.push(`Amount EUR: ${Number(pack.invoice?.amountEur || 0).toFixed(2)}`);
  lines.push(`Paid At: ${pack.invoice?.paidAt || '-'}`);
  lines.push('', 'Payouts');
  for (const payout of pack.payouts || []) {
    lines.push(
      `- ${payout.id}: ${payout.status} | Gross ${(Number(payout.grossAmountEur || 0)).toFixed(2)} | Fee ${(Number(payout.platformFeeEur || 0)).toFixed(2)} | Net ${(Number(payout.vendorNetAmountEur || 0)).toFixed(2)} | Transfer ${payout.stripeTransferId || '-'}`,
    );
  }
  lines.push('', 'Totals');
  lines.push(`Invoice EUR: ${Number(pack.totals?.invoiceAmountEur || 0).toFixed(2)}`);
  lines.push(`Payout Gross EUR: ${Number(pack.totals?.payoutGrossEur || 0).toFixed(2)}`);
  lines.push(`Platform Fee EUR: ${Number(pack.totals?.payoutPlatformFeeEur || 0).toFixed(2)}`);
  lines.push(`Vendor Net EUR: ${Number(pack.totals?.payoutVendorNetEur || 0).toFixed(2)}`);
  lines.push('', 'Approval Certificate');
  for (const line of String(pack.approvalCertificate?.statementText || '').split('\n')) {
    lines.push(line);
  }
  lines.push('', `Certificate ID: ${pack.approvalCertificate?.certificateId || '-'}`);
  lines.push(`Issued By: ${pack.approvalCertificate?.issuedBy || '-'}`);
  lines.push(`Issued At: ${pack.approvalCertificate?.issuedAt || '-'}`);
  return lines;
}

async function buildAdminBookingAccountingPack(bookingId, req) {
  const booking = await prisma.booking.findUnique({
    where: { id: bookingId },
    include: {
      customer: {
        include: {
          customerProfile: {
            select: { address: true, phone: true },
          },
        },
      },
      items: {
        include: {
          service: { select: { id: true, title: true, category: true } },
          vendor: {
            include: {
              user: { select: { name: true, email: true } },
              vendorApplication: {
                select: { businessName: true, contactName: true, city: true, websiteUrl: true, email: true },
              },
            },
          },
        },
        orderBy: { createdAt: 'asc' },
      },
      invoice: true,
      agreement: true,
      payouts: {
        include: {
          vendor: {
            include: {
              user: { select: { name: true, email: true } },
              vendorApplication: {
                select: { businessName: true, contactName: true, city: true, websiteUrl: true, email: true },
              },
            },
          },
        },
        orderBy: { createdAt: 'asc' },
      },
      offerEvents: {
        orderBy: { createdAt: 'asc' },
      },
    },
  });
  if (!booking) return null;

  const targetIds = [
    booking.id,
    booking.invoice?.id || null,
    ...(booking.payouts || []).map((row) => row.id),
  ].filter(Boolean);

  let auditTrail = [];
  if (supportsPrismaModel('adminAuditLog')) {
    try {
      auditTrail = await prisma.adminAuditLog.findMany({
        where: {
          OR: [
            { targetId: { in: targetIds } },
            { metaJson: { contains: booking.id } },
          ],
        },
        orderBy: { createdAt: 'asc' },
        take: 300,
      });
    } catch (error) {
      if (!isPrismaTableMissingError(error)) throw error;
    }
  }

  const totals = {
    invoiceAmountCents: Number(booking.invoice?.amount || 0),
    invoiceAmountEur: centsToEur(booking.invoice?.amount || 0),
    payoutGrossCents: (booking.payouts || []).reduce((sum, row) => sum + Number(row.grossAmount || 0), 0),
    payoutPlatformFeeCents: (booking.payouts || []).reduce((sum, row) => sum + Number(row.platformFee || 0), 0),
    payoutVendorNetCents: (booking.payouts || []).reduce((sum, row) => sum + Number(row.vendorNetAmount || 0), 0),
  };
  totals.payoutGrossEur = centsToEur(totals.payoutGrossCents);
  totals.payoutPlatformFeeEur = centsToEur(totals.payoutPlatformFeeCents);
  totals.payoutVendorNetEur = centsToEur(totals.payoutVendorNetCents);

  const statementText = buildBookingApprovalStatement({
    booking,
    customer: booking.customer,
    items: booking.items || [],
    agreement: booking.agreement,
    invoice: booking.invoice,
    payouts: booking.payouts || [],
  });

  return {
    generatedAt: new Date().toISOString(),
    booking: {
      id: booking.id,
      status: booking.status,
      eventDate: booking.eventDate ? new Date(booking.eventDate).toISOString() : null,
      createdAt: booking.createdAt ? new Date(booking.createdAt).toISOString() : null,
      updatedAt: booking.updatedAt ? new Date(booking.updatedAt).toISOString() : null,
    },
    customer: {
      id: booking.customer?.id || null,
      name: booking.customer?.name || null,
      email: booking.customer?.email || null,
      address: booking.customer?.customerProfile?.address || null,
      phone: booking.customer?.customerProfile?.phone || null,
    },
    services: (booking.items || []).map((item) => ({
      bookingItemId: item.id,
      serviceId: item.serviceId,
      serviceTitle: item.service?.title || null,
      serviceCategory: item.service?.category || null,
      status: item.status,
      priceOfferedCents: Number(item.priceOffered || 0),
      finalPriceCents: item.finalPrice != null ? Number(item.finalPrice) : null,
      vendor: {
        vendorId: item.vendorId,
        businessName: item.vendor?.vendorApplication?.businessName || item.vendor?.businessName || item.vendor?.user?.name || null,
        contactName: item.vendor?.vendorApplication?.contactName || item.vendor?.user?.name || null,
        email: item.vendor?.vendorApplication?.email || item.vendor?.user?.email || null,
        city: item.vendor?.vendorApplication?.city || null,
        websiteUrl: item.vendor?.vendorApplication?.websiteUrl || null,
      },
    })),
    agreement: booking.agreement
      ? {
          id: booking.agreement.id,
          agreementVersion: booking.agreement.agreementVersion || null,
          customerAccepted: Boolean(booking.agreement.customerAccepted),
          customerAcceptedAt: booking.agreement.customerAcceptedAt ? new Date(booking.agreement.customerAcceptedAt).toISOString() : null,
          customerAcceptedIP: booking.agreement.customerAcceptedIP || null,
          vendorAccepted: Boolean(booking.agreement.vendorAccepted),
          vendorAcceptedAt: booking.agreement.vendorAcceptedAt ? new Date(booking.agreement.vendorAcceptedAt).toISOString() : null,
        }
      : null,
    invoice: booking.invoice
      ? {
          id: booking.invoice.id,
          status: booking.invoice.status,
          amountCents: Number(booking.invoice.amount || 0),
          amountEur: centsToEur(booking.invoice.amount || 0),
          stripeSessionId: booking.invoice.stripeSessionId || null,
          issuedAt: booking.invoice.issuedAt ? new Date(booking.invoice.issuedAt).toISOString() : null,
          paidAt: booking.invoice.paidAt ? new Date(booking.invoice.paidAt).toISOString() : null,
          failedAt: booking.invoice.failedAt ? new Date(booking.invoice.failedAt).toISOString() : null,
        }
      : null,
    payouts: (booking.payouts || []).map((row) => ({
      id: row.id,
      status: row.status,
      stripeTransferId: row.stripeTransferId || null,
      grossAmountCents: Number(row.grossAmount || 0),
      grossAmountEur: centsToEur(row.grossAmount || 0),
      platformFeeCents: Number(row.platformFee || 0),
      platformFeeEur: centsToEur(row.platformFee || 0),
      vendorNetAmountCents: Number(row.vendorNetAmount || 0),
      vendorNetAmountEur: centsToEur(row.vendorNetAmount || 0),
      vendor: {
        vendorId: row.vendorId,
        businessName: row.vendor?.vendorApplication?.businessName || row.vendor?.businessName || row.vendor?.user?.name || null,
        contactName: row.vendor?.vendorApplication?.contactName || row.vendor?.user?.name || null,
        email: row.vendor?.vendorApplication?.email || row.vendor?.user?.email || null,
        city: row.vendor?.vendorApplication?.city || null,
        websiteUrl: row.vendor?.vendorApplication?.websiteUrl || null,
      },
      createdAt: row.createdAt ? new Date(row.createdAt).toISOString() : null,
      updatedAt: row.updatedAt ? new Date(row.updatedAt).toISOString() : null,
    })),
    totals,
    offerHistory: (booking.offerEvents || []).map((event) => ({
      id: event.id,
      bookingItemId: event.bookingItemId,
      actorRole: event.actorRole,
      type: event.type,
      offerVersion: event.offerVersion,
      priceCents: event.priceCents != null ? Number(event.priceCents) : null,
      reason: event.reason || null,
      createdAt: event.createdAt ? new Date(event.createdAt).toISOString() : null,
    })),
    adminAuditTrail: (auditTrail || []).map((row) => ({
      id: row.id,
      adminId: row.adminId,
      action: row.action,
      targetId: row.targetId || null,
      metaJson: row.metaJson || null,
      createdAt: row.createdAt ? new Date(row.createdAt).toISOString() : null,
    })),
    approvalCertificate: {
      certificateId: `APPROVAL-${booking.id}-${Date.now()}`,
      statementText,
      issuedAt: new Date().toISOString(),
      issuedBy: getAdminActorId(req),
    },
  };
}

async function getVendorApplicationByEmail(email) {
  return prisma.vendorApplication.findFirst({
    where: { email: { equals: String(email || '').trim(), mode: 'insensitive' } },
  });
}

function normalizeVendorEmail(email) {
  return String(email || '').trim().toLowerCase();
}

function normalizeContractSignatureStatus(status) {
  const value = String(status || '').trim().toLowerCase();
  if (!value) return 'sent';
  if (['sent', 'created', 'pending'].includes(value)) return 'sent';
  if (['viewed', 'opened'].includes(value)) return 'viewed';
  if (['completed', 'signed', 'completed_signed'].includes(value)) return 'completed';
  if (['declined', 'rejected'].includes(value)) return 'declined';
  if (['voided', 'canceled', 'cancelled', 'expired'].includes(value)) return 'voided';
  return value;
}

function mapContractSignatureRow(row) {
  return {
    id: row.id,
    provider: row.provider,
    externalEnvelopeId: row.externalEnvelopeId || null,
    status: normalizeContractSignatureStatus(row.status),
    signingUrl: row.signingUrl || null,
    contractVersion: row.contractVersion || null,
    sentAt: row.sentAt ? new Date(row.sentAt).toISOString() : null,
    signedAt: row.signedAt ? new Date(row.signedAt).toISOString() : null,
    declinedAt: row.declinedAt ? new Date(row.declinedAt).toISOString() : null,
    voidedAt: row.voidedAt ? new Date(row.voidedAt).toISOString() : null,
    documentUrl: row.documentUrl || null,
    auditTrailUrl: row.auditTrailUrl || null,
    lastEventAt: row.lastEventAt ? new Date(row.lastEventAt).toISOString() : null,
    createdAt: row.createdAt ? new Date(row.createdAt).toISOString() : null,
    updatedAt: row.updatedAt ? new Date(row.updatedAt).toISOString() : null,
  };
}

async function getLatestVendorContractSignature(vendorApplicationId) {
  if (!supportsPrismaModel('vendorContractSignature')) return null;
  try {
    const row = await prisma.vendorContractSignature.findFirst({
      where: { vendorApplicationId: String(vendorApplicationId) },
      orderBy: [{ createdAt: 'desc' }],
    });
    return row ? mapContractSignatureRow(row) : null;
  } catch (error) {
    if (isPrismaTableMissingError(error)) return null;
    throw error;
  }
}

function supportsPrismaModel(modelName) {
  return Boolean(prisma?.[modelName]);
}

function isPrismaTableMissingError(error) {
  const code = String(error?.code || '');
  return code === 'P2021' || code === 'P2022';
}

function getAdminActorId(req) {
  const payload = getJwtPayload(req);
  if (payload?.role === 'admin' && payload?.sub) return String(payload.sub);
  return 'legacy_admin';
}

async function writeAdminAuditLog(req, action, targetId = null, meta = null) {
  if (!supportsPrismaModel('adminAuditLog')) return;
  try {
    await prisma.adminAuditLog.create({
      data: {
        adminId: getAdminActorId(req),
        action: String(action || 'unknown'),
        targetId: targetId ? String(targetId) : null,
        metaJson: meta ? JSON.stringify(meta) : null,
      },
    });
  } catch (error) {
    if (!isPrismaTableMissingError(error)) throw error;
  }
}

async function appendLedgerEntry(entry) {
  if (!supportsPrismaModel('ledgerEntry')) return null;
  try {
    return await prisma.ledgerEntry.create({
      data: {
        entryType: String(entry?.entryType || 'unknown'),
        bookingId: entry?.bookingId ? String(entry.bookingId) : null,
        requestId: entry?.requestId ? String(entry.requestId) : null,
        offerId: entry?.offerId ? String(entry.offerId) : null,
        invoiceId: entry?.invoiceId ? String(entry.invoiceId) : null,
        payoutId: entry?.payoutId ? String(entry.payoutId) : null,
        vendorId: entry?.vendorId ? String(entry.vendorId) : null,
        customerId: entry?.customerId ? String(entry.customerId) : null,
        amountCents: Number.isFinite(Number(entry?.amountCents)) ? Math.round(Number(entry.amountCents)) : null,
        currency: normalizeOptionalString(entry?.currency, 10) || 'eur',
        direction: normalizeOptionalString(entry?.direction, 32),
        referenceType: normalizeOptionalString(entry?.referenceType, 64),
        referenceId: normalizeOptionalString(entry?.referenceId, 191),
        note: normalizeOptionalString(entry?.note, 1200),
        payload: entry?.payload || null,
      },
    });
  } catch (error) {
    if (!isPrismaTableMissingError(error)) throw error;
    return null;
  }
}

async function appendNegotiationMessage(tx, { bookingId, senderRole, proposedCents = null, reason = null }) {
  if (!supportsPrismaModel('negotiationMessage')) return;
  try {
    const proposedNet = Number.isFinite(Number(proposedCents))
      ? Number((Number(proposedCents) / 100).toFixed(2))
      : null;
    await tx.negotiationMessage.create({
      data: {
        bookingId: String(bookingId),
        senderRole: String(senderRole || 'SYSTEM').toUpperCase(),
        proposedNet,
        reason: reason ? String(reason).slice(0, 4000) : null,
      },
    });
  } catch (error) {
    if (!isPrismaTableMissingError(error)) throw error;
  }
}

async function reserveWebhookEvent(event) {
  if (!supportsPrismaModel('stripeWebhookEvent')) return { duplicate: false };
  try {
    await prisma.stripeWebhookEvent.create({
      data: {
        stripeEventId: String(event.id),
        eventType: String(event.type),
        payload: event?.data?.object || null,
      },
    });
    return { duplicate: false };
  } catch (error) {
    if (String(error?.code || '') === 'P2002') return { duplicate: true };
    if (isPrismaTableMissingError(error)) return { duplicate: false };
    throw error;
  }
}

async function markWebhookEventProcessed(stripeEventId) {
  if (!supportsPrismaModel('stripeWebhookEvent')) return;
  try {
    await prisma.stripeWebhookEvent.updateMany({
      where: { stripeEventId: String(stripeEventId) },
      data: { processedAt: new Date() },
    });
  } catch (error) {
    if (!isPrismaTableMissingError(error)) throw error;
  }
}

async function releaseWebhookEventReservation(stripeEventId) {
  if (!supportsPrismaModel('stripeWebhookEvent')) return;
  try {
    await prisma.stripeWebhookEvent.deleteMany({
      where: { stripeEventId: String(stripeEventId), processedAt: null },
    });
  } catch (error) {
    if (!isPrismaTableMissingError(error)) throw error;
  }
}

function defaultVendorCompliance() {
  return {
    contractAccepted: false,
    contractAcceptedAt: null,
    contractVersion: null,
    contractAcceptedByUserId: null,
    contractAcceptedIP: null,
    trainingCompleted: false,
    trainingCompletedAt: null,
    updatedAt: null,
  };
}

async function readVendorComplianceStore() {
  if (!ENABLE_LEGACY_COMPLIANCE_JSON) return { vendors: {} };
  try {
    const raw = await fs.readFile(VENDOR_COMPLIANCE_FILE, 'utf8');
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') return { vendors: {} };
    return {
      vendors: parsed.vendors && typeof parsed.vendors === 'object' ? parsed.vendors : {},
    };
  } catch {
    return { vendors: {} };
  }
}

async function writeVendorComplianceStore(store) {
  if (!ENABLE_LEGACY_COMPLIANCE_JSON) return;
  await fs.mkdir(path.dirname(VENDOR_COMPLIANCE_FILE), { recursive: true });
  await fs.writeFile(VENDOR_COMPLIANCE_FILE, JSON.stringify(store, null, 2), 'utf8');
}

function mapComplianceRowToPayload(row) {
  return {
    contractAccepted: Boolean(row.contractAccepted),
    contractAcceptedAt: row.contractAcceptedAt ? new Date(row.contractAcceptedAt).toISOString() : null,
    contractVersion: row.contractVersionAccepted || null,
    contractAcceptedByUserId: row.contractAcceptedByUserId || null,
    contractAcceptedIP: row.contractAcceptedIP || null,
    trainingCompleted: Boolean(row.trainingCompleted),
    trainingCompletedAt: row.trainingCompletedAt ? new Date(row.trainingCompletedAt).toISOString() : null,
    connectOnboardingStatus: row.connectOnboardingStatus || 'NOT_STARTED',
    payoutsEnabled: Boolean(row.payoutsEnabled),
    chargesEnabled: Boolean(row.chargesEnabled),
    updatedAt: row.updatedAt ? new Date(row.updatedAt).toISOString() : null,
  };
}

function mapCompliancePayloadToRow(payload) {
  return {
    contractAccepted: Boolean(payload.contractAccepted),
    contractAcceptedAt: payload.contractAcceptedAt ? new Date(payload.contractAcceptedAt) : null,
    contractVersionAccepted: payload.contractVersion || null,
    contractAcceptedByUserId: payload.contractAcceptedByUserId || null,
    contractAcceptedIP: payload.contractAcceptedIP || null,
    trainingCompleted: Boolean(payload.trainingCompleted),
    trainingCompletedAt: payload.trainingCompletedAt ? new Date(payload.trainingCompletedAt) : null,
    connectOnboardingStatus: String(payload.connectOnboardingStatus || 'NOT_STARTED'),
    payoutsEnabled: Boolean(payload.payoutsEnabled),
    chargesEnabled: Boolean(payload.chargesEnabled),
  };
}

async function upsertVendorComplianceByEmail(vendorEmail, payload) {
  if (!supportsPrismaModel('vendorCompliance')) return false;
  const app = await getVendorApplicationByEmail(vendorEmail);
  if (!app) return false;
  await prisma.$transaction(async (tx) => {
    const { vendorProfile } = await ensureVendorIdentityFromApplication(tx, app);
    await tx.vendorCompliance.upsert({
      where: { vendorId: vendorProfile.id },
      update: mapCompliancePayloadToRow(payload),
      create: {
        vendorId: vendorProfile.id,
        ...mapCompliancePayloadToRow(payload),
      },
    });
  });
  return true;
}

async function getVendorCompliance(vendorEmail) {
  const store = await readVendorComplianceStore();
  const key = normalizeVendorEmail(vendorEmail);
  const baseFallback = {
    ...defaultVendorCompliance(),
    ...(store.vendors[key] || {}),
  };
  if (!supportsPrismaModel('vendorCompliance')) return baseFallback;
  try {
    const app = await getVendorApplicationByEmail(vendorEmail);
    if (!app) return baseFallback;
    const profile = await prisma.vendorProfile.findUnique({
      where: { vendorApplicationId: app.id },
    });
    const fallback = {
      ...baseFallback,
      ...(profile
        ? {
            contractAccepted: Boolean(profile.contractAccepted) || Boolean(baseFallback.contractAccepted),
            contractAcceptedAt:
              profile.contractAcceptedAt
                ? new Date(profile.contractAcceptedAt).toISOString()
                : baseFallback.contractAcceptedAt || null,
            trainingCompleted: Boolean(profile.trainingCompleted) || Boolean(baseFallback.trainingCompleted),
            trainingCompletedAt:
              profile.trainingCompletedAt
                ? new Date(profile.trainingCompletedAt).toISOString()
                : baseFallback.trainingCompletedAt || null,
          }
        : {}),
    };
    if (!profile) return fallback;
    const row = await prisma.vendorCompliance.findUnique({
      where: { vendorId: profile.id },
    });
    if (!row) {
      if (ENABLE_LEGACY_COMPLIANCE_JSON && store.vendors[key]) {
        await upsertVendorComplianceByEmail(vendorEmail, fallback);
        const migrated = await prisma.vendorCompliance.findUnique({
          where: { vendorId: profile.id },
        });
        if (migrated) return { ...fallback, ...mapComplianceRowToPayload(migrated) };
      }
      return fallback;
    }
    return {
      ...fallback,
      ...mapComplianceRowToPayload(row),
      updatedAt: mapComplianceRowToPayload(row).updatedAt || fallback.updatedAt,
    };
  } catch (error) {
    if (isPrismaTableMissingError(error)) return baseFallback;
    throw error;
  }
}

async function updateVendorCompliance(vendorEmail, updater) {
  const store = await readVendorComplianceStore();
  const key = normalizeVendorEmail(vendorEmail);
  const current = {
    ...defaultVendorCompliance(),
    ...(store.vendors[key] || {}),
  };
  const next = {
    ...current,
    ...updater(current),
    updatedAt: new Date().toISOString(),
  };
  if (ENABLE_LEGACY_COMPLIANCE_JSON) {
    store.vendors[key] = next;
    await writeVendorComplianceStore(store);
  }
  if (supportsPrismaModel('vendorCompliance')) {
    try {
      await upsertVendorComplianceByEmail(vendorEmail, next);
    } catch (error) {
      if (!isPrismaTableMissingError(error)) throw error;
    }
  }
  return next;
}

async function backfillAllLegacyVendorComplianceToDb() {
  if (!supportsPrismaModel('vendorCompliance')) return { migrated: 0, total: 0 };
  const store = await readVendorComplianceStore();
  const entries = Object.entries(store.vendors || {});
  let migrated = 0;
  for (const [email, payload] of entries) {
    try {
      const ok = await upsertVendorComplianceByEmail(email, {
        ...defaultVendorCompliance(),
        ...(payload || {}),
      });
      if (ok) migrated += 1;
    } catch (error) {
      if (!isPrismaTableMissingError(error)) throw error;
    }
  }
  return { migrated, total: entries.length };
}

function buildVendorActivationState(vendor, compliance) {
  const adminApproved = vendor.status === 'approved';
  const contractAccepted = Boolean(compliance.contractAccepted);
  const trainingCompleted = Boolean(compliance.trainingCompleted);
  const canBecomeActive = adminApproved && contractAccepted && trainingCompleted;
  return {
    ...compliance,
    adminApproved,
    canBecomeActive,
    canPublish: canBecomeActive,
  };
}

async function assertVendorCanPublishOrRespond(vendor) {
  if (vendor.status !== 'approved') {
    throw httpError(403, `Vendor account is ${vendor.status}. Admin approval required.`);
  }
  const compliance = await getVendorCompliance(vendor.email);
  const activation = buildVendorActivationState(vendor, compliance);
  if (!activation.contractAccepted || !activation.trainingCompleted) {
    throw httpError(403, 'Vendor must accept contract and complete training before publishing or responding.');
  }
  if (ENFORCE_VENDOR_PAYOUT_READINESS) {
    const payout = await getVendorPayoutReadiness(vendor);
    if (!payout.ready) {
      throw httpError(403, `Vendor payout setup incomplete: ${payout.reason}`);
    }
  }
  return activation;
}

async function getVendorPayoutReadiness(vendor) {
  const persistReadiness = async (payload) => {
    if (!vendor?.email) return payload;
    try {
      await updateVendorCompliance(vendor.email, (current) => ({
        ...current,
        connectOnboardingStatus: payload.connectOnboardingStatus,
        payoutsEnabled: Boolean(payload.payoutsEnabled),
        chargesEnabled: Boolean(payload.chargesEnabled),
      }));
      if (supportsPrismaModel('vendorProfile')) {
        await prisma.vendorProfile.updateMany({
          where: {
            user: {
              email: { equals: vendor.email, mode: 'insensitive' },
            },
          },
          data: {
            stripePayoutsEnabled: Boolean(payload.payoutsEnabled),
            stripeChargesEnabled: Boolean(payload.chargesEnabled),
            stripeAccountId: vendor.stripeAccountId || null,
          },
        });
      }
    } catch {
      // Ignore persistence errors to keep request flow resilient.
    }
    return payload;
  };
  if (!vendor?.stripeAccountId) {
    return persistReadiness({
      ready: false,
      reason: 'Stripe Connect account not linked',
      connectOnboardingStatus: 'NOT_STARTED',
      payoutsEnabled: false,
      chargesEnabled: false,
    });
  }
  if (!stripe) {
    return persistReadiness({
      ready: true,
      reason: null,
      connectOnboardingStatus: 'COMPLETED',
      payoutsEnabled: true,
      chargesEnabled: true,
    });
  }
  try {
    const account = await stripe.accounts.retrieve(vendor.stripeAccountId);
    const payoutsEnabled = Boolean(account.payouts_enabled);
    const chargesEnabled = Boolean(account.charges_enabled);
    const ready = payoutsEnabled && chargesEnabled;
    return persistReadiness({
      ready,
      reason: ready ? null : 'Stripe onboarding not fully completed (charges/payouts disabled)',
      connectOnboardingStatus: ready ? 'COMPLETED' : 'IN_PROGRESS',
      payoutsEnabled,
      chargesEnabled,
    });
  } catch {
    return persistReadiness({
      ready: false,
      reason: 'Stripe account lookup failed',
      connectOnboardingStatus: 'IN_PROGRESS',
      payoutsEnabled: false,
      chargesEnabled: false,
    });
  }
}

async function syncVendorProfileActivationStatus(tx, vendorApplication) {
  const compliance = await getVendorCompliance(vendorApplication.email);
  const activation = buildVendorActivationState(vendorApplication, compliance);
  const identity = await ensureVendorIdentityFromApplication(tx, vendorApplication);
  const { vendorProfile } = identity;
  const nextStatus = activation.canBecomeActive
    ? 'active'
    : mapVendorApplicationStatusToProfileStatus(vendorApplication.status);
  if (vendorProfile.status !== nextStatus) {
    await tx.vendorProfile.update({
      where: { id: vendorProfile.id },
      data: {
        status: nextStatus,
        vendorStatus: nextStatus,
        contractAccepted: Boolean(compliance.contractAccepted),
        contractAcceptedAt: compliance.contractAcceptedAt ? new Date(compliance.contractAcceptedAt) : null,
        trainingCompleted: Boolean(compliance.trainingCompleted),
        trainingCompletedAt: compliance.trainingCompletedAt ? new Date(compliance.trainingCompletedAt) : null,
        stripePayoutsEnabled: Boolean(compliance.payoutsEnabled),
        stripeChargesEnabled: Boolean(compliance.chargesEnabled),
        stripeAccountId: vendorApplication.stripeAccountId || vendorProfile.stripeAccountId || null,
      },
    });
  } else {
    await tx.vendorProfile.update({
      where: { id: vendorProfile.id },
      data: {
        vendorStatus: nextStatus,
        contractAccepted: Boolean(compliance.contractAccepted),
        contractAcceptedAt: compliance.contractAcceptedAt ? new Date(compliance.contractAcceptedAt) : null,
        trainingCompleted: Boolean(compliance.trainingCompleted),
        trainingCompletedAt: compliance.trainingCompletedAt ? new Date(compliance.trainingCompletedAt) : null,
        stripePayoutsEnabled: Boolean(compliance.payoutsEnabled),
        stripeChargesEnabled: Boolean(compliance.chargesEnabled),
        stripeAccountId: vendorApplication.stripeAccountId || vendorProfile.stripeAccountId || null,
      },
    });
  }
  return { ...identity, activation };
}

function defaultServiceAgreement() {
  return {
    agreementVersion: null,
    agreementAcceptedByCustomerAt: null,
    agreementAcceptedByCustomerIp: null,
    agreementAcceptedByVendorAt: null,
    updatedAt: null,
  };
}

async function readServiceAgreementStore() {
  try {
    const raw = await fs.readFile(SERVICE_AGREEMENT_FILE, 'utf8');
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') return { bookings: {} };
    return {
      bookings: parsed.bookings && typeof parsed.bookings === 'object' ? parsed.bookings : {},
    };
  } catch {
    return { bookings: {} };
  }
}

async function writeServiceAgreementStore(store) {
  await fs.mkdir(path.dirname(SERVICE_AGREEMENT_FILE), { recursive: true });
  await fs.writeFile(SERVICE_AGREEMENT_FILE, JSON.stringify(store, null, 2), 'utf8');
}

async function getServiceAgreementRecord(bookingId) {
  const store = await readServiceAgreementStore();
  const fallback = {
    ...defaultServiceAgreement(),
    ...(store.bookings[String(bookingId)] || {}),
  };
  if (!supportsPrismaModel('agreement')) return fallback;
  try {
    const row = await prisma.agreement.findUnique({
      where: { bookingId: String(bookingId) },
    });
    if (!row) return fallback;
    return {
      ...fallback,
      agreementVersion: row.agreementVersion || null,
      agreementAcceptedByCustomerAt: row.customerAcceptedAt ? new Date(row.customerAcceptedAt).toISOString() : null,
      agreementAcceptedByCustomerIp: row.customerAcceptedIP || null,
      agreementAcceptedByVendorAt: row.vendorAcceptedAt ? new Date(row.vendorAcceptedAt).toISOString() : null,
      updatedAt: row.updatedAt ? new Date(row.updatedAt).toISOString() : fallback.updatedAt,
      netAmount: row.netAmount ?? null,
      vatAmount: row.vatAmount ?? null,
      grossAmount: row.grossAmount ?? null,
      platformFee: row.platformFee ?? null,
      vendorNetAmount: row.vendorNetAmount ?? null,
    };
  } catch (error) {
    if (isPrismaTableMissingError(error)) return fallback;
    throw error;
  }
}

async function updateServiceAgreementRecord(bookingId, updater) {
  const store = await readServiceAgreementStore();
  const key = String(bookingId);
  const current = {
    ...defaultServiceAgreement(),
    ...(store.bookings[key] || {}),
  };
  const next = {
    ...current,
    ...updater(current),
    updatedAt: new Date().toISOString(),
  };
  store.bookings[key] = next;
  await writeServiceAgreementStore(store);
  if (supportsPrismaModel('agreement')) {
    try {
      const booking = await prisma.booking.findUnique({
        where: { id: String(bookingId) },
        include: { items: true },
      });
      if (booking) {
        const primaryVendorId = booking.items[0]?.vendorId || null;
        await prisma.agreement.upsert({
          where: { bookingId: booking.id },
          update: {
            agreementVersion: next.agreementVersion || null,
            customerAccepted: Boolean(next.agreementAcceptedByCustomerAt),
            customerAcceptedAt: next.agreementAcceptedByCustomerAt ? new Date(next.agreementAcceptedByCustomerAt) : null,
            customerAcceptedIP: next.agreementAcceptedByCustomerIp || null,
            vendorAccepted: Boolean(next.agreementAcceptedByVendorAt),
            vendorAcceptedAt: next.agreementAcceptedByVendorAt ? new Date(next.agreementAcceptedByVendorAt) : null,
            netAmount: Number.isFinite(Number(next.netAmount)) ? Math.round(Number(next.netAmount)) : null,
            vatAmount: Number.isFinite(Number(next.vatAmount)) ? Math.round(Number(next.vatAmount)) : null,
            grossAmount: Number.isFinite(Number(next.grossAmount)) ? Math.round(Number(next.grossAmount)) : null,
            platformFee: Number.isFinite(Number(next.platformFee)) ? Math.round(Number(next.platformFee)) : null,
            vendorNetAmount: Number.isFinite(Number(next.vendorNetAmount)) ? Math.round(Number(next.vendorNetAmount)) : null,
            vendorId: primaryVendorId,
          },
          create: {
            bookingId: booking.id,
            customerId: booking.customerId,
            vendorId: primaryVendorId,
            agreementVersion: next.agreementVersion || null,
            customerAccepted: Boolean(next.agreementAcceptedByCustomerAt),
            customerAcceptedAt: next.agreementAcceptedByCustomerAt ? new Date(next.agreementAcceptedByCustomerAt) : null,
            customerAcceptedIP: next.agreementAcceptedByCustomerIp || null,
            vendorAccepted: Boolean(next.agreementAcceptedByVendorAt),
            vendorAcceptedAt: next.agreementAcceptedByVendorAt ? new Date(next.agreementAcceptedByVendorAt) : null,
            netAmount: Number.isFinite(Number(next.netAmount)) ? Math.round(Number(next.netAmount)) : null,
            vatAmount: Number.isFinite(Number(next.vatAmount)) ? Math.round(Number(next.vatAmount)) : null,
            grossAmount: Number.isFinite(Number(next.grossAmount)) ? Math.round(Number(next.grossAmount)) : null,
            platformFee: Number.isFinite(Number(next.platformFee)) ? Math.round(Number(next.platformFee)) : null,
            vendorNetAmount: Number.isFinite(Number(next.vendorNetAmount)) ? Math.round(Number(next.vendorNetAmount)) : null,
          },
        });
      }
    } catch (error) {
      if (!isPrismaTableMissingError(error)) throw error;
    }
  }
  return next;
}

async function getVendorApplicationFromBookingItem(tx, item) {
  const vendorProfile = await tx.vendorProfile.findUnique({
    where: { id: item.vendorId },
    include: { vendorApplication: true, user: true },
  });
  if (!vendorProfile) return null;
  if (vendorProfile.vendorApplication) return vendorProfile.vendorApplication;
  if (!vendorProfile.user?.email) return null;
  return tx.vendorApplication.findFirst({
    where: { email: { equals: vendorProfile.user.email, mode: 'insensitive' } },
  });
}

async function getStripeDestinationForVendorProfile(vendorId) {
  const vendorProfile = await prisma.vendorProfile.findUnique({
    where: { id: String(vendorId) },
    include: { vendorApplication: true, user: true },
  });
  if (!vendorProfile) return null;
  if (vendorProfile.vendorApplication?.stripeAccountId) return vendorProfile.vendorApplication.stripeAccountId;
  if (!vendorProfile.user?.email) return null;
  const app = await prisma.vendorApplication.findFirst({
    where: { email: { equals: vendorProfile.user.email, mode: 'insensitive' } },
    select: { stripeAccountId: true },
  });
  return app?.stripeAccountId || null;
}

async function createOrUpdatePayoutRecordsForBooking(bookingId, options = {}) {
  const targetStatus = String(options.status || 'pending');
  if (!supportsPrismaModel('payout')) return;
  try {
    const booking = await prisma.booking.findUnique({
      where: { id: String(bookingId) },
      include: { items: true },
    });
    if (!booking || booking.items.length === 0) return;

    const perVendor = new Map();
    for (const item of booking.items) {
      const itemGrossAmount = Math.max(0, Number(item.finalPriceCents || item.latestPriceCents || 0));
      if (itemGrossAmount <= 0) continue;
      const existing = perVendor.get(item.vendorId) || { grossAmount: 0 };
      existing.grossAmount += itemGrossAmount;
      perVendor.set(item.vendorId, existing);
    }

    for (const [vendorId, totals] of perVendor.entries()) {
      const grossAmount = Math.max(0, Number(totals.grossAmount || 0));
      if (grossAmount <= 0) continue;
      const computed = computeTotalsFromGross(grossAmount);
      const platformFee = computed.platformFee;
      const vendorNetAmount = computed.vendorNetAmount;
      const existing = await prisma.payout.findUnique({
        where: {
          bookingId_vendorId: {
            bookingId: booking.id,
            vendorId,
          },
        },
      });

      await prisma.payout.upsert({
        where: {
          bookingId_vendorId: {
            bookingId: booking.id,
            vendorId,
          },
        },
        update: {
          grossAmount,
          platformFee,
          vendorNetAmount,
          status: existing?.stripeTransferId ? 'paid' : targetStatus,
        },
        create: {
          bookingId: booking.id,
          vendorId,
          grossAmount,
          platformFee,
          vendorNetAmount,
          status: targetStatus,
        },
      });

      await appendLedgerEntry({
        entryType: 'payout_record_upserted',
        bookingId: booking.id,
        vendorId,
        amountCents: vendorNetAmount,
        direction: 'platform_to_vendor_pending',
        referenceType: 'booking_vendor',
        referenceId: `${booking.id}:${vendorId}`,
        note: `Payout record upserted with status ${targetStatus}`,
        payload: { grossAmount, platformFee, vendorNetAmount, targetStatus },
      });
    }
  } catch (error) {
    if (!isPrismaTableMissingError(error)) throw error;
  }
}

async function createStripeTransfersForBookingPayouts(bookingId, paymentIntentId) {
  if (!stripe || !supportsPrismaModel('payout')) return;
  if (!bookingId || !paymentIntentId) return;

  const paymentIntent = await stripe.paymentIntents.retrieve(String(paymentIntentId), {
    expand: ['latest_charge'],
  });
  const transferGroup = paymentIntent.transfer_group || `booking_${bookingId}`;
  const latestChargeId = typeof paymentIntent.latest_charge === 'string'
    ? paymentIntent.latest_charge
    : paymentIntent.latest_charge?.id;

  const payouts = await prisma.payout.findMany({
    where: { bookingId: String(bookingId) },
  });
  for (const payout of payouts) {
    if (payout.stripeTransferId) continue;
    if (payout.vendorNetAmount <= 0) {
      await prisma.payout.update({
        where: { id: payout.id },
        data: { status: 'failed' },
      });
      await appendLedgerEntry({
        entryType: 'payout_failed',
        bookingId: bookingId,
        payoutId: payout.id,
        vendorId: payout.vendorId,
        amountCents: payout.vendorNetAmount,
        direction: 'platform_to_vendor',
        referenceType: 'payout',
        referenceId: payout.id,
        note: 'Payout failed: non-positive vendorNetAmount',
      });
      continue;
    }

    const destination = await getStripeDestinationForVendorProfile(payout.vendorId);
    if (!destination) {
      await prisma.payout.update({
        where: { id: payout.id },
        data: { status: 'failed' },
      });
      await appendLedgerEntry({
        entryType: 'payout_failed',
        bookingId: bookingId,
        payoutId: payout.id,
        vendorId: payout.vendorId,
        amountCents: payout.vendorNetAmount,
        direction: 'platform_to_vendor',
        referenceType: 'payout',
        referenceId: payout.id,
        note: 'Payout failed: missing Stripe destination account',
      });
      continue;
    }

    try {
      const transfer = await stripe.transfers.create(
        {
          amount: payout.vendorNetAmount,
          currency: 'eur',
          destination,
          transfer_group: transferGroup,
          source_transaction: latestChargeId || undefined,
          metadata: {
            bookingId: String(bookingId),
            vendorId: String(payout.vendorId),
            payoutId: String(payout.id),
            paymentIntentId: String(paymentIntentId),
          },
        },
        {
          idempotencyKey: `booking:${bookingId}:vendor:${payout.vendorId}:pi:${paymentIntentId}`,
        },
      );

      await prisma.payout.update({
        where: { id: payout.id },
        data: {
          stripeTransferId: transfer.id,
          status: 'paid',
        },
      });
      await appendLedgerEntry({
        entryType: 'payout_paid',
        bookingId: bookingId,
        payoutId: payout.id,
        vendorId: payout.vendorId,
        amountCents: payout.vendorNetAmount,
        direction: 'platform_to_vendor',
        referenceType: 'stripe_transfer',
        referenceId: transfer.id,
        note: 'Stripe transfer completed',
        payload: { transferGroup, destination, paymentIntentId },
      });
    } catch {
      await prisma.payout.update({
        where: { id: payout.id },
        data: { status: 'failed' },
      });
      await appendLedgerEntry({
        entryType: 'payout_failed',
        bookingId: bookingId,
        payoutId: payout.id,
        vendorId: payout.vendorId,
        amountCents: payout.vendorNetAmount,
        direction: 'platform_to_vendor',
        referenceType: 'payout',
        referenceId: payout.id,
        note: 'Stripe transfer creation failed',
      });
    }
  }
}

async function retryPayoutTransfersForBooking(bookingId) {
  if (!stripe) throw httpError(400, 'Stripe is not configured');
  const booking = await prisma.booking.findUnique({
    where: { id: String(bookingId) },
    include: { invoice: true },
  });
  if (!booking) throw httpError(404, 'Booking not found');
  if (!booking.invoice?.stripeSessionId) {
    throw httpError(400, 'No checkout session linked to booking invoice');
  }

  const session = await stripe.checkout.sessions.retrieve(String(booking.invoice.stripeSessionId), {
    expand: ['payment_intent'],
  });
  const paymentIntentId = typeof session.payment_intent === 'string'
    ? session.payment_intent
    : session.payment_intent?.id;
  if (!paymentIntentId) throw httpError(400, 'No payment intent linked to checkout session');

  await createOrUpdatePayoutRecordsForBooking(booking.id, { status: 'pending' });
  await createStripeTransfersForBookingPayouts(booking.id, paymentIntentId);
}

function canActorCounter(lastEventType, actorRole) {
  if (!lastEventType) return actorRole === 'customer' || actorRole === 'vendor';
  if (lastEventType === 'request_created') return actorRole === 'vendor' || actorRole === 'customer';
  if (lastEventType === 'vendor_countered') return actorRole === 'customer';
  if (lastEventType === 'customer_countered') return actorRole === 'vendor';
  return false;
}

async function recomputeBookingNegotiationStatus(tx, bookingId) {
  // State machine reducer for structured negotiation:
  // item AGREED locks price; booking ACCEPTED only when required constraints are satisfied.
  const booking = await tx.booking.findUnique({
    where: { id: bookingId },
    include: { items: true, invoice: true },
  });
  if (!booking) throw httpError(404, 'Booking not found');
  const items = booking.items;
  if (items.length === 0) {
    return tx.booking.update({
      where: { id: bookingId },
      data: { status: 'pending', totalPrice: 0, finalPrice: null },
      include: { items: true, invoice: true },
    });
  }

  if (items.some((i) => i.status === 'declined')) {
    const updated = await tx.booking.update({
      where: { id: bookingId },
      data: { status: 'declined' },
      include: { items: true, invoice: true },
    });
    await releaseBookingAvailability(tx, updated);
    return updated;
  }

  const requiredItems = items.filter((i) => i.isRequired);
  const allRequiredAgreed = requiredItems.length > 0
    ? requiredItems.every((i) => i.status === 'agreed')
    : items.every((i) => i.status === 'agreed');
  const allItemsAgreed = items.every((i) => i.status === 'agreed');
  const anyAgreed = items.some((i) => i.status === 'agreed');
  const finalTotalCents = items.reduce((sum, i) => sum + Number(i.finalPriceCents || i.latestPriceCents || 0), 0);

  let nextStatus = booking.status;
  if (allRequiredAgreed && allItemsAgreed) nextStatus = 'accepted';
  else if (anyAgreed) nextStatus = 'partially_accepted';
  else nextStatus = 'pending';

  const updated = await tx.booking.update({
    where: { id: bookingId },
    data: {
      status: nextStatus,
      totalPrice: centsToLegacyPrice(finalTotalCents),
      finalPrice: nextStatus === 'accepted' ? centsToLegacyPrice(finalTotalCents) : null,
    },
    include: { items: true, invoice: true },
  });

  if (nextStatus === 'accepted') {
    await bookBookingAvailability(tx, updated);
    await tx.invoice.upsert({
      where: { bookingId },
      update: {
        amount: finalTotalCents,
        status: 'issued',
        issuedAt: new Date(),
      },
      create: {
        bookingId,
        amount: finalTotalCents,
        status: 'issued',
        issuedAt: new Date(),
      },
    });
  }

  return tx.booking.findUnique({
    where: { id: bookingId },
    include: { items: true, invoice: true },
  });
}

async function expireNegotiationsIfInactive(tx, bookingId) {
  const booking = await tx.booking.findUnique({
    where: { id: bookingId },
    include: { items: true },
  });
  if (!booking) return null;
  if (!['pending', 'partially_accepted'].includes(booking.status)) return booking;

  const now = Date.now();
  const expiredItems = booking.items.filter((item) => {
    // 48h inactivity timeout on requested/countered negotiation states.
    const base = item.lastNegotiationAt || item.updatedAt || item.createdAt;
    return ['requested', 'countered', 'pending', 'counter_offered'].includes(item.status)
      && now - new Date(base).getTime() > 48 * 60 * 60 * 1000;
  });

  if (expiredItems.length === 0) return booking;

  for (const item of expiredItems) {
    await tx.bookingItem.update({
      where: { id: item.id },
      data: { status: 'expired' },
    });
    await tx.offerEvent.create({
      data: {
        bookingId: booking.id,
        bookingItemId: item.id,
        vendorId: item.vendorId,
        actorRole: 'system',
        type: 'expired',
        offerVersion: item.currentOfferVersion || 1,
        reason: 'Negotiation expired due to inactivity.',
      },
    });
    await appendNegotiationMessage(tx, {
      bookingId: booking.id,
      senderRole: 'SYSTEM',
      proposedCents: item.latestPriceCents || null,
      reason: 'Negotiation expired due to inactivity.',
    });
  }

  const updated = await tx.booking.update({
    where: { id: booking.id },
    data: { status: 'expired' },
    include: { items: true, invoice: true },
  });
  await releaseBookingAvailability(tx, updated);
  return updated;
}

function httpError(status, message) {
  const err = new Error(message);
  err.status = status;
  return err;
}

function normalizeDateOnly(input) {
  const d = new Date(input);
  if (Number.isNaN(d.getTime())) return null;
  d.setHours(0, 0, 0, 0);
  return d;
}

function pickPrimaryCategory(categories) {
  if (Array.isArray(categories) && categories.length > 0) return String(categories[0]);
  return 'General';
}

function mapVendorApplicationStatusToProfileStatus(status) {
  if (status === 'approved') return 'approved';
  if (status === 'rejected') return 'declined';
  return 'pending';
}

async function ensureVendorIdentityFromApplication(tx, application) {
  let user = await tx.user.findFirst({
    where: { email: { equals: application.email, mode: 'insensitive' }, role: 'vendor' },
  });

  if (!user) {
    const existingUser = await tx.user.findFirst({
      where: { email: { equals: application.email, mode: 'insensitive' } },
      select: { id: true, role: true },
    });
    if (existingUser && existingUser.role !== 'vendor') {
      throw httpError(
        409,
        `This email is already registered as ${existingUser.role}. Vendor account requires a dedicated email.`,
      );
    }
    const generatedPassword = application.password || `vendor_${randomUUID()}`;
    try {
      user = await tx.user.create({
        data: {
          name: application.businessName,
          fullName: application.businessName,
          email: application.email,
          password: generatedPassword,
          passwordHash: generatedPassword,
          googleSub: application.googleSub || null,
          role: 'vendor',
        },
      });
    } catch (error) {
      if (String(error?.code || '') === 'P2002') {
        throw httpError(409, 'Email already exists and cannot be used for vendor identity creation.');
      }
      throw error;
    }
  } else if (!user.googleSub && application.googleSub) {
    user = await tx.user.update({
      where: { id: user.id },
      data: {
        googleSub: application.googleSub,
        fullName: user.fullName || user.name,
        passwordHash: user.passwordHash || user.password,
      },
    });
  } else if (!user.fullName || !user.passwordHash) {
    user = await tx.user.update({
      where: { id: user.id },
      data: {
        fullName: user.fullName || user.name,
        passwordHash: user.passwordHash || user.password,
      },
    });
  }

  const vendorProfile = await tx.vendorProfile.upsert({
    where: { vendorApplicationId: application.id },
    update: {
      userId: user.id,
      status: mapVendorApplicationStatusToProfileStatus(application.status),
      vendorStatus: mapVendorApplicationStatusToProfileStatus(application.status),
      businessName: application.businessName || undefined,
      category: pickPrimaryCategory(application.categories),
      description: application.businessIntro || undefined,
      stripeAccountId: application.stripeAccountId || undefined,
    },
    create: {
      userId: user.id,
      vendorApplicationId: application.id,
      status: mapVendorApplicationStatusToProfileStatus(application.status),
      vendorStatus: mapVendorApplicationStatusToProfileStatus(application.status),
      businessName: application.businessName || undefined,
      category: pickPrimaryCategory(application.categories),
      description: application.businessIntro || undefined,
      stripeAccountId: application.stripeAccountId || undefined,
    },
  });

  return { user, vendorProfile };
}

async function releaseBookingAvailability(tx, booking) {
  const eventDate = normalizeDateOnly(booking.eventDate);
  if (!eventDate) return;
  const items = await tx.bookingItem.findMany({
    where: { bookingId: booking.id },
  });
  for (const item of items) {
    await tx.availability.updateMany({
      where: {
        serviceId: item.serviceId,
        date: eventDate,
        status: 'reserved',
      },
      data: { status: 'available', reservationExpiresAt: null },
    });
  }
}

async function bookBookingAvailability(tx, booking) {
  const eventDate = normalizeDateOnly(booking.eventDate);
  if (!eventDate) return;
  const items = await tx.bookingItem.findMany({
    where: { bookingId: booking.id },
  });
  for (const item of items) {
    await tx.availability.upsert({
      where: { serviceId_date: { serviceId: item.serviceId, date: eventDate } },
      update: { status: 'booked', reservationExpiresAt: null },
      create: {
        serviceId: item.serviceId,
        date: eventDate,
        status: 'booked',
      },
    });
  }
}

const DEFAULT_SERVICE_SEED = [
  { name: 'DJ Premium', category: 'DJ', description: 'DJ fuer Hochzeiten und Events', basePrice: 800 },
  { name: 'Catering Basic', category: 'Catering', description: 'Buffet fuer kleine Events', basePrice: 1200 },
  { name: 'Make-up Artist Pro', category: 'Make-up', description: 'Professionelles Event-Make-up', basePrice: 300 },
  { name: 'Dekoration Deluxe', category: 'Dekoration', description: 'Dekorationspaket inkl. Setup', basePrice: 700 },
  { name: 'Event Fotografie', category: 'Fotografie', description: 'Eventbegleitung inkl. Bearbeitung', basePrice: 900 },
];

const DEFAULT_VENDOR_SEED = [
  {
    businessName: 'DJ Nova Events',
    contactName: 'Alex Nova',
    email: 'vendor.approved1@example.com',
    city: 'Wuerzburg',
    categories: ['DJ'],
    status: 'approved',
  },
  {
    businessName: 'Catering Palace',
    contactName: 'Mina Cook',
    email: 'vendor.approved2@example.com',
    city: 'Nuernberg',
    categories: ['Catering'],
    status: 'approved',
  },
  {
    businessName: 'Decor Vision',
    contactName: 'Sara Bloom',
    email: 'vendor.pending@example.com',
    city: 'Stuttgart',
    categories: ['Dekoration'],
    status: 'pending_review',
  },
];

function sanitizeFilename(filename) {
  return String(filename || 'document')
    .replace(/[^a-zA-Z0-9._-]/g, '_')
    .slice(0, 120);
}

async function verifyGoogleIdToken(idToken) {
  const response = await fetch(
    `https://oauth2.googleapis.com/tokeninfo?id_token=${encodeURIComponent(idToken)}`,
  );
  if (!response.ok) return null;
  const data = await response.json();
  if (AUTH_GOOGLE_ID && data.aud !== AUTH_GOOGLE_ID) return null;
  if (!data.sub || !data.email) return null;
  return data;
}

const ADMIN_REPLY_MARKER = '\n\n---ADMIN_REPLY---\n';

function splitInquiryMessage(rawMessage) {
  const message = String(rawMessage || '');
  const markerIndex = message.indexOf(ADMIN_REPLY_MARKER);
  if (markerIndex < 0) {
    return {
      vendorMessage: message,
      adminReply: null,
    };
  }
  const vendorMessage = message.slice(0, markerIndex).trim();
  const adminReply = message.slice(markerIndex + ADMIN_REPLY_MARKER.length).trim() || null;
  return { vendorMessage, adminReply };
}

function serializeVendorInquiryForApi(row) {
  const parts = splitInquiryMessage(row.message);
  return {
    id: row.id,
    vendorEmail: row.vendorEmail,
    subject: row.subject,
    message: parts.vendorMessage,
    adminReply: parts.adminReply,
    status: row.status,
    createdAt: row.createdAt,
  };
}

async function sendMailSafe({ to, subject, text, html }) {
  if (!mailTransporter || !SMTP_FROM || !to) {
    return { sent: false, error: 'SMTP is not configured' };
  }
  try {
    await mailTransporter.sendMail({
      from: SMTP_FROM,
      to,
      subject,
      text,
      html,
    });
    return { sent: true };
  } catch {
    return { sent: false, error: 'Email provider rejected delivery' };
  }
}

createServer(async (req, res) => {
  if (withCors(req, res)) return;

  const url = new URL(req.url || '/', `http://${req.headers.host}`);
  const path = url.pathname;

  try {
    if (req.method === 'GET' && path === '/health') {
      await prisma.$queryRaw`SELECT 1`;
      return sendJson(res, 200, { ok: true, service: 'eventvenue-api' });
    }

    if (req.method === 'GET' && path === '/') {
      return sendJson(res, 200, { ok: true, service: 'eventvenue-api', status: 'running' });
    }

    if (req.method === 'POST' && (path === '/api/payments/webhook' || path === '/api/stripe/webhook')) {
      if (enforceRateLimit(req, res, 'webhook')) return;
      if (!stripe || !STRIPE_WEBHOOK_SECRET) {
        return sendJson(res, 400, { error: 'Stripe webhook is not configured' });
      }
      const signature = req.headers['stripe-signature'];
      if (!signature || Array.isArray(signature)) {
        return sendJson(res, 400, { error: 'Missing stripe signature' });
      }

      const rawBody = await readRawBody(req);
      let event;
      try {
        event = stripe.webhooks.constructEvent(rawBody, signature, STRIPE_WEBHOOK_SECRET);
      } catch (err) {
        return sendJson(res, 400, { error: `Webhook signature verification failed: ${err.message}` });
      }

      const reservation = await reserveWebhookEvent(event);
      if (reservation.duplicate) {
        return sendJson(res, 200, { received: true, event: event.type, duplicate: true });
      }

      try {
        if (event.type === 'checkout.session.completed') {
          const session = event.data.object;
          const requestId = session.metadata?.requestId;
          const offerId = session.metadata?.offerId;
          const bookingId = session.metadata?.bookingId;
          const invoiceId = session.metadata?.invoiceId;
          const paymentIntentId = typeof session.payment_intent === 'string' ? session.payment_intent : null;
          if (requestId && offerId) {
            await prisma.vendorOffer.updateMany({
              where: { id: offerId, requestId },
              data: {
                paymentStatus: 'paid',
                stripeSessionId: session.id || null,
                stripePaymentIntent: typeof session.payment_intent === 'string' ? session.payment_intent : null,
                paidAt: new Date(),
              },
            });
            await appendLedgerEntry({
              entryType: 'offer_payment_paid',
              requestId,
              offerId,
              amountCents: Number(session.amount_total || 0),
              direction: 'customer_to_platform',
              referenceType: 'stripe_checkout_session',
              referenceId: String(session.id || ''),
              note: 'Legacy offer checkout completed',
              payload: {
                paymentIntentId,
                customerEmail: session.customer_details?.email || null,
              },
            });
          }
          if (bookingId) {
            let paidInvoice = null;
            let paidBooking = null;
            await prisma.$transaction(async (tx) => {
              if (invoiceId) {
                await tx.invoice.updateMany({
                  where: { id: invoiceId, bookingId },
                  data: {
                    status: 'paid',
                    paidAt: new Date(),
                    stripeSessionId: session.id || null,
                  },
                });
                paidInvoice = await tx.invoice.findFirst({ where: { id: invoiceId, bookingId } });
              } else {
                await tx.invoice.updateMany({
                  where: { bookingId },
                  data: {
                    status: 'paid',
                    paidAt: new Date(),
                    stripeSessionId: session.id || null,
                  },
                });
                paidInvoice = await tx.invoice.findFirst({ where: { bookingId } });
              }
              paidBooking = await tx.booking.update({
                where: { id: bookingId },
                data: {
                  status: 'paid',
                  isCompleted: false,
                  stripeSessionId: session.id || null,
                  stripePaymentIntentId: paymentIntentId || null,
                },
              });
              await bookBookingAvailability(tx, paidBooking);
            });
            await appendLedgerEntry({
              entryType: 'invoice_paid',
              bookingId,
              invoiceId: paidInvoice?.id || invoiceId || null,
              customerId: paidBooking?.customerId || null,
              amountCents: Number(session.amount_total || paidInvoice?.amount || 0),
              direction: 'customer_to_platform',
              referenceType: 'stripe_checkout_session',
              referenceId: String(session.id || ''),
              note: 'Booking checkout completed',
              payload: { paymentIntentId },
            });
            await createOrUpdatePayoutRecordsForBooking(bookingId, { status: 'pending' });
            if (paymentIntentId) {
              await createStripeTransfersForBookingPayouts(bookingId, paymentIntentId);
            }
          }
        } else if (event.type === 'payment_intent.succeeded') {
          const paymentIntent = event.data.object;
          const bookingId = paymentIntent.metadata?.bookingId;
          if (bookingId) {
            await createOrUpdatePayoutRecordsForBooking(bookingId, { status: 'pending' });
            await createStripeTransfersForBookingPayouts(bookingId, paymentIntent.id);
          }
        } else if (event.type === 'checkout.session.expired') {
          const session = event.data.object;
          const requestId = session.metadata?.requestId;
          const offerId = session.metadata?.offerId;
          if (requestId && offerId) {
            await prisma.vendorOffer.updateMany({
              where: { id: offerId, requestId, paymentStatus: { not: 'paid' } },
              data: {
                paymentStatus: 'failed',
                stripeSessionId: session.id || null,
              },
            });
          }
        } else if (event.type === 'payment_intent.payment_failed') {
          const paymentIntent = event.data.object;
          const bookingId = paymentIntent.metadata?.bookingId;
          if (bookingId) {
            let failedInvoice = null;
            await prisma.$transaction(async (tx) => {
              await tx.invoice.updateMany({
                where: { bookingId, status: { in: ['draft', 'issued'] } },
                data: { status: 'failed', failedAt: new Date() },
              });
              failedInvoice = await tx.invoice.findFirst({ where: { bookingId } });
              if (supportsPrismaModel('payout')) {
                await tx.payout.updateMany({
                  where: { bookingId, status: 'pending' },
                  data: { status: 'failed' },
                });
              }
            });
            await appendLedgerEntry({
              entryType: 'invoice_payment_failed',
              bookingId,
              invoiceId: failedInvoice?.id || null,
              amountCents: Number(paymentIntent.amount || failedInvoice?.amount || 0),
              direction: 'customer_to_platform',
              referenceType: 'payment_intent',
              referenceId: String(paymentIntent.id || ''),
              note: 'Payment intent failed',
            });
          }
        }
        await markWebhookEventProcessed(event.id);
      } catch (error) {
        await releaseWebhookEventReservation(event.id);
        throw error;
      }
      return sendJson(res, 200, { received: true, event: event.type });
    }

    if (req.method === 'POST' && path === '/api/payments/checkout-session') {
      ensureLegacyFlowEnabled();
      if (enforceRateLimit(req, res, 'payment')) return;
      const auth = requireJwt(req, 'customer');
      if (!stripe) {
        return sendJson(res, 400, { error: 'Stripe is not configured' });
      }
      const body = await readBody(req);
      const { requestId, offerId, customerEmail, successUrl, cancelUrl } = body;
      if (!requestId || !offerId || !customerEmail || !successUrl || !cancelUrl) {
        return sendJson(res, 400, { error: 'Missing required fields' });
      }

      const request = await prisma.serviceRequest.findUnique({
        where: { id: requestId },
        include: { offers: true },
      });
      if (!request) return sendJson(res, 404, { error: 'Request not found' });
      if (request.customerEmail.toLowerCase() !== String(customerEmail).toLowerCase()) {
        return sendJson(res, 403, { error: 'Customer email does not match request' });
      }
      if (request.customerEmail.toLowerCase() !== String(auth.email || '').toLowerCase()) {
        return sendJson(res, 403, { error: 'Token customer does not match request customer' });
      }

      const offer = request.offers.find((o) => o.id === offerId);
      if (!offer) return sendJson(res, 404, { error: 'Offer not found' });
      if (offer.status !== 'accepted') {
        return sendJson(res, 400, { error: 'Only accepted offers can be paid' });
      }
      if (offer.paymentStatus === 'paid') {
        return sendJson(res, 400, { error: 'This offer is already paid' });
      }

      let paymentIntentData = undefined;
      if (offer.vendorEmail) {
        const vendor = await prisma.vendorApplication.findFirst({
          where: { email: { equals: offer.vendorEmail, mode: 'insensitive' } },
        });
        if (!vendor?.stripeAccountId) {
          return sendJson(res, 400, {
            error: 'Vendor payout setup incomplete. Stripe Connect must be completed before customer payment.',
          });
        }
        if (stripe) {
          const account = await stripe.accounts.retrieve(vendor.stripeAccountId);
          if (!account.charges_enabled || !account.payouts_enabled) {
            return sendJson(res, 400, {
              error: 'Vendor Stripe account is not payout-ready yet. Please try again after onboarding is completed.',
            });
          }
        }
        if (vendor?.stripeAccountId) {
          const fee = Math.round(Number(offer.price) * 100 * (STRIPE_PLATFORM_COMMISSION_PERCENT / 100));
          paymentIntentData = {
            application_fee_amount: fee,
            transfer_data: {
              destination: vendor.stripeAccountId,
            },
          };
        }
      }

      const session = await stripe.checkout.sessions.create({
        mode: 'payment',
        customer_email: customerEmail,
        success_url: successUrl,
        cancel_url: cancelUrl,
        payment_intent_data: paymentIntentData,
        line_items: [
          {
            quantity: 1,
            price_data: {
              currency: 'eur',
              unit_amount: Number(offer.price) * 100,
              product_data: {
                name: `Event Offer ${request.id}`,
                description: `${offer.vendorName} | ${request.selectedServices instanceof Array ? request.selectedServices.join(', ') : 'Service'}`,
              },
            },
          },
        ],
        metadata: {
          requestId: request.id,
          offerId: offer.id,
          vendorEmail: offer.vendorEmail || '',
          customerEmail: request.customerEmail,
        },
      });

      await prisma.vendorOffer.update({
        where: { id: offer.id },
        data: {
          paymentStatus: 'pending',
          stripeSessionId: session.id,
        },
      });

      return sendJson(res, 200, {
        sessionId: session.id,
        url: session.url,
      });
    }

    if (
      req.method === 'POST'
      && (path === '/api/stripe/checkout' || path === '/api/cart/checkout-session' || path === '/api/bookings/venue/create')
    ) {
      if (enforceRateLimit(req, res, 'payment')) return;
      if (!stripe) {
        return sendJson(res, 400, { error: 'Stripe is not configured' });
      }

      const body = await readBody(req);
      const cart = body?.cart || {};
      const venue = cart?.venue || null;
      const services = Array.isArray(cart?.services) ? cart.services : [];
      const customer = body?.customer || {};
      const successUrl = normalizeOptionalString(body?.successUrl, 500) || `${FRONTEND_BASE_URL}/checkout/success`;
      const cancelUrl = normalizeOptionalString(body?.cancelUrl, 500) || `${FRONTEND_BASE_URL}/cart`;
      const customerEmail = normalizeOptionalString(customer?.email, 320);
      const customerName = normalizeOptionalString(customer?.name, 120);
      const customerPhone = normalizeOptionalString(customer?.phone, 60);
      const customerAddress = normalizeOptionalString(customer?.address, 300);
      const customerCity = normalizeOptionalString(customer?.city, 120);
      const customerPostalCode = normalizeOptionalString(customer?.postalCode, 32);
      const eventType = normalizeOptionalString(customer?.eventType, 64);
      const guestCount = normalizeOptionalString(customer?.guestCount, 32);
      const preferredContactMethod = normalizeOptionalString(customer?.preferredContactMethod, 32);

      if (!venue || !venue.id || !Number.isFinite(Number(venue.price)) || Number(venue.price) <= 0) {
        return sendJson(res, 400, { error: 'Missing or invalid venue in cart' });
      }

      const lineItems = [
        {
          quantity: 1,
          price_data: {
            currency: 'eur',
            unit_amount: Math.round(Number(venue.price) * 100),
            product_data: {
              name: `Venue: ${String(venue.title || venue.name || venue.id).slice(0, 120)}`,
            },
          },
        },
      ];

      for (const item of services) {
        const price = Number(item?.price);
        if (!item || !item.id || !Number.isFinite(price) || price <= 0) continue;
        lineItems.push({
          quantity: 1,
          price_data: {
            currency: 'eur',
            unit_amount: Math.round(price * 100),
            product_data: {
              name: `Service: ${String(item.title || item.id).slice(0, 120)}`,
            },
          },
        });
      }

      const session = await stripe.checkout.sessions.create({
        mode: 'payment',
        ...(customerEmail ? { customer_email: customerEmail } : {}),
        success_url: successUrl,
        cancel_url: cancelUrl,
        line_items: lineItems,
        metadata: {
          source: 'web_cart',
          venueId: String(venue.id),
          services: JSON.stringify(services.map((s) => s?.id).filter(Boolean)).slice(0, 500),
          customerName: customerName || '',
          customerEmail: customerEmail || '',
          customerPhone: customerPhone || '',
          customerAddress: customerAddress || '',
          customerCity: customerCity || '',
          customerPostalCode: customerPostalCode || '',
          eventType: eventType || '',
          guestCount: guestCount || '',
          preferredContactMethod: preferredContactMethod || '',
        },
      });

      return sendJson(res, 200, {
        sessionId: session.id,
        url: session.url,
      });
    }

    if (req.method === 'POST' && path === '/api/stripe/connect/onboard') {
      if (!stripe) {
        return sendJson(res, 400, { error: 'Stripe is not configured' });
      }
      const body = await readBody(req);
      const vendorEmail = normalizeOptionalString(body.vendorEmail, 320);
      if (!vendorEmail) return sendJson(res, 400, { error: 'vendorEmail is required' });

      const vendor = await getVendorApplicationByEmail(vendorEmail);
      if (!vendor) return sendJson(res, 404, { error: 'Vendor profile not found' });
      if (vendor.status !== 'approved') {
        return sendJson(res, 403, { error: `Vendor account is ${vendor.status}. Admin approval required.` });
      }

      let accountId = vendor.stripeAccountId;
      if (!accountId) {
        const account = await stripe.accounts.create({
          type: 'express',
          country: normalizeOptionalString(body.country, 2)?.toUpperCase() || 'DE',
          email: vendor.email,
          business_type: body.businessType === 'company' ? 'company' : 'individual',
          metadata: {
            vendorApplicationId: vendor.id,
            vendorEmail: vendor.email,
            businessName: vendor.businessName,
          },
        });
        accountId = account.id;
        await prisma.vendorApplication.update({
          where: { id: vendor.id },
          data: { stripeAccountId: accountId },
        });
      }

      const accountLink = await stripe.accountLinks.create({
        account: accountId,
        type: 'account_onboarding',
        refresh_url: STRIPE_CONNECT_REFRESH_URL,
        return_url: STRIPE_CONNECT_RETURN_URL,
      });

      await updateVendorCompliance(vendor.email, (current) => ({
        ...current,
        connectOnboardingStatus: 'IN_PROGRESS',
      }));

      return sendJson(res, 200, {
        accountId,
        onboardingUrl: accountLink.url,
        expiresAt: accountLink.expires_at,
      });
    }

    if (req.method === 'GET' && path === '/api/stripe/connect/status') {
      if (!stripe) {
        return sendJson(res, 400, { error: 'Stripe is not configured' });
      }
      const vendorEmail = normalizeOptionalString(url.searchParams.get('vendorEmail'), 320);
      if (!vendorEmail) return sendJson(res, 400, { error: 'vendorEmail is required' });

      const vendor = await getVendorApplicationByEmail(vendorEmail);
      if (!vendor) return sendJson(res, 404, { error: 'Vendor profile not found' });
      if (!vendor.stripeAccountId) {
        await updateVendorCompliance(vendor.email, (current) => ({
          ...current,
          connectOnboardingStatus: 'NOT_STARTED',
          payoutsEnabled: false,
          chargesEnabled: false,
        }));
        return sendJson(res, 200, {
          connected: false,
          stripeAccountId: null,
          chargesEnabled: false,
          payoutsEnabled: false,
          detailsSubmitted: false,
          pendingRequirements: [],
        });
      }

      const account = await stripe.accounts.retrieve(vendor.stripeAccountId);
      const payoutsEnabled = Boolean(account.payouts_enabled);
      const chargesEnabled = Boolean(account.charges_enabled);
      await updateVendorCompliance(vendor.email, (current) => ({
        ...current,
        connectOnboardingStatus: payoutsEnabled && chargesEnabled ? 'COMPLETED' : 'IN_PROGRESS',
        payoutsEnabled,
        chargesEnabled,
      }));
      return sendJson(res, 200, {
        connected: Boolean(vendor.stripeAccountId),
        stripeAccountId: vendor.stripeAccountId,
        chargesEnabled,
        payoutsEnabled,
        detailsSubmitted: Boolean(account.details_submitted),
        pendingRequirements: account.requirements?.currently_due || [],
      });
    }

    if (req.method === 'POST' && path === '/api/auth/google/vendor/verify') {
      if (enforceRateLimit(req, res, 'auth')) return;
      const body = await readBody(req);
      const { idToken } = body;
      if (!idToken) return sendJson(res, 400, { error: 'Missing idToken' });
      const profile = await verifyGoogleIdToken(idToken);
      if (!profile) return sendJson(res, 401, { error: 'Invalid Google token' });
      return sendJson(res, 200, {
        profile: {
          sub: profile.sub,
          email: profile.email,
          name: profile.name || '',
          picture: profile.picture || '',
          emailVerified: profile.email_verified === 'true' || profile.email_verified === true,
        },
      });
    }

    if (req.method === 'POST' && path === '/api/auth/google/customer/login') {
      if (enforceRateLimit(req, res, 'auth')) return;
      const body = await readBody(req);
      const { idToken } = body;
      if (!idToken) return sendJson(res, 400, { error: 'Missing idToken' });
      const profile = await verifyGoogleIdToken(idToken);
      if (!profile) return sendJson(res, 401, { error: 'Invalid Google token' });

      let customer = await prisma.user.findFirst({
        where: {
          OR: [
            { googleSub: profile.sub },
            { email: { equals: profile.email, mode: 'insensitive' } },
          ],
          role: 'customer',
        },
      });

      if (!customer) {
        const existingUser = await prisma.user.findFirst({
          where: { email: { equals: profile.email, mode: 'insensitive' } },
          select: { role: true },
        });
        if (existingUser && existingUser.role !== 'customer') {
          return sendJson(res, 409, {
            error: `This email is already registered as ${existingUser.role}. Please use the correct login flow for that account.`,
          });
        }
        const generatedPassword = `google_${randomUUID()}`;
        try {
          customer = await prisma.user.create({
            data: {
              name: profile.name || profile.email.split('@')[0],
              fullName: profile.name || profile.email.split('@')[0],
              email: profile.email,
              password: generatedPassword,
              passwordHash: generatedPassword,
              googleSub: profile.sub,
              role: 'customer',
            },
          });
        } catch (error) {
          if (String(error?.code || '') === 'P2002') {
            return sendJson(res, 409, {
              error: 'Email is already in use. Please login with the account type previously registered for this email.',
            });
          }
          throw error;
        }
      } else if (!customer.googleSub) {
        customer = await prisma.user.update({
          where: { id: customer.id },
          data: { googleSub: profile.sub },
        });
      }

      return sendJson(res, 200, {
        token: signUserToken(customer),
        role: 'customer',
        user: { id: customer.id, name: customer.name, email: customer.email },
      });
    }

    if (req.method === 'POST' && path === '/api/auth/google/vendor/login') {
      if (enforceRateLimit(req, res, 'auth')) return;
      const body = await readBody(req);
      const { idToken } = body;
      if (!idToken) return sendJson(res, 400, { error: 'Missing idToken' });
      const profile = await verifyGoogleIdToken(idToken);
      if (!profile) return sendJson(res, 401, { error: 'Invalid Google token' });

      const vendor = await prisma.vendorApplication.findFirst({
        where: {
          OR: [
            { googleSub: profile.sub },
            { email: { equals: profile.email, mode: 'insensitive' } },
          ],
        },
      });
      if (!vendor) {
        return sendJson(res, 404, { error: 'No vendor application found for this Google account' });
      }

      const { user } = await prisma.$transaction(async (tx) => syncVendorProfileActivationStatus(tx, vendor));
      return sendJson(res, 200, {
        token: signUserToken(user),
        role: 'vendor',
        user: { id: vendor.id, name: vendor.businessName, email: vendor.email, status: vendor.status },
      });
    }

    if (req.method === 'POST' && path === '/api/auth/vendor/login') {
      if (enforceRateLimit(req, res, 'auth')) return;
      const body = await readBody(req);
      const email = String(body?.email || '').trim();
      const password = String(body?.password || '');
      if (!email || !password) return sendJson(res, 400, { error: 'Missing credentials' });

      const vendor = await prisma.vendorApplication.findFirst({
        where: { email: { equals: email, mode: 'insensitive' } },
      });
      if (!vendor) return sendJson(res, 404, { error: 'No vendor account found for this email' });

      const { user } = await prisma.$transaction(async (tx) => syncVendorProfileActivationStatus(tx, vendor));
      const validPassword =
        String(user.password || '') === password
        || String(user.passwordHash || '') === password
        || String(vendor.password || '') === password;
      if (!validPassword) return sendJson(res, 401, { error: 'Invalid vendor credentials' });

      return sendJson(res, 200, {
        token: signUserToken(user),
        role: 'vendor',
        user: { id: vendor.id, name: vendor.businessName, email: vendor.email, status: vendor.status },
      });
    }

    if (req.method === 'POST' && path === '/api/uploads/vendor-document-url') {
      if (!r2Client || !R2_BUCKET_NAME) {
        return sendJson(res, 400, { error: 'R2 is not configured' });
      }
      const body = await readBody(req);
      const filename = sanitizeFilename(body.filename || 'document');
      const contentType = body.contentType || 'application/octet-stream';
      const fileKey = `vendor-documents/${Date.now()}-${randomUUID()}-${filename}`;
      const command = new PutObjectCommand({
        Bucket: R2_BUCKET_NAME,
        Key: fileKey,
        ContentType: contentType,
      });
      const uploadUrl = await getSignedUrl(r2Client, command, { expiresIn: 600 });
      const publicUrl = R2_PUBLIC_BASE_URL
        ? `${R2_PUBLIC_BASE_URL.replace(/\/$/, '')}/${fileKey}`
        : '';
      return sendJson(res, 200, { uploadUrl, fileKey, publicUrl });
    }

    if (req.method === 'POST' && path === '/api/admin/bootstrap') {
      if (enforceRateLimit(req, res, 'admin')) return;
      const setupHeader = req.headers['x-admin-setup-key'];
      const setupKey = Array.isArray(setupHeader) ? setupHeader[0] : setupHeader;
      if (setupKey !== ADMIN_SETUP_KEY) {
        return sendJson(res, 401, { error: 'Unauthorized setup access' });
      }

      const body = await readBody(req);
      const { name, email, password } = body;
      if (!name || !email || !password) {
        return sendJson(res, 400, { error: 'Missing required fields' });
      }

      const existing = await prisma.user.findFirst({
        where: { email: { equals: email, mode: 'insensitive' } },
      });
      if (existing && existing.role === 'admin') {
        return sendJson(res, 409, { error: 'Admin user already exists for this email' });
      }
      if (existing && existing.role !== 'admin') {
        return sendJson(res, 409, { error: 'Email already used by non-admin user' });
      }

      let adminUser;
      try {
        adminUser = await prisma.user.create({
          data: {
            name,
            fullName: name,
            email,
            password,
            passwordHash: password,
            role: 'admin',
          },
        });
      } catch (error) {
        if (String(error?.code || '') === 'P2002') {
          return sendJson(res, 409, { error: 'Email already exists. Use a different admin email or login with existing account.' });
        }
        throw error;
      }
      return sendJson(res, 201, {
        admin: {
          id: adminUser.id,
          name: adminUser.name,
          email: adminUser.email,
          role: adminUser.role,
          createdAt: adminUser.createdAt,
        },
      });
    }

    if (req.method === 'POST' && path === '/api/admin/login') {
      if (enforceRateLimit(req, res, 'admin')) return;
      const body = await readBody(req);
      const { email, password } = body;
      if (!email || !password) return sendJson(res, 400, { error: 'Missing credentials' });

      const admin = await prisma.user.findFirst({
        where: { email: { equals: email, mode: 'insensitive' }, password, role: 'admin' },
      });
      if (!admin) return sendJson(res, 401, { error: 'Invalid admin credentials' });

      const token = signAdminToken(admin);
      return sendJson(res, 200, {
        token,
        admin: { id: admin.id, name: admin.name, email: admin.email, role: admin.role },
      });
    }

    if (path.startsWith('/api/admin') && !['/api/admin/login', '/api/admin/bootstrap'].includes(path) && !isAdminAuthorized(req)) {
      return sendJson(res, 401, { error: 'Unauthorized admin access' });
    }

    if (req.method === 'POST' && path === '/api/consent') {
      const body = await readBody(req);
      const {
        v,
        ts,
        preferences,
        analytics,
        marketing,
        sessionId,
        userEmail,
      } = body;

      if (
        typeof preferences !== 'boolean' ||
        typeof analytics !== 'boolean' ||
        typeof marketing !== 'boolean'
      ) {
        return sendJson(res, 400, { error: 'Invalid consent payload' });
      }

      const version = Number(v);
      if (!Number.isInteger(version) || version < 1) {
        return sendJson(res, 400, { error: 'Invalid consent version' });
      }

      let linkedUserId = null;
      const normalizedEmail = normalizeOptionalString(userEmail, 320);
      if (normalizedEmail) {
        const linkedUser = await prisma.user.findFirst({
          where: { email: { equals: normalizedEmail, mode: 'insensitive' } },
          select: { id: true },
        });
        linkedUserId = linkedUser?.id || null;
      }

      let createdAt = new Date();
      if (Number.isFinite(Number(ts))) {
        const fromClient = new Date(Number(ts));
        if (!Number.isNaN(fromClient.getTime())) createdAt = fromClient;
      }

      await prisma.consentLog.create({
        data: {
          userId: linkedUserId,
          sessionId: normalizeOptionalString(sessionId, 120),
          version,
          necessary: true,
          preferences,
          analytics,
          marketing,
          userAgent: normalizeOptionalString(req.headers['user-agent'], 512),
          createdAt,
        },
      });

      return sendJson(res, 200, { ok: true });
    }

    if (req.method === 'POST' && path === '/api/auth/signup/customer') {
      return sendJson(res, 400, { error: 'Customer signup is Google-only. Please use Google sign-in.' });
    }

    if (req.method === 'GET' && path === '/api/me') {
      const auth = requireJwt(req, 'customer', 'vendor', 'admin');
      const base = {
        id: String(auth.sub || ''),
        email: String(auth.email || ''),
        name: String(auth.name || ''),
        role: String(auth.role || ''),
      };

      if (auth.role === 'vendor') {
        const app = await prisma.vendorApplication.findFirst({
          where: { email: { equals: base.email, mode: 'insensitive' } },
          orderBy: { createdAt: 'desc' },
        });
        return sendJson(res, 200, {
          user: base,
          vendorStatus: app?.status || 'pending_review',
          vendorApplicationId: app?.id || null,
        });
      }

      return sendJson(res, 200, { user: base });
    }

    if (req.method === 'GET' && path === '/api/customer/profile') {
      const auth = requireJwt(req, 'customer');
      const email = String(auth.email || '').trim();
      if (!email) return sendJson(res, 401, { error: 'Unauthorized' });

      const user = await prisma.user.findFirst({
        where: { email: { equals: email, mode: 'insensitive' }, role: 'customer' },
        include: { customerProfile: true },
      });
      if (!user) return sendJson(res, 404, { error: 'Customer not found' });

      return sendJson(res, 200, {
        profile: {
          name: user.name || user.fullName || '',
          email: user.email,
          phone: user.customerProfile?.phone || '',
          address: user.customerProfile?.address || '',
        },
      });
    }

    if (req.method === 'PATCH' && path === '/api/customer/profile') {
      const auth = requireJwt(req, 'customer');
      const email = String(auth.email || '').trim();
      if (!email) return sendJson(res, 401, { error: 'Unauthorized' });

      const body = await readBody(req);
      const nextName = normalizeOptionalString(body?.name, 120);
      const nextPhone = normalizeOptionalString(body?.phone, 60);
      const nextAddress = normalizeOptionalString(body?.address, 300);
      if (!nextName) return sendJson(res, 400, { error: 'Name is required' });

      const updated = await prisma.$transaction(async (tx) => {
        const user = await tx.user.findFirst({
          where: { email: { equals: email, mode: 'insensitive' }, role: 'customer' },
        });
        if (!user) throw httpError(404, 'Customer not found');

        const updatedUser = await tx.user.update({
          where: { id: user.id },
          data: {
            name: nextName,
            fullName: nextName,
          },
        });

        const profile = await tx.customerProfile.upsert({
          where: { userId: updatedUser.id },
          update: {
            phone: nextPhone || null,
            address: nextAddress || null,
          },
          create: {
            userId: updatedUser.id,
            phone: nextPhone || null,
            address: nextAddress || null,
          },
        });

        return {
          name: updatedUser.name || updatedUser.fullName || '',
          email: updatedUser.email,
          phone: profile.phone || '',
          address: profile.address || '',
        };
      });

      return sendJson(res, 200, { profile: updated });
    }

    if (req.method === 'POST' && (path === '/api/auth/signup/vendor' || path === '/api/vendor/apply')) {
      if (enforceRateLimit(req, res, 'auth')) return;
      const body = await readBody(req);
      const required = ['businessName', 'contactName', 'email'];
      if (required.some((field) => !body[field])) {
        return sendJson(res, 400, { error: 'Missing required fields' });
      }
      if (!body.googleSub) {
        return sendJson(res, 400, { error: 'Vendor signup requires Google account verification.' });
      }

      const existing = await prisma.vendorApplication.findUnique({ where: { email: body.email } });
      if (existing) {
        return sendJson(res, 200, {
          vendorApplication: existing,
          alreadyExists: true,
          note: 'Vendor application already exists for this email.',
        });
      }

      if (body.googleSub) {
        const existingGoogle = await prisma.vendorApplication.findFirst({
          where: { googleSub: body.googleSub },
        });
        if (existingGoogle) {
          return sendJson(res, 200, {
            vendorApplication: existingGoogle,
            alreadyExists: true,
            note: 'Vendor application already exists for this Google account.',
          });
        }
      }

      const application = await prisma.vendorApplication.create({
        data: {
          businessName: body.businessName,
          contactName: body.contactName,
          email: body.email,
          password: body.password || `google_${randomUUID()}`,
          googleSub: body.googleSub || null,
          city: body.city || null,
          websiteUrl: body.websiteUrl || null,
          portfolioUrl: body.portfolioUrl || null,
          businessIntro: body.businessIntro || null,
          categories: body.categories || [],
          documentName: body.documentName || null,
          documentKey: body.documentKey || null,
          documentUrl: body.documentUrl || null,
          stripeAccountId: body.stripeAccountId || null,
          status: 'pending_review',
        },
      });

      await sendMailSafe({
        to: application.email,
        subject: 'Vendor-Anfrage eingegangen',
        text: 'Danke. Deine Vendor-Anfrage wurde empfangen und wird durch das Admin-Team geprueft.',
      });
      await sendMailSafe({
        to: ADMIN_NOTIFY_EMAIL,
        subject: `Neue Vendor-Anfrage: ${application.businessName}`,
        text: `Neue Vendor-Anfrage von ${application.contactName} (${application.email}).`,
      });

      return sendJson(res, 201, { vendorApplication: application });
    }

    if (req.method === 'POST' && path === '/api/auth/login') {
      return sendJson(res, 400, {
        error: 'Email/password login is disabled. Please use Google login for customers and vendors.',
      });
    }

    if (req.method === 'POST' && (path === '/api/marketplace/bookings/request' || path === '/api/bookings/service/request')) {
      ensureStructuredFlowEnabled();
      const auth = requireJwt(req, 'customer');
      const body = await readBody(req);
      const customerEmail = String(body.customerEmail || '').trim();
      const customerName = String(body.customerName || '').trim();
      const eventDate = normalizeDateOnly(body.eventDate);
      const expiresHours = normalizeResponseHours(body.expiresHours || body.offerResponseHours || 48);
      const expiresAt = new Date(Date.now() + expiresHours * 60 * 60 * 1000);
      const itemsInput = Array.isArray(body.items) ? body.items : [];

      if (!customerEmail || !customerName || !eventDate || itemsInput.length === 0) {
        return sendJson(res, 400, { error: 'Missing required fields (customerEmail, customerName, eventDate, items)' });
      }
      if (String(auth.email || '').toLowerCase() !== customerEmail.toLowerCase()) {
        return sendJson(res, 403, { error: 'Customer email must match authenticated user' });
      }

      const result = await prisma.$transaction(async (tx) => {
        const customer = await tx.user.findFirst({
          where: { email: { equals: customerEmail, mode: 'insensitive' }, role: 'customer' },
        });
        if (!customer) throw httpError(403, 'Customer must be logged in before creating a booking request');

        await tx.customerProfile.upsert({
          where: { userId: customer.id },
          update: {
            address: body.address || undefined,
            phone: body.customerPhone || undefined,
          },
          create: {
            userId: customer.id,
            address: body.address || undefined,
            phone: body.customerPhone || undefined,
          },
        });

        const booking = await tx.booking.create({
          data: {
            customerId: customer.id,
            status: 'pending',
            eventDate,
            expiresAt,
            totalPrice: 0,
          },
        });

        let runningTotal = 0;
        let runningTotalCents = 0;
        const vendorIds = new Set();
        for (const item of itemsInput) {
          const serviceId = String(item.serviceId || '').trim();
          if (!serviceId) throw httpError(400, 'Each booking item needs serviceId');

          const service = await tx.marketplaceService.findUnique({
            where: { id: serviceId },
          });
          if (!service || !service.isActive) throw httpError(404, `Service ${serviceId} not found or inactive`);

          const availability = await tx.availability.upsert({
            where: { serviceId_date: { serviceId, date: eventDate } },
            update: {},
            create: { serviceId, date: eventDate, status: 'available' },
          });

          if (availability.status !== 'available') {
            throw httpError(409, `Service ${service.title} is not available on selected date`);
          }

          await tx.availability.update({
            where: { id: availability.id },
            data: {
              status: 'reserved',
              reservationExpiresAt: new Date(Date.now() + 15 * 60 * 1000),
            },
          });

          const initialCents = Number(item.priceCents || 0) > 0
            ? toPositiveInt(item.priceCents, 'priceCents')
            : toPositiveInt(Number(item.priceOffered || service.basePrice || 0) * 100, 'priceCents');
          const priceOffered = centsToLegacyPrice(initialCents);

          runningTotal += priceOffered;
          runningTotalCents += initialCents;
          vendorIds.add(service.vendorId);
          const bookingItem = await tx.bookingItem.create({
            data: {
              bookingId: booking.id,
              vendorId: service.vendorId,
              serviceId: service.id,
              priceOffered,
              latestPriceCents: initialCents,
              finalPriceCents: null,
              isRequired: Boolean(item.isRequired) || String(service.category || '').toLowerCase() === 'venue',
              currentOfferVersion: 1,
              customerAcceptedVersion: null,
              vendorAcceptedVersion: null,
              lastNegotiationAt: new Date(),
              status: 'requested',
              vendorMessage: item.vendorMessage || null,
            },
          });

          await tx.offerEvent.create({
            data: {
              bookingId: booking.id,
              bookingItemId: bookingItem.id,
              vendorId: service.vendorId,
              actorRole: 'customer',
              type: 'request_created',
              offerVersion: 1,
              priceCents: initialCents,
              reason: normalizeOptionalString(item.reason || item.vendorMessage, 400),
              breakdownJson: item.breakdown || null,
            },
          });
          await appendNegotiationMessage(tx, {
            bookingId: booking.id,
            senderRole: 'CUSTOMER',
            proposedCents: initialCents,
            reason: normalizeOptionalString(item.reason || item.vendorMessage, 400),
          });

          await tx.analyticsEvent.create({
            data: {
              type: 'booking_request',
              userId: customer.id,
              vendorId: service.vendorId,
              serviceId: service.id,
              bookingId: booking.id,
            },
          });
        }

        const updated = await tx.booking.update({
          where: { id: booking.id },
          data: {
            totalPrice: runningTotal,
            vendorId: vendorIds.size === 1 ? Array.from(vendorIds)[0] : null,
            grossAmount: Number((runningTotalCents / 100).toFixed(2)),
          },
          include: {
            items: true,
          },
        });

        return updated;
      });

      return sendJson(res, 201, { booking: result });
    }

    if (req.method === 'POST' && path.match(/^\/api\/bookings\/[^/]+\/items\/[^/]+\/offer$/)) {
      ensureStructuredFlowEnabled();
      const auth = requireJwt(req, 'customer', 'vendor');
      const [, , , bookingId, , itemId] = path.split('/');
      const body = await readBody(req);
      const priceCents = toPositiveInt(body.priceCents, 'priceCents');
      const reason = normalizeOptionalString(body.reason, 400);
      if (!reason) return sendJson(res, 400, { error: 'reason is required' });
      assertNoContactInfo(reason);

      const updated = await prisma.$transaction(async (tx) => {
        await expireNegotiationsIfInactive(tx, bookingId);

        const booking = await tx.booking.findUnique({
          where: { id: bookingId },
          include: { invoice: true },
        });
        if (!booking) throw httpError(404, 'Booking not found');
        if (!['pending', 'partially_accepted'].includes(booking.status)) {
          throw httpError(400, `Booking is ${booking.status} and cannot be negotiated`);
        }
        if (booking.invoice && ['issued', 'paid'].includes(booking.invoice.status)) {
          throw httpError(409, 'Invoice already issued. Price cannot be changed.');
        }

        const item = await tx.bookingItem.findFirst({
          where: { id: itemId, bookingId },
        });
        if (!item) throw httpError(404, 'Booking item not found');
        if (['agreed', 'declined', 'cancelled', 'expired'].includes(item.status)) {
          throw httpError(400, `Item is ${item.status} and cannot be countered`);
        }

        const latestEvent = await tx.offerEvent.findFirst({
          where: { bookingItemId: item.id },
          orderBy: { createdAt: 'desc' },
        });

        let actorRole = 'customer';
        let actorVendorId = null;
        if (auth.role === 'customer') {
          const customer = await tx.user.findFirst({
            where: { id: String(auth.sub), role: 'customer' },
          });
          if (!customer) throw httpError(404, 'Customer not found');
          if (customer.id !== booking.customerId) throw httpError(403, 'Not your booking');
          actorRole = 'customer';
        } else {
          const app = await tx.vendorApplication.findFirst({
            where: { email: { equals: String(auth.email || ''), mode: 'insensitive' } },
          });
          if (!app) throw httpError(404, 'Vendor account not found');
          const { vendorProfile } = await ensureVendorIdentityFromApplication(tx, app);
          if (vendorProfile.id !== item.vendorId) throw httpError(403, 'Cannot counter another vendor item');
          actorRole = 'vendor';
          actorVendorId = vendorProfile.id;
        }

        if (!canActorCounter(latestEvent?.type || null, actorRole)) {
          throw httpError(409, 'Counter-offer turn is not allowed for this actor right now');
        }

        const nextVersion = Number(item.currentOfferVersion || 1) + 1;
        await tx.offerEvent.create({
          data: {
            bookingId,
            bookingItemId: item.id,
            vendorId: actorVendorId || item.vendorId,
            actorRole,
            type: actorRole === 'vendor' ? 'vendor_countered' : 'customer_countered',
            offerVersion: nextVersion,
            priceCents,
            reason,
            breakdownJson: body.breakdown || null,
          },
        });
        await appendNegotiationMessage(tx, {
          bookingId,
          senderRole: actorRole === 'vendor' ? 'VENDOR' : 'CUSTOMER',
          proposedCents: priceCents,
          reason,
        });

        await tx.bookingItem.update({
          where: { id: item.id },
          data: {
            status: 'countered',
            currentOfferVersion: nextVersion,
            latestPriceCents: priceCents,
            customerAcceptedVersion: null,
            vendorAcceptedVersion: null,
            lastNegotiationAt: new Date(),
            priceOffered: centsToLegacyPrice(priceCents),
            finalPrice: null,
            finalPriceCents: null,
          },
        });

        return recomputeBookingNegotiationStatus(tx, bookingId);
      });

      return sendJson(res, 200, { booking: updated });
    }

    if (req.method === 'POST' && path.match(/^\/api\/bookings\/[^/]+\/items\/[^/]+\/accept$/)) {
      ensureStructuredFlowEnabled();
      const auth = requireJwt(req, 'customer', 'vendor');
      const [, , , bookingId, , itemId] = path.split('/');
      const body = await readBody(req);
      const offerVersion = toPositiveInt(body.offerVersion, 'offerVersion');

      const updated = await prisma.$transaction(async (tx) => {
        await expireNegotiationsIfInactive(tx, bookingId);
        const booking = await tx.booking.findUnique({
          where: { id: bookingId },
          include: { invoice: true },
        });
        if (!booking) throw httpError(404, 'Booking not found');
        if (!['pending', 'partially_accepted'].includes(booking.status)) {
          throw httpError(400, `Booking is ${booking.status} and cannot be accepted`);
        }
        if (booking.invoice && ['issued', 'paid'].includes(booking.invoice.status)) {
          throw httpError(409, 'Invoice already issued. Price cannot be changed.');
        }

        const item = await tx.bookingItem.findFirst({
          where: { id: itemId, bookingId },
        });
        if (!item) throw httpError(404, 'Booking item not found');
        if (offerVersion !== Number(item.currentOfferVersion || 0)) {
          throw httpError(409, 'Offer updated, please review latest.');
        }

        let actorRole = 'customer';
        let actorVendorId = null;
        if (auth.role === 'customer') {
          const customer = await tx.user.findFirst({
            where: { id: String(auth.sub), role: 'customer' },
          });
          if (!customer) throw httpError(404, 'Customer not found');
          if (customer.id !== booking.customerId) throw httpError(403, 'Not your booking');
          if (Number(item.customerAcceptedVersion || 0) === offerVersion) {
            throw httpError(409, 'Customer already accepted this offer version');
          }
          actorRole = 'customer';
        } else {
          const app = await tx.vendorApplication.findFirst({
            where: { email: { equals: String(auth.email || ''), mode: 'insensitive' } },
          });
          if (!app) throw httpError(404, 'Vendor account not found');
          const { vendorProfile } = await ensureVendorIdentityFromApplication(tx, app);
          if (vendorProfile.id !== item.vendorId) throw httpError(403, 'Cannot accept another vendor item');
          if (Number(item.vendorAcceptedVersion || 0) === offerVersion) {
            throw httpError(409, 'Vendor already accepted this offer version');
          }
          actorRole = 'vendor';
          actorVendorId = vendorProfile.id;
        }

        await tx.offerEvent.create({
          data: {
            bookingId,
            bookingItemId: item.id,
            vendorId: actorVendorId || item.vendorId,
            actorRole,
            type: actorRole === 'vendor' ? 'vendor_accepted' : 'customer_accepted',
            offerVersion,
            priceCents: item.latestPriceCents || null,
          },
        });
        await appendNegotiationMessage(tx, {
          bookingId,
          senderRole: actorRole === 'vendor' ? 'VENDOR' : 'CUSTOMER',
          proposedCents: item.latestPriceCents || null,
          reason: actorRole === 'vendor' ? 'Vendor accepted offer.' : 'Customer accepted offer.',
        });

        const nextCustomerAccepted = actorRole === 'customer' ? offerVersion : item.customerAcceptedVersion;
        const nextVendorAccepted = actorRole === 'vendor' ? offerVersion : item.vendorAcceptedVersion;
        const bothAcceptedSame = Number(nextCustomerAccepted || 0) === offerVersion
          && Number(nextVendorAccepted || 0) === offerVersion;

        await tx.bookingItem.update({
          where: { id: item.id },
          data: {
            customerAcceptedVersion: nextCustomerAccepted || null,
            vendorAcceptedVersion: nextVendorAccepted || null,
            status: bothAcceptedSame ? 'agreed' : item.status,
            finalPriceCents: bothAcceptedSame ? Number(item.latestPriceCents || 0) : item.finalPriceCents,
            finalPrice: bothAcceptedSame ? centsToLegacyPrice(Number(item.latestPriceCents || 0)) : item.finalPrice,
            lastNegotiationAt: new Date(),
          },
        });

        return recomputeBookingNegotiationStatus(tx, bookingId);
      });

      return sendJson(res, 200, { booking: updated });
    }

    if (req.method === 'POST' && path.match(/^\/api\/bookings\/[^/]+\/items\/[^/]+\/decline$/)) {
      ensureStructuredFlowEnabled();
      const auth = requireJwt(req, 'customer', 'vendor');
      const [, , , bookingId, , itemId] = path.split('/');
      const body = await readBody(req);
      const reason = normalizeOptionalString(body.reason, 400);
      if (reason) assertNoContactInfo(reason);

      const updated = await prisma.$transaction(async (tx) => {
        await expireNegotiationsIfInactive(tx, bookingId);
        const booking = await tx.booking.findUnique({
          where: { id: bookingId },
          include: { invoice: true, items: true },
        });
        if (!booking) throw httpError(404, 'Booking not found');
        if (booking.invoice && ['issued', 'paid'].includes(booking.invoice.status)) {
          throw httpError(409, 'Invoice already issued. Negotiation cannot be declined now.');
        }
        if (!['pending', 'partially_accepted'].includes(booking.status)) {
          throw httpError(400, `Booking is ${booking.status} and cannot be declined`);
        }

        const item = booking.items.find((i) => i.id === itemId);
        if (!item) throw httpError(404, 'Booking item not found');
        if (['declined', 'cancelled', 'expired'].includes(item.status)) {
          throw httpError(400, `Item already ${item.status}`);
        }

        let actorRole = 'customer';
        let actorVendorId = null;
        if (auth.role === 'customer') {
          const customer = await tx.user.findFirst({
            where: { id: String(auth.sub), role: 'customer' },
          });
          if (!customer) throw httpError(404, 'Customer not found');
          if (customer.id !== booking.customerId) throw httpError(403, 'Not your booking');
          actorRole = 'customer';
        } else {
          const app = await tx.vendorApplication.findFirst({
            where: { email: { equals: String(auth.email || ''), mode: 'insensitive' } },
          });
          if (!app) throw httpError(404, 'Vendor account not found');
          const { vendorProfile } = await ensureVendorIdentityFromApplication(tx, app);
          if (vendorProfile.id !== item.vendorId) throw httpError(403, 'Cannot decline another vendor item');
          actorRole = 'vendor';
          actorVendorId = vendorProfile.id;
        }

        await tx.offerEvent.create({
          data: {
            bookingId,
            bookingItemId: item.id,
            vendorId: actorVendorId || item.vendorId,
            actorRole,
            type: 'declined',
            offerVersion: item.currentOfferVersion || 1,
            reason: reason || null,
            priceCents: item.latestPriceCents || null,
          },
        });
        await appendNegotiationMessage(tx, {
          bookingId,
          senderRole: actorRole === 'vendor' ? 'VENDOR' : 'CUSTOMER',
          proposedCents: item.latestPriceCents || null,
          reason: reason || 'Offer declined.',
        });

        await tx.bookingItem.update({
          where: { id: item.id },
          data: {
            status: 'declined',
            lastNegotiationAt: new Date(),
          },
        });

        if (item.isRequired) {
          await tx.bookingItem.updateMany({
            where: {
              bookingId,
              id: { not: item.id },
              status: { notIn: ['declined', 'cancelled', 'expired'] },
            },
            data: { status: 'cancelled', lastNegotiationAt: new Date() },
          });
          const cancelledBooking = await tx.booking.update({
            where: { id: bookingId },
            data: { status: 'cancelled' },
            include: { items: true, invoice: true },
          });
          await releaseBookingAvailability(tx, cancelledBooking);
          return cancelledBooking;
        }

        return recomputeBookingNegotiationStatus(tx, bookingId);
      });

      return sendJson(res, 200, { booking: updated });
    }

    if (req.method === 'GET' && path.match(/^\/api\/bookings\/[^/]+\/thread$/)) {
      ensureStructuredFlowEnabled();
      const auth = requireJwt(req, 'customer', 'vendor', 'admin');
      const bookingId = path.split('/')[3];
      const actorRole = auth.role === 'admin' ? null : auth.role;

      const payload = await prisma.$transaction(async (tx) => {
        await expireNegotiationsIfInactive(tx, bookingId);
        const booking = await tx.booking.findUnique({
          where: { id: bookingId },
          include: {
            invoice: true,
            items: {
              include: {
                service: true,
                vendor: { include: { user: true } },
                offerEvents: { orderBy: { createdAt: 'asc' } },
              },
            },
          },
        });
        if (!booking) throw httpError(404, 'Booking not found');

        let actorVendorId = null;
        if (actorRole === 'customer') {
          const customer = await tx.user.findFirst({
            where: { id: String(auth.sub), role: 'customer' },
          });
          if (!customer || customer.id !== booking.customerId) throw httpError(403, 'Not allowed for this customer');
        }
        if (actorRole === 'vendor') {
          const app = await tx.vendorApplication.findFirst({
            where: { email: { equals: String(auth.email || ''), mode: 'insensitive' } },
          });
          if (!app) throw httpError(404, 'Vendor account not found');
          const { vendorProfile } = await ensureVendorIdentityFromApplication(tx, app);
          actorVendorId = vendorProfile.id;
        }

        const items = booking.items.map((item) => {
          const latestOffer = [...item.offerEvents]
            .reverse()
            .find((event) => typeof event.priceCents === 'number');
          const lastEvent = item.offerEvents[item.offerEvents.length - 1];
          const actorCanRead = !actorRole
            || actorRole === 'customer'
            || (actorRole === 'vendor' && actorVendorId === item.vendorId);
          if (!actorCanRead) return null;

          const isLocked = ['agreed', 'declined', 'expired', 'cancelled'].includes(item.status)
            || (booking.invoice && ['issued', 'paid'].includes(booking.invoice.status));

          const canCounter = Boolean(
            actorRole &&
            !isLocked &&
            canActorCounter(lastEvent?.type || null, actorRole),
          );
          const canCustomerCounter = Boolean(!isLocked && canActorCounter(lastEvent?.type || null, 'customer'));
          const canVendorCounter = Boolean(!isLocked && canActorCounter(lastEvent?.type || null, 'vendor'));
          const canAccept = Boolean(
            actorRole &&
            !isLocked &&
            Number(item.currentOfferVersion || 0) > 0 &&
            !(
              (actorRole === 'customer' && Number(item.customerAcceptedVersion || 0) === Number(item.currentOfferVersion || 0)) ||
              (actorRole === 'vendor' && Number(item.vendorAcceptedVersion || 0) === Number(item.currentOfferVersion || 0))
            ),
          );

          return {
            id: item.id,
            serviceId: item.serviceId,
            serviceTitle: item.service.title,
            vendorId: item.vendorId,
            vendorName: item.vendor.user.name,
            status: item.status,
            isRequired: item.isRequired,
            currentOfferVersion: item.currentOfferVersion,
            latestOffer: latestOffer
              ? {
                  version: latestOffer.offerVersion,
                  priceCents: latestOffer.priceCents,
                  reason: latestOffer.reason || null,
                  breakdownJson: latestOffer.breakdownJson || null,
                }
              : null,
            finalPriceCents: item.finalPriceCents,
            events: item.offerEvents,
            actions: {
              canCounter,
              canCustomerCounter,
              canVendorCounter,
              canAccept,
              canDecline: !isLocked && Boolean(actorRole),
            },
          };
        }).filter(Boolean);

        const agreement = await getServiceAgreementRecord(booking.id);
        return {
          booking: {
            id: booking.id,
            status: booking.status,
            eventDate: booking.eventDate,
            totalPrice: booking.totalPrice,
            finalPrice: booking.finalPrice,
            invoice: booking.invoice,
            agreement: {
              ...agreement,
              required: booking.status === 'accepted',
              customerAccepted: Boolean(agreement.agreementAcceptedByCustomerAt),
              vendorAccepted: Boolean(agreement.agreementAcceptedByVendorAt),
            },
          },
          items,
        };
      });

      return sendJson(res, 200, payload);
    }

    if (
      req.method === 'POST'
      && (path.match(/^\/api\/bookings\/[^/]+\/agreement\/accept$/) || path.match(/^\/api\/agreements\/[^/]+\/accept$/))
    ) {
      ensureStructuredFlowEnabled();
      const auth = requireJwt(req, 'customer');
      const bookingId = path.startsWith('/api/agreements/') ? path.split('/')[3] : path.split('/')[3];
      const body = await readBody(req);
      const customerEmail = normalizeOptionalString(body.customerEmail || auth.email, 320);
      if (!customerEmail) return sendJson(res, 400, { error: 'customerEmail is required' });
      if (String(auth.email || '').toLowerCase() !== customerEmail.toLowerCase()) {
        return sendJson(res, 403, { error: 'customerEmail must match authenticated user' });
      }

      const booking = await prisma.booking.findUnique({
        where: { id: bookingId },
        include: {
          customer: true,
          items: true,
        },
      });
      if (!booking) return sendJson(res, 404, { error: 'Booking not found' });
      if (booking.customer.email.toLowerCase() !== customerEmail.toLowerCase()) {
        return sendJson(res, 403, { error: 'Not allowed for this booking' });
      }
      if (booking.status !== 'accepted') {
        return sendJson(res, 400, { error: 'Agreement can be accepted only when booking is ACCEPTED' });
      }
      if (!booking.items.every((item) => item.status === 'agreed')) {
        return sendJson(res, 400, { error: 'All booking items must be AGREED before agreement acceptance' });
      }

      const lastVendorAcceptEvent = await prisma.offerEvent.findFirst({
        where: { bookingId, type: 'vendor_accepted' },
        orderBy: { createdAt: 'desc' },
      });
      const finalTotalCents = booking.items.reduce(
        (sum, item) => sum + Number(item.finalPriceCents || item.latestPriceCents || 0),
        0,
      );
      const totals = computeTotalsFromGross(finalTotalCents);
      const agreement = await updateServiceAgreementRecord(bookingId, (current) => ({
        ...current,
        agreementVersion: normalizeOptionalString(body.agreementVersion, 32) || SERVICE_AGREEMENT_VERSION,
        agreementAcceptedByCustomerAt: new Date().toISOString(),
        agreementAcceptedByCustomerIp: getClientIp(req),
        agreementAcceptedByVendorAt:
          current.agreementAcceptedByVendorAt
          || (lastVendorAcceptEvent?.createdAt ? new Date(lastVendorAcceptEvent.createdAt).toISOString() : null),
        netAmount: totals.netAmount,
        vatAmount: totals.vatAmount,
        grossAmount: totals.grossAmount,
        platformFee: totals.platformFee,
        vendorNetAmount: totals.vendorNetAmount,
      }));
      await prisma.booking.update({
        where: { id: bookingId },
        data: {
          agreedNetAmount: Number((totals.netAmount / 100).toFixed(2)),
          vatAmount: Number((totals.vatAmount / 100).toFixed(2)),
          grossAmount: Number((totals.grossAmount / 100).toFixed(2)),
          platformFee: Number((totals.platformFee / 100).toFixed(2)),
          vendorNetAmount: Number((totals.vendorNetAmount / 100).toFixed(2)),
        },
      });

      return sendJson(res, 200, {
        agreement: {
          ...agreement,
          required: true,
          customerAccepted: true,
          vendorAccepted: Boolean(agreement.agreementAcceptedByVendorAt),
        },
      });
    }

    if (req.method === 'POST' && path.match(/^\/api\/bookings\/[^/]+\/checkout$/)) {
      ensureStructuredFlowEnabled();
      if (enforceRateLimit(req, res, 'payment')) return;
      const auth = requireJwt(req, 'customer');
      if (!stripe) return sendJson(res, 400, { error: 'Stripe is not configured' });
      const bookingId = path.split('/')[3];
      const body = await readBody(req);
      const customerEmail = normalizeOptionalString(body.customerEmail, 320);
      const successUrl = normalizeOptionalString(body.successUrl, 1000);
      const cancelUrl = normalizeOptionalString(body.cancelUrl, 1000);
      if (!customerEmail || !successUrl || !cancelUrl) {
        return sendJson(res, 400, { error: 'customerEmail, successUrl and cancelUrl are required' });
      }

      const result = await prisma.$transaction(async (tx) => {
        const booking = await tx.booking.findUnique({
          where: { id: bookingId },
          include: { items: true, invoice: true, customer: true },
        });
        if (!booking) throw httpError(404, 'Booking not found');
        if (booking.customer.email.toLowerCase() !== customerEmail.toLowerCase()) {
          throw httpError(403, 'Not allowed for this booking');
        }
        if (booking.customer.email.toLowerCase() !== String(auth.email || '').toLowerCase()) {
          throw httpError(403, 'Token customer does not match booking customer');
        }
        if (booking.status !== 'accepted') throw httpError(400, 'Booking must be ACCEPTED before checkout');
        if (!booking.items.every((item) => item.status === 'agreed')) {
          throw httpError(400, 'All booking items must be AGREED before checkout');
        }

        const agreement = await getServiceAgreementRecord(booking.id);
        if (!agreement.agreementAcceptedByCustomerAt) {
          throw httpError(400, 'Customer must accept the service agreement before checkout');
        }
        if (!agreement.agreementAcceptedByVendorAt) {
          throw httpError(400, 'Vendor must accept the service agreement before checkout');
        }

        const notReadyVendors = [];
        for (const item of booking.items) {
          const vendorApp = await getVendorApplicationFromBookingItem(tx, item);
          if (!vendorApp) {
            notReadyVendors.push({ itemId: item.id, reason: 'Vendor account not linked' });
            continue;
          }
          const payoutReadiness = await getVendorPayoutReadiness(vendorApp);
          if (!payoutReadiness.ready) {
            notReadyVendors.push({
              itemId: item.id,
              reason: `${vendorApp.businessName || vendorApp.email} is not payout-ready (${payoutReadiness.reason || 'Stripe setup incomplete'})`,
            });
          }
        }
        if (notReadyVendors.length > 0) {
          throw httpError(
            400,
            `Payout readiness failed for vendor items: ${notReadyVendors.map((v) => v.reason).join('; ')}`,
          );
        }

        const finalTotalCents = booking.items.reduce(
          (sum, item) => sum + Number(item.finalPriceCents || item.latestPriceCents || 0),
          0,
        );
        if (finalTotalCents <= 0) throw httpError(400, 'Final total must be greater than zero');
        const totals = computeTotalsFromGross(finalTotalCents);

        const invoice = await tx.invoice.upsert({
          where: { bookingId },
          update: {
            amount: finalTotalCents,
            status: 'issued',
            issuedAt: new Date(),
          },
          create: {
            bookingId,
            amount: finalTotalCents,
            status: 'issued',
            issuedAt: new Date(),
          },
        });

        if (invoice.status === 'paid') throw httpError(409, 'Invoice already paid');

        const session = await stripe.checkout.sessions.create({
          mode: 'payment',
          customer_email: customerEmail,
          success_url: successUrl,
          cancel_url: cancelUrl,
          payment_intent_data: {
            transfer_group: `booking_${booking.id}`,
            metadata: {
              bookingId: booking.id,
              invoiceId: invoice.id,
              customerEmail,
            },
          },
          line_items: [
            {
              quantity: 1,
              price_data: {
                currency: 'eur',
                unit_amount: finalTotalCents,
                product_data: {
                  name: `Booking ${booking.id}`,
                  description: 'Final agreed booking amount',
                },
              },
            },
          ],
          metadata: {
            bookingId: booking.id,
            invoiceId: invoice.id,
            customerEmail,
            agreementVersion: String(agreement.agreementVersion || SERVICE_AGREEMENT_VERSION),
            agreementAcceptedAt: String(agreement.agreementAcceptedByCustomerAt || ''),
          },
        });

        await tx.invoice.update({
          where: { id: invoice.id },
          data: { stripeSessionId: session.id },
        });
        await tx.booking.update({
          where: { id: booking.id },
          data: {
            stripeSessionId: session.id,
            grossAmount: Number((finalTotalCents / 100).toFixed(2)),
            agreedNetAmount: Number((totals.netAmount / 100).toFixed(2)),
            vatAmount: Number((totals.vatAmount / 100).toFixed(2)),
            platformFee: Number((totals.platformFee / 100).toFixed(2)),
            vendorNetAmount: Number((totals.vendorNetAmount / 100).toFixed(2)),
          },
        });

        return { sessionId: session.id, url: session.url, invoiceId: invoice.id };
      });

      return sendJson(res, 200, result);
    }

    if (req.method === 'POST' && path.match(/^\/api\/marketplace\/bookings\/[^/]+\/vendor-decision$/)) {
      ensureStructuredFlowEnabled();
      const auth = requireJwt(req, 'vendor');
      const bookingId = path.split('/')[4];
      const body = await readBody(req);
      const vendorEmail = String(body.vendorEmail || '').trim();
      const decisions = Array.isArray(body.decisions) ? body.decisions : [];
      if (!vendorEmail || decisions.length === 0) {
        return sendJson(res, 400, { error: 'vendorEmail and decisions are required' });
      }
      if (vendorEmail.toLowerCase() !== String(auth.email || '').toLowerCase()) {
        return sendJson(res, 403, { error: 'vendorEmail must match authenticated vendor' });
      }

      const updatedBooking = await prisma.$transaction(async (tx) => {
        const booking = await tx.booking.findUnique({
          where: { id: bookingId },
          include: { items: true },
        });
        if (!booking) throw httpError(404, 'Booking not found');
        if (['declined', 'cancelled', 'expired', 'completed'].includes(booking.status)) {
          throw httpError(400, `Booking is ${booking.status} and cannot be modified`);
        }

        const app = await tx.vendorApplication.findFirst({
          where: { email: { equals: vendorEmail, mode: 'insensitive' } },
        });
        if (!app) throw httpError(404, 'Vendor account not found');
        await assertVendorCanPublishOrRespond(app);

        const { vendorProfile } = await ensureVendorIdentityFromApplication(tx, app);
        if (!['approved', 'active'].includes(vendorProfile.status)) {
          throw httpError(403, `Vendor profile status is ${vendorProfile.status}`);
        }

        for (const decision of decisions) {
          const bookingItemId = String(decision.bookingItemId || '').trim();
          const item = booking.items.find((i) => i.id === bookingItemId);
          if (!item) throw httpError(404, `Booking item ${bookingItemId} not found`);
          if (item.vendorId !== vendorProfile.id) throw httpError(403, 'Cannot modify another vendor item');

          const nextStatus = String(decision.status || '').trim();
          if (!['accepted', 'declined', 'counter_offered'].includes(nextStatus)) {
            throw httpError(400, 'Invalid booking item decision status');
          }

          const updateData = {
            status: nextStatus,
            vendorMessage: decision.vendorMessage || null,
            finalPrice: null,
            priceOffered: item.priceOffered,
          };

          if (nextStatus === 'counter_offered') {
            const counterPrice = Number(decision.counterPrice || 0);
            if (!Number.isFinite(counterPrice) || counterPrice <= 0) {
              throw httpError(400, 'counterPrice must be > 0 for counter_offered');
            }
            updateData.priceOffered = counterPrice;
          }

          if (nextStatus === 'accepted') {
            const finalPrice = Number(decision.finalPrice || item.priceOffered);
            if (!Number.isFinite(finalPrice) || finalPrice <= 0) throw httpError(400, 'Invalid finalPrice');
            updateData.finalPrice = finalPrice;
          }

          await tx.bookingItem.update({
            where: { id: item.id },
            data: updateData,
          });

          await appendNegotiationMessage(tx, {
            bookingId,
            senderRole: 'VENDOR',
            proposedCents:
              nextStatus === 'counter_offered'
                ? toPositiveInt(Number(decision.counterPrice || 0) * 100, 'counterPrice')
                : (nextStatus === 'accepted'
                  ? toPositiveInt(Number(decision.finalPrice || item.priceOffered) * 100, 'finalPrice')
                  : null),
            reason: decision.vendorMessage || (nextStatus === 'declined' ? 'Declined by vendor.' : null),
          });
        }

        const items = await tx.bookingItem.findMany({ where: { bookingId } });
        const hasDeclined = items.some((i) => i.status === 'declined');
        const allAccepted = items.length > 0 && items.every((i) => i.status === 'accepted');
        const hasProgress = items.some((i) => i.status === 'accepted' || i.status === 'counter_offered');
        let bookingStatus = booking.status;

        if (hasDeclined) bookingStatus = 'declined';
        else if (allAccepted) bookingStatus = 'accepted';
        else if (hasProgress) bookingStatus = 'partially_accepted';
        else bookingStatus = 'pending';

        const finalPrice = items.reduce((sum, i) => sum + Number(i.finalPrice || i.priceOffered || 0), 0);

        const bookingUpdated = await tx.booking.update({
          where: { id: bookingId },
          data: {
            status: bookingStatus,
            totalPrice: finalPrice,
            finalPrice: bookingStatus === 'accepted' ? finalPrice : null,
          },
        });

        if (bookingStatus === 'declined') {
          await releaseBookingAvailability(tx, bookingUpdated);
        }

        if (bookingStatus === 'accepted') {
          await bookBookingAvailability(tx, bookingUpdated);
          await tx.invoice.upsert({
            where: { bookingId },
            update: {
              amount: finalPrice,
              status: 'issued',
              issuedAt: new Date(),
            },
            create: {
              bookingId,
              amount: finalPrice,
              status: 'issued',
              issuedAt: new Date(),
            },
          });
          await tx.analyticsEvent.create({
            data: {
              type: 'booking_accepted',
              vendorId: vendorProfile.id,
              bookingId,
            },
          });
        }

        return tx.booking.findUnique({
          where: { id: bookingId },
          include: { items: true, invoice: true },
        });
      });

      return sendJson(res, 200, { booking: updatedBooking });
    }

    if (req.method === 'POST' && path === '/api/marketplace/bookings/expire') {
      ensureStructuredFlowEnabled();
      const now = new Date();
      const expired = await prisma.$transaction(async (tx) => {
        const bookings = await tx.booking.findMany({
          where: {
            status: { in: ['pending', 'partially_accepted'] },
            expiresAt: { lt: now },
          },
        });

        for (const booking of bookings) {
          await tx.booking.update({
            where: { id: booking.id },
            data: { status: 'expired' },
          });
          await tx.bookingItem.updateMany({
            where: {
              bookingId: booking.id,
              status: { in: ['requested', 'countered', 'pending', 'counter_offered'] },
            },
            data: { status: 'expired', lastNegotiationAt: new Date() },
          });
          await releaseBookingAvailability(tx, booking);
        }
        return bookings.length;
      });

      return sendJson(res, 200, { expired });
    }

    if (req.method === 'POST' && path === '/api/marketplace/reviews') {
      ensureStructuredFlowEnabled();
      const auth = requireJwt(req, 'customer');
      const body = await readBody(req);
      const bookingId = String(body.bookingId || '').trim();
      const serviceId = String(body.serviceId || '').trim();
      const customerEmail = String(body.customerEmail || '').trim();
      const rating = Number(body.rating);
      if (!bookingId || !serviceId || !customerEmail || !Number.isFinite(rating)) {
        return sendJson(res, 400, { error: 'bookingId, serviceId, customerEmail, rating are required' });
      }
      if (customerEmail.toLowerCase() !== String(auth.email || '').toLowerCase()) {
        return sendJson(res, 403, { error: 'customerEmail must match authenticated user' });
      }
      if (rating < 1 || rating > 5) return sendJson(res, 400, { error: 'rating must be between 1 and 5' });

      const review = await prisma.$transaction(async (tx) => {
        const customer = await tx.user.findFirst({
          where: { email: { equals: customerEmail, mode: 'insensitive' }, role: 'customer' },
        });
        if (!customer) throw httpError(404, 'Customer not found');

        const booking = await tx.booking.findUnique({
          where: { id: bookingId },
          include: { items: true },
        });
        if (!booking) throw httpError(404, 'Booking not found');
        if (booking.customerId !== customer.id) throw httpError(403, 'Cannot review another customer booking');
        if (!(booking.status === 'completed' || booking.isCompleted)) {
          throw httpError(400, 'Booking must be completed before review');
        }

        const item = booking.items.find((i) => i.serviceId === serviceId && i.status === 'accepted');
        if (!item) throw httpError(400, 'Service is not accepted in this booking');

        const created = await tx.review.create({
          data: {
            bookingId,
            serviceId,
            vendorId: item.vendorId,
            customerId: customer.id,
            rating: Math.round(rating),
            comment: body.comment || null,
          },
        });

        const agg = await tx.review.aggregate({
          where: { vendorId: item.vendorId },
          _count: { _all: true },
          _avg: { rating: true },
        });

        await tx.vendorProfile.update({
          where: { id: item.vendorId },
          data: {
            totalReviews: agg._count._all || 0,
            ratingAverage: agg._avg.rating || 0,
          },
        });

        await tx.analyticsEvent.create({
          data: {
            type: 'review_created',
            userId: customer.id,
            vendorId: item.vendorId,
            serviceId,
            bookingId,
          },
        });

        return created;
      });

      return sendJson(res, 201, { review });
    }

    if (req.method === 'POST' && path === '/api/requests') {
      ensureLegacyFlowEnabled();
      const auth = requireJwt(req, 'customer');
      const body = await readBody(req);
      const { customerName, customerEmail, selectedServices, budget } = body;
      if (!customerName || !customerEmail || !Array.isArray(selectedServices) || selectedServices.length === 0 || !budget) {
        return sendJson(res, 400, { error: 'Missing required fields' });
      }
      if (customerEmail.toLowerCase() !== String(auth.email || '').toLowerCase()) {
        return sendJson(res, 403, { error: 'customerEmail must match authenticated user' });
      }
      const offerResponseHours = normalizeResponseHours(body.offerResponseHours);
      const expiresAt = new Date(Date.now() + offerResponseHours * 60 * 60 * 1000);

      const request = await prisma.serviceRequest.create({
        data: {
          customerName,
          customerEmail,
          customerPhone: body.customerPhone || null,
          selectedServices,
          budget: Number(budget),
          eventDate: body.eventDate ? new Date(body.eventDate) : null,
          address: body.address || null,
          notes: body.notes || '',
          status: 'open',
          offerResponseHours,
          expiresAt,
        },
        include: { offers: { orderBy: { createdAt: 'desc' } } },
      });
      return sendJson(res, 201, { request: serializeRequest(request) });
    }

    if (req.method === 'GET' && path === '/api/requests/open') {
      ensureLegacyFlowEnabled();
      const auth = requireJwt(req, 'vendor', 'admin');
      await expireStaleRequests();
      const requestedVendorEmail = String(url.searchParams.get('vendorEmail') || '').trim();
      const vendorEmail = auth.role === 'vendor'
        ? String(auth.email || '').trim()
        : requestedVendorEmail;

      if (!vendorEmail) {
        return sendJson(res, 400, { error: 'vendorEmail is required for admin query' });
      }

      const vendor = await prisma.vendorApplication.findFirst({
        where: { email: { equals: vendorEmail, mode: 'insensitive' } },
      });
      if (!vendor) return sendJson(res, 404, { error: 'Vendor profile not found' });

      const vendorPosts = await prisma.vendorPost.findMany({
        where: {
          vendorApplicationId: vendor.id,
          isActive: true,
        },
      });

      const vendorKeywords = extractKeywordSet([
        vendor.businessName || '',
        vendor.city || '',
        ...vendorPosts.map((post) => post.title || ''),
        ...vendorPosts.map((post) => post.serviceName || ''),
      ]);
      const vendorCategories = resolveVendorCategoryKeywords(vendor, vendorPosts);

      const requests = await prisma.serviceRequest.findMany({
        where: { status: 'open' },
        include: { offers: { orderBy: { createdAt: 'desc' } } },
        orderBy: { createdAt: 'desc' },
      });

      const filtered = requests.filter((request) => {
        const existingOfferByVendor = (request.offers || []).find(
          (offer) => String(offer.vendorEmail || '').toLowerCase() === vendorEmail.toLowerCase(),
        );
        if (existingOfferByVendor) {
          return !['declined', 'ignored'].includes(String(existingOfferByVendor.status || '').toLowerCase());
        }

        const requestKeywords = extractKeywordSet([
          ...(Array.isArray(request.selectedServices) ? request.selectedServices : []),
          request.notes || '',
          request.address || '',
        ]);
        const requestCategories = resolveRequestCategoryKeywords(request);
        const categoryMatch = intersects(vendorCategories, requestCategories);
        if (vendorCategories.size === 0 || requestCategories.size === 0) return false;
        return categoryMatch;
      });

      return sendJson(res, 200, { requests: filtered.map(serializeRequest) });
    }

    if (req.method === 'GET' && path === '/api/requests') {
      ensureLegacyFlowEnabled();
      const auth = requireJwt(req, 'customer', 'admin');
      await expireStaleRequests();
      const email = (url.searchParams.get('customerEmail') || '').trim();
      if (auth.role === 'customer' && email.toLowerCase() !== String(auth.email || '').toLowerCase()) {
        return sendJson(res, 403, { error: 'You can only read your own requests' });
      }
      const requests = await prisma.serviceRequest.findMany({
        where: email ? { customerEmail: { equals: email, mode: 'insensitive' } } : undefined,
        include: { offers: { orderBy: { createdAt: 'desc' } } },
        orderBy: { createdAt: 'desc' },
      });
      return sendJson(res, 200, { requests: requests.map(serializeRequest) });
    }

    if (req.method === 'POST' && path.match(/^\/api\/requests\/[^/]+\/cancel$/)) {
      ensureLegacyFlowEnabled();
      const auth = requireJwt(req, 'customer', 'admin');
      await expireStaleRequests();
      const requestId = path.split('/')[3];
      const body = await readBody(req);
      const isAdmin = auth.role === 'admin' || isAdminAuthorized(req);

      const request = await prisma.serviceRequest.findUnique({
        where: { id: requestId },
        include: { offers: true },
      });
      if (!request) return sendJson(res, 404, { error: 'Request not found' });

      if (!isAdmin) {
        const customerEmail = String(body.customerEmail || '').trim().toLowerCase();
        if (!customerEmail) {
          return sendJson(res, 400, { error: 'customerEmail is required for cancellation' });
        }
        if (customerEmail !== String(auth.email || '').toLowerCase()) {
          return sendJson(res, 403, { error: 'Token customer mismatch' });
        }
        if (customerEmail !== String(request.customerEmail || '').toLowerCase()) {
          return sendJson(res, 403, { error: 'You can only cancel your own requests' });
        }
      }

      if (request.status !== 'open') {
        return sendJson(res, 400, { error: `Request is already ${request.status}` });
      }

      const hasPaidOffer = (request.offers || []).some((offer) => offer.paymentStatus === 'paid');
      if (hasPaidOffer) {
        return sendJson(res, 400, { error: 'Paid requests cannot be cancelled' });
      }

      await prisma.$transaction(async (tx) => {
        await tx.serviceRequest.update({
          where: { id: request.id },
          data: {
            status: 'closed',
            closedAt: new Date(),
            closedReason: 'customer_cancelled',
          },
        });
        await tx.vendorOffer.updateMany({
          where: {
            requestId: request.id,
            paymentStatus: { not: 'paid' },
            status: { in: ['pending', 'accepted'] },
          },
          data: { status: 'ignored' },
        });
      });

      const updated = await prisma.serviceRequest.findUnique({
        where: { id: request.id },
        include: { offers: { orderBy: { createdAt: 'desc' } } },
      });
      if (!updated) return sendJson(res, 404, { error: 'Request not found after cancellation' });

      if (isAdmin) {
        await writeAdminAuditLog(req, 'request_cancelled', request.id, { reason: 'customer_cancelled' });
      }
      return sendJson(res, 200, { request: serializeRequest(updated), cancelled: true });
    }

    if (req.method === 'GET' && path.match(/^\/api\/requests\/[^/]+\/responses$/)) {
      ensureLegacyFlowEnabled();
      const auth = requireJwt(req, 'customer', 'vendor', 'admin');
      await expireStaleRequests();
      const requestId = path.split('/')[3];
      const request = await prisma.serviceRequest.findUnique({
        where: { id: requestId },
        include: { offers: { orderBy: { createdAt: 'desc' } } },
      });
      if (!request) return sendJson(res, 404, { error: 'Request not found' });

      if (auth.role === 'customer' && request.customerEmail.toLowerCase() !== String(auth.email || '').toLowerCase()) {
        return sendJson(res, 403, { error: 'You can only read responses for your own requests' });
      }
      if (auth.role === 'vendor') {
        request.offers = request.offers.filter(
          (offer) => String(offer.vendorEmail || '').toLowerCase() === String(auth.email || '').toLowerCase(),
        );
      }

      return sendJson(res, 200, {
        request: serializeRequest({ ...request, offers: [] }),
        responses: request.offers.map((offer) => ({
          id: offer.id,
          vendorName: offer.vendorName,
          vendorEmail: offer.vendorEmail || null,
          status: offer.status,
          proposedPrice: Number(offer.price),
          message: offer.message || null,
          paymentStatus: offer.paymentStatus || 'unpaid',
          createdAt: offer.createdAt,
        })),
      });
    }

    if (req.method === 'GET' && path === '/api/vendor/offers') {
      ensureLegacyFlowEnabled();
      const auth = requireJwt(req, 'vendor', 'admin');
      await expireStaleRequests();
      const vendorEmail = (url.searchParams.get('vendorEmail') || '').trim();
      if (!vendorEmail) return sendJson(res, 400, { error: 'vendorEmail is required' });
      if (auth.role === 'vendor' && vendorEmail.toLowerCase() !== String(auth.email || '').toLowerCase()) {
        return sendJson(res, 403, { error: 'You can only read your own vendor offers' });
      }

      const offers = await prisma.vendorOffer.findMany({
        where: {
          vendorEmail: { equals: vendorEmail, mode: 'insensitive' },
        },
        include: {
          request: true,
        },
        orderBy: { createdAt: 'desc' },
      });

      return sendJson(res, 200, {
        offers: offers.map((offer) => ({
          id: offer.id,
          vendorName: offer.vendorName,
          vendorEmail: offer.vendorEmail || '',
          price: Number(offer.price),
          message: offer.message || '',
          status: offer.status,
          paymentStatus: offer.paymentStatus || 'unpaid',
          stripeSessionId: offer.stripeSessionId || null,
          stripePaymentIntent: offer.stripePaymentIntent || null,
          paidAt: offer.paidAt || null,
          createdAt: offer.createdAt,
          request: serializeRequest({ ...offer.request, offers: [] }),
        })),
      });
    }

    if (req.method === 'PATCH' && path.match(/^\/api\/vendor\/offers\/[^/]+$/)) {
      ensureLegacyFlowEnabled();
      const auth = requireJwt(req, 'vendor');
      const offerId = path.split('/')[4];
      const body = await readBody(req);
      const price = Number(body.price);
      const message = normalizeOptionalString(body.message, 1200) || '';

      if (!Number.isFinite(price) || price <= 0) {
        return sendJson(res, 400, { error: 'price must be > 0' });
      }

      const offer = await prisma.vendorOffer.findUnique({
        where: { id: offerId },
        include: { request: true },
      });
      if (!offer) return sendJson(res, 404, { error: 'Offer not found' });

      const vendorEmail = String(auth.email || '').toLowerCase();
      if (String(offer.vendorEmail || '').toLowerCase() !== vendorEmail) {
        return sendJson(res, 403, { error: 'You can only edit your own offers' });
      }
      if (offer.status !== 'pending') {
        return sendJson(res, 400, { error: 'Only pending offers can be edited' });
      }
      if (offer.paymentStatus === 'paid') {
        return sendJson(res, 400, { error: 'Paid offers cannot be edited' });
      }
      if (offer.request?.status !== 'open') {
        return sendJson(res, 400, { error: 'Request is not open anymore' });
      }

      const updated = await prisma.vendorOffer.update({
        where: { id: offerId },
        data: {
          price,
          message,
        },
        include: { request: true },
      });

      return sendJson(res, 200, {
        offer: {
          id: updated.id,
          vendorName: updated.vendorName,
          vendorEmail: updated.vendorEmail || '',
          price: Number(updated.price),
          message: updated.message || '',
          status: updated.status,
          paymentStatus: updated.paymentStatus || 'unpaid',
          stripeSessionId: updated.stripeSessionId || null,
          stripePaymentIntent: updated.stripePaymentIntent || null,
          paidAt: updated.paidAt || null,
          createdAt: updated.createdAt,
          request: serializeRequest({ ...updated.request, offers: [] }),
        },
      });
    }

    if (req.method === 'POST' && path.match(/^\/api\/vendor\/requests\/[^/]+\/decline$/)) {
      ensureLegacyFlowEnabled();
      const auth = requireJwt(req, 'vendor');
      await expireStaleRequests();
      const requestId = path.split('/')[4];
      const body = await readBody(req);
      const vendorEmail = String(auth.email || '').trim().toLowerCase();
      if (!vendorEmail) return sendJson(res, 401, { error: 'Unauthorized' });

      const request = await prisma.serviceRequest.findUnique({ where: { id: requestId } });
      if (!request) return sendJson(res, 404, { error: 'Request not found' });
      if (request.status !== 'open') return sendJson(res, 400, { error: 'Request is closed or expired' });

      const existingOffer = await prisma.vendorOffer.findFirst({
        where: {
          requestId,
          vendorEmail: { equals: vendorEmail, mode: 'insensitive' },
        },
      });

      if (existingOffer && existingOffer.paymentStatus === 'paid') {
        return sendJson(res, 400, { error: 'Paid offers cannot be declined by vendor' });
      }

      const declineMessage = normalizeOptionalString(body.message, 1200) || 'Declined by vendor';
      let offer;
      if (existingOffer) {
        offer = await prisma.vendorOffer.update({
          where: { id: existingOffer.id },
          data: {
            status: 'declined',
            message: declineMessage,
          },
        });
      } else {
        offer = await prisma.vendorOffer.create({
          data: {
            requestId,
            vendorName: normalizeOptionalString(body.vendorName, 255) || 'Vendor',
            vendorEmail,
            price: 0,
            message: declineMessage,
            status: 'declined',
            paymentStatus: 'unpaid',
          },
        });
      }

      return sendJson(res, 200, {
        declined: true,
        offer: {
          ...offer,
          price: Number(offer.price),
          message: offer.message || '',
          paymentStatus: offer.paymentStatus || 'unpaid',
          stripeSessionId: offer.stripeSessionId || null,
          stripePaymentIntent: offer.stripePaymentIntent || null,
          paidAt: offer.paidAt || null,
        },
      });
    }

    if (req.method === 'GET' && path === '/api/admin/overview') {
      await expireStaleRequests();
      const [customers, vendorApplications, openRequests, closedRequests, expiredRequests, totalOffers] = await Promise.all([
        prisma.user.count({ where: { role: 'customer' } }),
        prisma.vendorApplication.count(),
        prisma.serviceRequest.count({ where: { status: 'open' } }),
        prisma.serviceRequest.count({ where: { status: 'closed' } }),
        prisma.serviceRequest.count({ where: { status: 'expired' } }),
        prisma.vendorOffer.count(),
      ]);

      return sendJson(res, 200, {
        overview: {
          customers,
          vendorApplications,
          openRequests,
          closedRequests,
          expiredRequests,
          totalOffers,
        },
      });
    }

    if (req.method === 'GET' && path === '/api/admin/kpis') {
      const now = new Date();
      const since30d = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
      const [recentRequests, decidedOffers, completedBookings, allBookings, invoices, payoutsForDuration, reviews] = await Promise.all([
        prisma.serviceRequest.findMany({
          where: { createdAt: { gte: since30d } },
          include: { offers: { orderBy: { createdAt: 'asc' } } },
          orderBy: { createdAt: 'desc' },
          take: 1000,
        }),
        prisma.vendorOffer.findMany({
          where: { status: { in: ['accepted', 'declined', 'ignored'] }, createdAt: { gte: since30d } },
          select: { status: true },
        }),
        prisma.booking.findMany({
          where: { OR: [{ status: 'completed' }, { isCompleted: true }], createdAt: { gte: since30d } },
          select: { eventDate: true, completedAt: true },
        }),
        prisma.booking.findMany({
          where: { status: { in: ['paid', 'completed', 'accepted'] }, createdAt: { gte: since30d } },
          select: { customerId: true },
        }),
        prisma.invoice.findMany({
          where: { createdAt: { gte: since30d } },
          select: { status: true, bookingId: true, paidAt: true, amount: true },
        }),
        supportsPrismaModel('payout')
          ? prisma.payout.findMany({
              where: { createdAt: { gte: since30d } },
              select: { bookingId: true, status: true, updatedAt: true },
            })
          : Promise.resolve([]),
        prisma.review.aggregate({
          where: { createdAt: { gte: since30d } },
          _avg: { rating: true },
          _count: { _all: true },
        }),
      ]);

      let firstOfferCount = 0;
      let firstOfferMinutesTotal = 0;
      let slaCompliant = 0;
      for (const request of recentRequests) {
        const firstOffer = (request.offers || []).find((offer) => offer.vendorEmail || offer.vendorName);
        if (!firstOffer) continue;
        const minutes = Math.max(0, (new Date(firstOffer.createdAt).getTime() - new Date(request.createdAt).getTime()) / 60000);
        firstOfferCount += 1;
        firstOfferMinutesTotal += minutes;
        const offerResponseHours = Number(request.offerResponseHours || DEFAULT_RESPONSE_HOURS);
        if (minutes <= offerResponseHours * 60) slaCompliant += 1;
      }

      const decidedCount = decidedOffers.length;
      const acceptedCount = decidedOffers.filter((row) => row.status === 'accepted').length;
      const acceptanceRate = decidedCount > 0 ? acceptedCount / decidedCount : 0;

      const completedCount = completedBookings.length;
      const onTimeCompleted = completedBookings.filter((row) => {
        if (!row.completedAt) return false;
        const eventDate = new Date(row.eventDate).getTime();
        const completedAt = new Date(row.completedAt).getTime();
        return completedAt <= (eventDate + 24 * 60 * 60 * 1000);
      }).length;
      const onTimeCompletionRate = completedCount > 0 ? onTimeCompleted / completedCount : 0;

      const invoiceCount = invoices.length;
      const refundedOrFailedInvoices = invoices.filter((row) => ['refunded', 'failed'].includes(String(row.status || '').toLowerCase())).length;
      const disputeRate = invoiceCount > 0 ? refundedOrFailedInvoices / invoiceCount : 0;
      const chargebackRate = 0;

      const paidInvoicesByBooking = new Map(
        invoices
          .filter((row) => row.status === 'paid' && row.paidAt)
          .map((row) => [row.bookingId, row.paidAt]),
      );
      const paidPayouts = payoutsForDuration.filter((row) => row.status === 'paid');
      const payoutDurationsHours = paidPayouts
        .map((row) => {
          const paidAt = paidInvoicesByBooking.get(row.bookingId);
          if (!paidAt) return null;
          const diffMs = new Date(row.updatedAt).getTime() - new Date(paidAt).getTime();
          if (!Number.isFinite(diffMs) || diffMs < 0) return null;
          return diffMs / (60 * 60 * 1000);
        })
        .filter((value) => value != null);
      const payoutTimeHours = payoutDurationsHours.length
        ? payoutDurationsHours.reduce((sum, value) => sum + value, 0) / payoutDurationsHours.length
        : null;

      const bookingsPerCustomer = new Map();
      for (const booking of allBookings) {
        const customerId = String(booking.customerId || '');
        if (!customerId) continue;
        bookingsPerCustomer.set(customerId, (bookingsPerCustomer.get(customerId) || 0) + 1);
      }
      const activeCustomers = Array.from(bookingsPerCustomer.values()).filter((count) => count >= 1).length;
      const repeatCustomers = Array.from(bookingsPerCustomer.values()).filter((count) => count >= 2).length;
      const repeatBookingRate = activeCustomers > 0 ? repeatCustomers / activeCustomers : 0;

      return sendJson(res, 200, {
        window: {
          from: since30d.toISOString(),
          to: now.toISOString(),
          days: 30,
        },
        kpis: {
          requestToFirstOfferMinutes: firstOfferCount > 0 ? Math.round(firstOfferMinutesTotal / firstOfferCount) : null,
          offerAcceptanceRate: Number(acceptanceRate.toFixed(4)),
          onTimeCompletionRate: Number(onTimeCompletionRate.toFixed(4)),
          disputeRate: Number(disputeRate.toFixed(4)),
          chargebackRate: Number(chargebackRate.toFixed(4)),
          vendorResponseSlaComplianceRate: firstOfferCount > 0 ? Number((slaCompliant / firstOfferCount).toFixed(4)) : null,
          avgPayoutTimeHours: payoutTimeHours != null ? Number(payoutTimeHours.toFixed(2)) : null,
          repeatBookingRate: Number(repeatBookingRate.toFixed(4)),
          averageRating: reviews?._avg?.rating != null ? Number(Number(reviews._avg.rating).toFixed(2)) : null,
          reviewCount: Number(reviews?._count?._all || 0),
        },
      });
    }

    if (req.method === 'GET' && (path === '/api/admin/vendor-applications' || path === '/api/admin/vendors')) {
      const applications = await prisma.vendorApplication.findMany({
        orderBy: { createdAt: 'desc' },
      });
      const enriched = await Promise.all(
        applications.map(async (app) => {
          const compliance = await getVendorCompliance(app.email);
          const payoutReadiness = await getVendorPayoutReadiness(app);
          return {
            ...app,
            compliance: buildVendorActivationState(app, compliance),
            payoutReadiness,
          };
        }),
      );
      if (path === '/api/admin/vendors') {
        return sendJson(res, 200, { vendors: enriched, applications: enriched });
      }
      return sendJson(res, 200, { applications: enriched });
    }

    if (req.method === 'POST' && path.match(/^\/api\/admin\/vendors\/[^/]+\/(approve|reject|suspend)$/)) {
      const [, , , , applicationId, action] = path.split('/');
      const existing = await prisma.vendorApplication.findUnique({ where: { id: applicationId } });
      if (!existing) return sendJson(res, 404, { error: 'Vendor application not found' });

      let nextStatus = existing.status;
      if (action === 'approve') nextStatus = 'approved';
      if (action === 'reject') nextStatus = 'rejected';

      const updated = await prisma.vendorApplication.update({
        where: { id: applicationId },
        data: {
          status: nextStatus,
          reviewedAt: action === 'suspend' ? existing.reviewedAt : new Date(),
        },
      });

      await prisma.$transaction(async (tx) => {
        const fresh = await tx.vendorApplication.findUnique({ where: { id: applicationId } });
        if (!fresh) return;
        await syncVendorProfileActivationStatus(tx, fresh);
        if (action === 'suspend') {
          const identity = await ensureVendorIdentityFromApplication(tx, fresh);
          await tx.vendorProfile.update({
            where: { id: identity.vendorProfile.id },
            data: { status: 'suspended' },
          });
        }
      });

      await writeAdminAuditLog(req, `vendor_${action}`, applicationId, {
        previousStatus: existing.status,
        nextStatus: updated.status,
      });

      return sendJson(res, 200, { application: updated });
    }

    if (req.method === 'GET' && path === '/api/admin/vendor-compliance') {
      if (!supportsPrismaModel('vendorCompliance')) {
        return sendJson(res, 200, { compliances: [], note: 'vendorCompliance model is not available yet' });
      }
      const rows = await prisma.vendorCompliance.findMany({
        include: {
          vendor: {
            include: {
              user: { select: { email: true, name: true } },
            },
          },
        },
        orderBy: { updatedAt: 'desc' },
      });
      return sendJson(res, 200, {
        compliances: rows.map((row) => ({
          id: row.id,
          vendorId: row.vendorId,
          vendorEmail: row.vendor.user.email,
          vendorName: row.vendor.user.name,
          ...mapComplianceRowToPayload(row),
          createdAt: row.createdAt,
        })),
      });
    }

    if (req.method === 'GET' && path === '/api/admin/payouts') {
      if (!supportsPrismaModel('payout')) {
        return sendJson(res, 200, { payouts: [], note: 'payout model is not available yet' });
      }
      const rows = await prisma.payout.findMany({
        include: {
          vendor: {
            include: {
              user: { select: { email: true, name: true } },
            },
          },
          booking: {
            include: {
              customer: { select: { email: true, name: true } },
              invoice: { select: { id: true, status: true, stripeSessionId: true, paidAt: true } },
            },
          },
        },
        orderBy: { createdAt: 'desc' },
        take: 200,
      });

      return sendJson(res, 200, {
        payouts: rows.map((row) => ({
          id: row.id,
          bookingId: row.bookingId,
          vendorId: row.vendorId,
          vendorName: row.vendor?.user?.name || null,
          vendorEmail: row.vendor?.user?.email || null,
          customerName: row.booking?.customer?.name || null,
          customerEmail: row.booking?.customer?.email || null,
          invoiceId: row.booking?.invoice?.id || null,
          invoiceStatus: row.booking?.invoice?.status || null,
          invoiceStripeSessionId: row.booking?.invoice?.stripeSessionId || null,
          invoicePaidAt: row.booking?.invoice?.paidAt || null,
          bookingStatus: row.booking?.status || null,
          grossAmount: row.grossAmount,
          platformFee: row.platformFee,
          vendorNetAmount: row.vendorNetAmount,
          stripeTransferId: row.stripeTransferId || null,
          status: row.status,
          createdAt: row.createdAt,
          updatedAt: row.updatedAt,
        })),
      });
    }

    if (req.method === 'GET' && path === '/api/admin/ledger') {
      if (!supportsPrismaModel('ledgerEntry')) {
        return sendJson(res, 200, { entries: [], note: 'ledgerEntry model is not available yet. Run Prisma migration first.' });
      }
      const entries = await prisma.ledgerEntry.findMany({
        orderBy: { createdAt: 'desc' },
        take: 500,
      });
      return sendJson(res, 200, {
        entries: entries.map((row) => ({
          id: row.id,
          entryType: row.entryType,
          bookingId: row.bookingId || null,
          requestId: row.requestId || null,
          offerId: row.offerId || null,
          invoiceId: row.invoiceId || null,
          payoutId: row.payoutId || null,
          vendorId: row.vendorId || null,
          customerId: row.customerId || null,
          amountCents: row.amountCents,
          currency: row.currency,
          direction: row.direction || null,
          referenceType: row.referenceType || null,
          referenceId: row.referenceId || null,
          note: row.note || null,
          payload: row.payload || null,
          createdAt: row.createdAt,
        })),
      });
    }

    if (req.method === 'GET' && path === '/api/admin/payments') {
      const [invoiceCounts, payoutCounts, recentInvoices, recentPayouts] = await Promise.all([
        prisma.invoice.groupBy({
          by: ['status'],
          _count: { _all: true },
        }),
        supportsPrismaModel('payout')
          ? prisma.payout.groupBy({
              by: ['status'],
              _count: { _all: true },
            })
          : Promise.resolve([]),
        prisma.invoice.findMany({
          orderBy: { createdAt: 'desc' },
          take: 100,
          include: {
            booking: {
              include: {
                customer: { select: { email: true, name: true } },
              },
            },
          },
        }),
        supportsPrismaModel('payout')
          ? prisma.payout.findMany({
              orderBy: { createdAt: 'desc' },
              take: 100,
              include: {
                vendor: {
                  include: { user: { select: { email: true, name: true } } },
                },
                booking: true,
              },
            })
          : Promise.resolve([]),
      ]);

      return sendJson(res, 200, {
        summary: {
          invoices: Object.fromEntries(invoiceCounts.map((r) => [r.status, r._count._all])),
          payouts: Object.fromEntries((payoutCounts || []).map((r) => [r.status, r._count._all])),
        },
        invoices: recentInvoices.map((row) => ({
          id: row.id,
          bookingId: row.bookingId,
          amount: row.amount,
          status: row.status,
          stripeSessionId: row.stripeSessionId || null,
          issuedAt: row.issuedAt,
          paidAt: row.paidAt,
          failedAt: row.failedAt,
          customerEmail: row.booking?.customer?.email || null,
          customerName: row.booking?.customer?.name || null,
          createdAt: row.createdAt,
          updatedAt: row.updatedAt,
        })),
        payouts: (recentPayouts || []).map((row) => ({
          id: row.id,
          bookingId: row.bookingId,
          vendorId: row.vendorId,
          vendorEmail: row.vendor?.user?.email || null,
          vendorName: row.vendor?.user?.name || null,
          grossAmount: row.grossAmount,
          platformFee: row.platformFee,
          vendorNetAmount: row.vendorNetAmount,
          stripeTransferId: row.stripeTransferId || null,
          status: row.status,
          createdAt: row.createdAt,
          updatedAt: row.updatedAt,
        })),
      });
    }

    if (req.method === 'GET' && path.match(/^\/api\/admin\/bookings\/[^/]+\/accounting-pack$/)) {
      const bookingId = path.split('/')[4];
      const pack = await buildAdminBookingAccountingPack(bookingId, req);
      if (!pack) return sendJson(res, 404, { error: 'Booking not found' });
      return sendJson(res, 200, pack);
    }

    if (req.method === 'GET' && path.match(/^\/api\/admin\/bookings\/[^/]+\/accounting-pack\.pdf$/)) {
      const bookingId = path.split('/')[4];
      const pack = await buildAdminBookingAccountingPack(bookingId, req);
      if (!pack) return sendJson(res, 404, { error: 'Booking not found' });

      const lines = buildAccountingPackPdfLines(pack);
      const pdfBuffer = buildSimplePdfBuffer(lines);
      const corsOrigin = resolveCorsOrigin(req);
      res.writeHead(200, {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="accounting-pack-${bookingId}.pdf"`,
        'Access-Control-Allow-Origin': corsOrigin,
        'Access-Control-Allow-Methods': 'GET,POST,PATCH,OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type, Authorization, x-admin-key, x-admin-setup-key',
        Vary: 'Origin',
      });
      res.end(pdfBuffer);
      return;
    }

    if (req.method === 'POST' && path.match(/^\/api\/admin\/payouts\/[^/]+\/release$/)) {
      const payoutId = path.split('/')[4];
      if (!supportsPrismaModel('payout')) return sendJson(res, 400, { error: 'payout model is not available yet' });
      const payout = await prisma.payout.findUnique({ where: { id: payoutId } });
      if (!payout) return sendJson(res, 404, { error: 'Payout not found' });
      if (payout.status === 'paid' && payout.stripeTransferId) {
        return sendJson(res, 200, { released: false, reason: 'Payout already released' });
      }

      await retryPayoutTransfersForBooking(payout.bookingId);
      await writeAdminAuditLog(req, 'payout_release_retry', payoutId, {
        bookingId: payout.bookingId,
        vendorId: payout.vendorId,
      });

      const refreshed = await prisma.payout.findUnique({ where: { id: payoutId } });
      return sendJson(res, 200, { released: true, payout: refreshed });
    }

    if (req.method === 'GET' && path === '/api/admin/audit-logs') {
      if (!supportsPrismaModel('adminAuditLog')) {
        return sendJson(res, 200, { logs: [], note: 'adminAuditLog model is not available yet' });
      }
      const rows = await prisma.adminAuditLog.findMany({
        orderBy: { createdAt: 'desc' },
        take: 300,
      });
      return sendJson(res, 200, {
        logs: rows.map((row) => ({
          id: row.id,
          adminId: row.adminId,
          action: row.action,
          targetId: row.targetId || null,
          metaJson: row.metaJson || null,
          createdAt: row.createdAt,
        })),
      });
    }

    if (req.method === 'POST' && path === '/api/admin/vendor-compliance/backfill') {
      const result = await backfillAllLegacyVendorComplianceToDb();
      await writeAdminAuditLog(req, 'vendor_compliance_backfill', null, result);
      return sendJson(res, 200, {
        ...result,
        note: 'Legacy JSON vendor compliance backfilled into Prisma vendorCompliance table.',
      });
    }

    if (req.method === 'POST' && path.match(/^\/api\/admin\/vendor-applications\/[^/]+\/compliance\/(contract|training)\/confirm$/)) {
      const [, , , , applicationId, , field] = path.split('/');
      const vendor = await prisma.vendorApplication.findUnique({ where: { id: applicationId } });
      if (!vendor) return sendJson(res, 404, { error: 'Vendor application not found' });

      const nowIso = new Date().toISOString();
      const compliance = await updateVendorCompliance(vendor.email, (current) => ({
        ...current,
        ...(field === 'contract'
          ? {
              contractAccepted: true,
              contractAcceptedAt: current.contractAcceptedAt || nowIso,
              contractVersion: current.contractVersion || VENDOR_CONTRACT_VERSION,
              contractAcceptedByUserId: current.contractAcceptedByUserId || getAdminActorId(req),
              contractAcceptedIP: current.contractAcceptedIP || getClientIp(req),
            }
          : {
              trainingCompleted: true,
              trainingCompletedAt: current.trainingCompletedAt || nowIso,
            }),
      }));

      await prisma.$transaction(async (tx) => {
        const fresh = await tx.vendorApplication.findUnique({ where: { id: vendor.id } });
        if (!fresh) return;
        await syncVendorProfileActivationStatus(tx, fresh);
      });

      await writeAdminAuditLog(req, `vendor_${field}_confirmed`, applicationId, {
        vendorEmail: vendor.email,
        confirmedAt: nowIso,
      });

      const payoutReadiness = await getVendorPayoutReadiness(vendor);
      return sendJson(res, 200, {
        compliance: buildVendorActivationState(vendor, compliance),
        application: {
          ...vendor,
          compliance: buildVendorActivationState(vendor, compliance),
          payoutReadiness,
        },
      });
    }

    if (req.method === 'PATCH' && path.match(/^\/api\/admin\/vendor-applications\/[^/]+$/)) {
      const applicationId = path.split('/')[4];
      const body = await readBody(req);
      const status = body.status;
      const reviewNote = body.reviewNote ? String(body.reviewNote) : null;
      if (!['pending_review', 'approved', 'rejected'].includes(status)) {
        return sendJson(res, 400, { error: 'Invalid status' });
      }
      const existing = await prisma.vendorApplication.findUnique({ where: { id: applicationId } });
      if (!existing) return sendJson(res, 404, { error: 'Vendor application not found' });

      const updated = await prisma.vendorApplication.update({
        where: { id: applicationId },
        data: {
          status,
          reviewNote: status === 'pending_review' ? null : reviewNote,
          reviewedAt: status === 'pending_review' ? null : new Date(),
        },
      });

      await prisma.$transaction(async (tx) => {
        const fresh = await tx.vendorApplication.findUnique({ where: { id: applicationId } });
        if (!fresh) return;
        await syncVendorProfileActivationStatus(tx, fresh);
      });
      await writeAdminAuditLog(req, 'vendor_application_status_updated', applicationId, {
        previousStatus: existing.status,
        nextStatus: updated.status,
        reviewNote: updated.reviewNote || null,
      });

      if (status === 'approved') {
        await sendMailSafe({
          to: updated.email,
          subject: 'Vendor-Anfrage genehmigt',
          text: 'Deine Vendor-Anfrage wurde genehmigt. Du kannst jetzt dein Vendor-Dashboard voll nutzen.',
        });
      }
      if (status === 'rejected') {
        await sendMailSafe({
          to: updated.email,
          subject: 'Vendor-Anfrage abgelehnt',
          text: 'Deine Vendor-Anfrage wurde aktuell abgelehnt. Du kannst dich mit aktualisierten Informationen erneut bewerben.',
        });
      }
      const refreshedApplication = await prisma.vendorApplication.findUnique({ where: { id: applicationId } });
      const effectiveApp = refreshedApplication || updated;
      const compliance = await getVendorCompliance(effectiveApp.email);
      const payoutReadiness = await getVendorPayoutReadiness(effectiveApp);
      return sendJson(res, 200, {
        application: {
          ...effectiveApp,
          compliance: buildVendorActivationState(effectiveApp, compliance),
          payoutReadiness,
        },
      });
    }

    if (req.method === 'GET' && path === '/api/admin/requests') {
      await expireStaleRequests();
      const requests = await prisma.serviceRequest.findMany({
        include: { offers: { orderBy: { createdAt: 'desc' } } },
        orderBy: { createdAt: 'desc' },
      });
      return sendJson(res, 200, { requests: requests.map(serializeRequest) });
    }

    if (req.method === 'POST' && path === '/api/admin/services/seed') {
      const current = await prisma.serviceCatalog.count();
      if (current === 0) {
        await prisma.serviceCatalog.createMany({ data: DEFAULT_SERVICE_SEED });
      }
      const services = await prisma.serviceCatalog.findMany({ orderBy: { createdAt: 'desc' } });
      return sendJson(res, 200, { seeded: true, count: services.length, services });
    }

    if (req.method === 'POST' && path === '/api/admin/services') {
      const body = await readBody(req);
      const { name, category, basePrice } = body;
      if (!name || !category || !basePrice) return sendJson(res, 400, { error: 'Missing required fields' });
      const service = await prisma.serviceCatalog.create({
        data: {
          name,
          category,
          description: body.description || null,
          basePrice: Number(basePrice),
          isActive: body.isActive !== false,
        },
      });
      return sendJson(res, 201, { service });
    }

    if (req.method === 'POST' && path === '/api/admin/vendors/seed-demo') {
      const seeded = [];
      for (const item of DEFAULT_VENDOR_SEED) {
        const existing = await prisma.vendorApplication.findUnique({ where: { email: item.email } });
        if (existing) {
          const updated = await prisma.vendorApplication.update({
            where: { email: item.email },
            data: {
              businessName: item.businessName,
              contactName: item.contactName,
              city: item.city,
              categories: item.categories,
              status: item.status,
            },
          });
          seeded.push(updated);
        } else {
          const created = await prisma.vendorApplication.create({
            data: {
              businessName: item.businessName,
              contactName: item.contactName,
              email: item.email,
              password: 'Vendor123!',
              city: item.city,
              categories: item.categories,
              status: item.status,
            },
          });
          seeded.push(created);
        }
      }
      return sendJson(res, 200, {
        seeded: true,
        count: seeded.length,
        note: 'Demo vendor password is Vendor123! for all seeded vendors.',
        vendors: seeded,
      });
    }

    if (req.method === 'GET' && path === '/api/admin/inquiries') {
      const inquiries = await prisma.vendorInquiry.findMany({
        orderBy: { createdAt: 'desc' },
      });
      return sendJson(res, 200, { inquiries: inquiries.map(serializeVendorInquiryForApi) });
    }

    if (req.method === 'POST' && path.match(/^\/api\/admin\/inquiries\/[^/]+\/reply$/)) {
      const inquiryId = path.split('/')[4];
      const body = await readBody(req);
      const replyMessage = normalizeOptionalString(body?.replyMessage, 2000);
      if (!replyMessage) return sendJson(res, 400, { error: 'replyMessage is required' });
      const attachmentUrls = Array.isArray(body?.attachmentUrls)
        ? body.attachmentUrls
            .map((value) => normalizeOptionalString(value, 1200))
            .filter(Boolean)
            .slice(0, 8)
        : [];

      const inquiry = await prisma.vendorInquiry.findUnique({ where: { id: inquiryId } });
      if (!inquiry) return sendJson(res, 404, { error: 'Inquiry not found' });

      const replyPayload = [
        `Replied at: ${new Date().toISOString()}`,
        replyMessage,
        ...(attachmentUrls.length > 0
          ? [
              '',
              'Attachments / Links:',
              ...attachmentUrls.map((url) => `- ${url}`),
            ]
          : []),
      ].join('\n');

      const mailResult = await sendMailSafe({
        to: inquiry.vendorEmail,
        subject: `Admin reply: ${inquiry.subject}`,
        text: [
          'Hello,',
          '',
          'This is a reply from EventVenue admin regarding your inquiry:',
          `"${inquiry.subject}"`,
          '',
          replyPayload,
        ].join('\n'),
      });

      const updated = await prisma.vendorInquiry.update({
        where: { id: inquiryId },
        data: {
          status: 'answered',
          message: `${splitInquiryMessage(inquiry.message).vendorMessage}${ADMIN_REPLY_MARKER}${replyPayload}`,
        },
      });

      await writeAdminAuditLog(req, 'vendor_inquiry_replied', inquiryId, {
        vendorEmail: inquiry.vendorEmail,
        attachmentUrls,
        emailSent: mailResult.sent,
        emailError: mailResult.sent ? null : mailResult.error,
      });

      return sendJson(res, 200, {
        inquiry: serializeVendorInquiryForApi(updated),
        replied: true,
        emailSent: mailResult.sent,
        emailError: mailResult.sent ? null : mailResult.error,
      });
    }

    if (req.method === 'GET' && path === '/api/vendor/inquiries') {
      const auth = requireJwt(req, 'vendor');
      const vendorEmail = String(auth.email || '').trim();
      if (!vendorEmail) return sendJson(res, 401, { error: 'Unauthorized' });

      const inquiries = await prisma.vendorInquiry.findMany({
        where: { vendorEmail: { equals: vendorEmail, mode: 'insensitive' } },
        orderBy: { createdAt: 'desc' },
      });
      return sendJson(res, 200, { inquiries: inquiries.map(serializeVendorInquiryForApi) });
    }

    if (req.method === 'GET' && path === '/api/services-catalog') {
      const services = await prisma.serviceCatalog.findMany({
        where: { isActive: true },
        orderBy: [{ category: 'asc' }, { name: 'asc' }],
      });
      return sendJson(res, 200, { services });
    }

    if (req.method === 'GET' && path === '/api/vendor/profile') {
      const email = (url.searchParams.get('email') || '').trim();
      if (!email) return sendJson(res, 400, { error: 'email is required' });
      const vendor = await prisma.vendorApplication.findFirst({
        where: { email: { equals: email, mode: 'insensitive' } },
      });
      if (!vendor) return sendJson(res, 404, { error: 'Vendor profile not found' });
      const compliance = await getVendorCompliance(vendor.email);
      const payoutReadiness = await getVendorPayoutReadiness(vendor);
      return sendJson(res, 200, {
        vendor: {
          ...vendor,
          compliance: buildVendorActivationState(vendor, compliance),
          payoutReadiness,
        },
      });
    }

    if (req.method === 'GET' && path === '/api/vendor/posts') {
      const vendorEmail = (url.searchParams.get('vendorEmail') || '').trim();
      if (!vendorEmail) return sendJson(res, 400, { error: 'vendorEmail is required' });
      const vendor = await prisma.vendorApplication.findFirst({
        where: { email: { equals: vendorEmail, mode: 'insensitive' } },
      });
      if (!vendor) return sendJson(res, 404, { error: 'Vendor profile not found' });
      await assertVendorCanPublishOrRespond(vendor);
      const posts = await prisma.vendorPost.findMany({
        where: { vendorApplicationId: vendor.id },
        orderBy: { createdAt: 'desc' },
      });
      return sendJson(res, 200, { posts });
    }

    if (req.method === 'GET' && path === '/api/vendor/posts/public') {
      const posts = await prisma.vendorPost.findMany({
        where: {
          isActive: true,
          vendorApplication: {
            status: 'approved',
          },
        },
        include: {
          vendorApplication: {
            select: {
              businessName: true,
              city: true,
              email: true,
              status: true,
            },
          },
        },
        orderBy: { createdAt: 'desc' },
      });
      const filtered = [];
      for (const post of posts) {
        const activation = buildVendorActivationState(
          post.vendorApplication,
          await getVendorCompliance(post.vendorApplication.email),
        );
        if (activation.canPublish) filtered.push(post);
      }
      return sendJson(res, 200, {
        posts: filtered.map((post) => ({
          id: post.id,
          title: post.title,
          serviceName: post.serviceName,
          description: post.description,
          city: post.city || post.vendorApplication?.city || null,
          basePrice: post.basePrice,
          availability: post.availability,
          createdAt: post.createdAt,
          vendorName: post.vendorApplication?.businessName || 'Vendor',
        })),
      });
    }

    if (
      req.method === 'POST'
      && (path === '/api/vendor/posts' || path === '/api/vendor/services' || path === '/api/vendor/venues')
    ) {
      const body = await readBody(req);
      const vendorEmail = (body.vendorEmail || '').trim();
      if (!vendorEmail) return sendJson(res, 400, { error: 'vendorEmail is required' });
      const vendor = await prisma.vendorApplication.findFirst({
        where: { email: { equals: vendorEmail, mode: 'insensitive' } },
      });
      if (!vendor) return sendJson(res, 404, { error: 'Vendor profile not found' });
      await assertVendorCanPublishOrRespond(vendor);
      const title = body.title;
      const serviceName = body.serviceName || (path === '/api/vendor/venues' ? 'Venue' : null);
      if (!title || !serviceName) return sendJson(res, 400, { error: 'Missing required fields' });
      const post = await prisma.vendorPost.create({
        data: {
          vendorApplicationId: vendor.id,
          title,
          serviceName,
          description: body.description || null,
          city: body.city || null,
          basePrice: body.basePrice ? Number(body.basePrice) : null,
          availability: body.availability || {},
          isActive: body.isActive !== false,
        },
      });
      return sendJson(res, 201, { post });
    }

    if (
      req.method === 'PATCH'
      && (path.match(/^\/api\/vendor\/posts\/[^/]+$/) || path.match(/^\/api\/vendor\/services\/[^/]+$/) || path.match(/^\/api\/vendor\/venues\/[^/]+$/))
    ) {
      const postId = path.split('/')[4];
      const body = await readBody(req);
      const vendorEmail = (body.vendorEmail || '').trim();
      if (!vendorEmail) return sendJson(res, 400, { error: 'vendorEmail is required' });
      const vendor = await prisma.vendorApplication.findFirst({
        where: { email: { equals: vendorEmail, mode: 'insensitive' } },
      });
      if (!vendor) return sendJson(res, 404, { error: 'Vendor profile not found' });
      await assertVendorCanPublishOrRespond(vendor);
      const post = await prisma.vendorPost.findUnique({ where: { id: postId } });
      if (!post) return sendJson(res, 404, { error: 'Post not found' });
      if (post.vendorApplicationId !== vendor.id) {
        return sendJson(res, 403, { error: 'You can only edit your own posts' });
      }
      const updated = await prisma.vendorPost.update({
        where: { id: postId },
        data: {
          title: body.title ?? post.title,
          serviceName: body.serviceName ?? post.serviceName,
          description: body.description ?? post.description,
          city: body.city ?? post.city,
          basePrice: body.basePrice !== undefined ? Number(body.basePrice) : post.basePrice,
          availability: body.availability ?? post.availability,
          isActive: body.isActive ?? post.isActive,
        },
      });
      return sendJson(res, 200, { post: updated });
    }

    if (req.method === 'POST' && path === '/api/vendor/inquiries') {
      const body = await readBody(req);
      const vendorEmail = (body.vendorEmail || '').trim();
      const subject = (body.subject || '').trim();
      const message = (body.message || '').trim();
      if (!vendorEmail || !subject || !message) return sendJson(res, 400, { error: 'Missing required fields' });
      const vendor = await prisma.vendorApplication.findFirst({
        where: { email: { equals: vendorEmail, mode: 'insensitive' } },
      });
      const inquiry = await prisma.vendorInquiry.create({
        data: {
          vendorApplicationId: vendor?.id || null,
          vendorEmail,
          subject,
          message,
          status: 'open',
        },
      });
      return sendJson(res, 201, { inquiry });
    }

    if (
      req.method === 'POST'
      && (path.match(/^\/api\/requests\/[^/]+\/offers$/) || path.match(/^\/api\/requests\/[^/]+\/respond$/))
    ) {
      ensureLegacyFlowEnabled();
      const auth = requireJwt(req, 'vendor');
      await expireStaleRequests();
      const requestId = path.split('/')[3];
      const body = await readBody(req);
      const { vendorName, price } = body;
      if (!vendorName || !price || Number(price) <= 0) {
        return sendJson(res, 400, { error: 'Missing required fields' });
      }

      const request = await prisma.serviceRequest.findUnique({ where: { id: requestId } });
      if (!request) return sendJson(res, 404, { error: 'Request not found' });
      if (request.status !== 'open') return sendJson(res, 400, { error: 'Request is closed or expired' });
      if (body.vendorEmail) {
        if (String(body.vendorEmail).toLowerCase() !== String(auth.email || '').toLowerCase()) {
          return sendJson(res, 403, { error: 'vendorEmail must match authenticated vendor' });
        }
        const vendor = await prisma.vendorApplication.findFirst({
          where: { email: { equals: body.vendorEmail, mode: 'insensitive' } },
        });
        if (!vendor) return sendJson(res, 404, { error: 'Vendor account not found. Please finish vendor signup first.' });
        await assertVendorCanPublishOrRespond(vendor);
      }

      const offer = await prisma.vendorOffer.create({
        data: {
          requestId,
          vendorName,
          vendorEmail: body.vendorEmail || null,
          price: Number(price),
          message: body.message || '',
          status: 'pending',
        },
      });
      return sendJson(res, 201, {
        offer: {
          ...offer,
          price: Number(offer.price),
          message: offer.message || '',
          paymentStatus: offer.paymentStatus || 'unpaid',
          stripeSessionId: offer.stripeSessionId || null,
          stripePaymentIntent: offer.stripePaymentIntent || null,
          paidAt: offer.paidAt || null,
        },
      });
    }

    if (req.method === 'GET' && path === '/api/vendor/compliance') {
      const vendorEmail = normalizeOptionalString(url.searchParams.get('vendorEmail'), 320);
      if (!vendorEmail) return sendJson(res, 400, { error: 'vendorEmail is required' });

      const isAdmin = isAdminAuthorized(req);
      if (!isAdmin) {
        const auth = requireJwt(req, 'vendor');
        if (String(auth.email || '').toLowerCase() !== vendorEmail.toLowerCase()) {
          return sendJson(res, 403, { error: 'Forbidden for this vendorEmail' });
        }
      }

      const vendor = await getVendorApplicationByEmail(vendorEmail);
      if (!vendor) return sendJson(res, 404, { error: 'Vendor profile not found' });
      const compliance = await getVendorCompliance(vendor.email);
      const signature = await getLatestVendorContractSignature(vendor.id);
      return sendJson(res, 200, { compliance: buildVendorActivationState(vendor, compliance), signature });
    }

    if (req.method === 'GET' && path === '/api/vendor/contract/signing-status') {
      const vendorEmail = normalizeOptionalString(url.searchParams.get('vendorEmail'), 320);
      if (!vendorEmail) return sendJson(res, 400, { error: 'vendorEmail is required' });

      const isAdmin = isAdminAuthorized(req);
      if (!isAdmin) {
        const auth = requireJwt(req, 'vendor');
        if (String(auth.email || '').toLowerCase() !== vendorEmail.toLowerCase()) {
          return sendJson(res, 403, { error: 'Forbidden for this vendorEmail' });
        }
      }

      const vendor = await getVendorApplicationByEmail(vendorEmail);
      if (!vendor) return sendJson(res, 404, { error: 'Vendor profile not found' });
      const compliance = await getVendorCompliance(vendor.email);
      const signature = await getLatestVendorContractSignature(vendor.id);
      return sendJson(res, 200, {
        provider: CONTRACT_SIGNING_PROVIDER,
        compliance: buildVendorActivationState(vendor, compliance),
        signature,
      });
    }

    if (req.method === 'POST' && path === '/api/vendor/contract/signing/start') {
      const auth = requireJwt(req, 'vendor');
      const body = await readBody(req);
      const vendorEmail = normalizeOptionalString(body.vendorEmail || auth.email, 320);
      if (!vendorEmail) return sendJson(res, 400, { error: 'vendorEmail is required' });
      if (String(auth.email || '').toLowerCase() !== vendorEmail.toLowerCase()) {
        return sendJson(res, 403, { error: 'vendorEmail must match authenticated vendor' });
      }
      const vendor = await getVendorApplicationByEmail(vendorEmail);
      if (!vendor) return sendJson(res, 404, { error: 'Vendor profile not found' });
      if (!supportsPrismaModel('vendorContractSignature')) {
        return sendJson(res, 400, { error: 'vendorContractSignature model is not available yet' });
      }

      const provider = normalizeOptionalString(body.provider, 64) || CONTRACT_SIGNING_PROVIDER;
      const externalEnvelopeId = normalizeOptionalString(body.externalEnvelopeId, 191) || `${provider}_${randomUUID()}`;
      const status = normalizeContractSignatureStatus(body.status || 'sent');
      const contractVersion = normalizeOptionalString(body.contractVersion, 32) || VENDOR_CONTRACT_VERSION;
      const signingUrl = normalizeOptionalString(body.signingUrl, 1200);
      const now = new Date();
      const signedAt = status === 'completed' ? now : null;
      const declinedAt = status === 'declined' ? now : null;
      const voidedAt = status === 'voided' ? now : null;

      const signatureRow = await prisma.vendorContractSignature.create({
        data: {
          vendorApplicationId: vendor.id,
          provider,
          externalEnvelopeId,
          status,
          signingUrl,
          contractVersion,
          sentAt: now,
          signedAt,
          declinedAt,
          voidedAt,
          lastEventAt: now,
          rawPayload: body || null,
        },
      });

      let compliance = await getVendorCompliance(vendor.email);
      if (status === 'completed') {
        compliance = await updateVendorCompliance(vendor.email, (current) => ({
          ...current,
          contractAccepted: true,
          contractAcceptedAt: now.toISOString(),
          contractVersion,
          contractAcceptedByUserId: String(auth.sub || ''),
          contractAcceptedIP: getClientIp(req),
        }));
        await prisma.$transaction(async (tx) => {
          const fresh = await tx.vendorApplication.findUnique({ where: { id: vendor.id } });
          if (!fresh) return;
          await syncVendorProfileActivationStatus(tx, fresh);
        });
      }

      return sendJson(res, 200, {
        provider,
        signature: mapContractSignatureRow(signatureRow),
        compliance: buildVendorActivationState(vendor, compliance),
      });
    }

    if (req.method === 'POST' && path === '/api/vendor/contract/signing/webhook') {
      if (!CONTRACT_SIGNING_WEBHOOK_SECRET) {
        return sendJson(res, 503, { error: 'CONTRACT_SIGNING_WEBHOOK_SECRET is not configured' });
      }
      const secretHeader = req.headers['x-contract-webhook-secret'];
      const providedSecret = Array.isArray(secretHeader) ? secretHeader[0] : secretHeader;
      if (String(providedSecret || '') !== CONTRACT_SIGNING_WEBHOOK_SECRET) {
        return sendJson(res, 401, { error: 'Unauthorized webhook request' });
      }

      const body = await readBody(req);
      const provider = normalizeOptionalString(body.provider, 64) || CONTRACT_SIGNING_PROVIDER;
      const externalEnvelopeId =
        normalizeOptionalString(body.externalEnvelopeId || body.envelopeId || body.signatureRequestId, 191);
      const vendorEmail = normalizeOptionalString(body.vendorEmail || body.signerEmail || body.email, 320);
      const status = normalizeContractSignatureStatus(body.status || body.event || 'sent');
      const contractVersion = normalizeOptionalString(body.contractVersion, 32) || VENDOR_CONTRACT_VERSION;
      const signingUrl = normalizeOptionalString(body.signingUrl, 1200);
      const documentUrl = normalizeOptionalString(body.documentUrl || body.signedDocumentUrl, 1200);
      const auditTrailUrl = normalizeOptionalString(body.auditTrailUrl, 1200);
      const eventAt = normalizeOptionalString(body.signedAt || body.eventAt, 64);
      const eventDate = eventAt ? new Date(eventAt) : new Date();
      const effectiveEventDate = Number.isNaN(eventDate.getTime()) ? new Date() : eventDate;

      if (!externalEnvelopeId && !vendorEmail) {
        return sendJson(res, 400, { error: 'externalEnvelopeId or vendorEmail is required' });
      }

      let vendor = null;
      let existingSignature = null;
      if (supportsPrismaModel('vendorContractSignature') && externalEnvelopeId) {
        existingSignature = await prisma.vendorContractSignature.findFirst({
          where: { provider, externalEnvelopeId },
          include: { vendorApplication: true },
        });
        vendor = existingSignature?.vendorApplication || null;
      }
      if (!vendor && vendorEmail) {
        vendor = await getVendorApplicationByEmail(vendorEmail);
      }
      if (!vendor) return sendJson(res, 404, { error: 'Vendor profile not found for webhook payload' });

      let signature = null;
      if (supportsPrismaModel('vendorContractSignature')) {
        const updateData = {
          status,
          signingUrl,
          contractVersion,
          documentUrl,
          auditTrailUrl,
          lastEventAt: effectiveEventDate,
          rawPayload: body || null,
          ...(status === 'completed' ? { signedAt: effectiveEventDate } : {}),
          ...(status === 'declined' ? { declinedAt: effectiveEventDate } : {}),
          ...(status === 'voided' ? { voidedAt: effectiveEventDate } : {}),
        };
        if (existingSignature) {
          signature = await prisma.vendorContractSignature.update({
            where: { id: existingSignature.id },
            data: updateData,
          });
        } else {
          signature = await prisma.vendorContractSignature.create({
            data: {
              vendorApplicationId: vendor.id,
              provider,
              externalEnvelopeId,
              status,
              signingUrl,
              contractVersion,
              documentUrl,
              auditTrailUrl,
              sentAt: effectiveEventDate,
              signedAt: status === 'completed' ? effectiveEventDate : null,
              declinedAt: status === 'declined' ? effectiveEventDate : null,
              voidedAt: status === 'voided' ? effectiveEventDate : null,
              lastEventAt: effectiveEventDate,
              rawPayload: body || null,
            },
          });
        }
      }

      let compliance = await getVendorCompliance(vendor.email);
      if (status === 'completed') {
        compliance = await updateVendorCompliance(vendor.email, (current) => ({
          ...current,
          contractAccepted: true,
          contractAcceptedAt: effectiveEventDate.toISOString(),
          contractVersion,
          contractAcceptedByUserId: current.contractAcceptedByUserId || 'external-signing-provider',
          contractAcceptedIP: current.contractAcceptedIP || 'external-signing-provider',
        }));
        await prisma.$transaction(async (tx) => {
          const fresh = await tx.vendorApplication.findUnique({ where: { id: vendor.id } });
          if (!fresh) return;
          await syncVendorProfileActivationStatus(tx, fresh);
        });
      }

      return sendJson(res, 200, {
        ok: true,
        provider,
        vendorEmail: vendor.email,
        status,
        signature: signature ? mapContractSignatureRow(signature) : null,
        compliance: buildVendorActivationState(vendor, compliance),
      });
    }

    if (
      req.method === 'POST'
      && (path === '/api/vendor/compliance/contract-accept' || path === '/api/vendor/contract/accept')
    ) {
      const auth = requireJwt(req, 'vendor');
      const body = await readBody(req);
      const vendorEmail = normalizeOptionalString(body.vendorEmail || auth.email, 320);
      if (!vendorEmail) return sendJson(res, 400, { error: 'vendorEmail is required' });
      if (String(auth.email || '').toLowerCase() !== vendorEmail.toLowerCase()) {
        return sendJson(res, 403, { error: 'vendorEmail must match authenticated vendor' });
      }
      const vendor = await getVendorApplicationByEmail(vendorEmail);
      if (!vendor) return sendJson(res, 404, { error: 'Vendor profile not found' });

      const accepted = await updateVendorCompliance(vendor.email, (current) => ({
        ...current,
        contractAccepted: true,
        contractAcceptedAt: new Date().toISOString(),
        contractVersion: normalizeOptionalString(body.contractVersion, 32) || VENDOR_CONTRACT_VERSION,
        contractAcceptedByUserId: String(auth.sub || ''),
        contractAcceptedIP: getClientIp(req),
      }));

      if (supportsPrismaModel('vendorContractSignature')) {
        try {
          await prisma.vendorContractSignature.create({
            data: {
              vendorApplicationId: vendor.id,
              provider: 'manual',
              externalEnvelopeId: `manual_${randomUUID()}`,
              status: 'completed',
              contractVersion: accepted.contractVersion || VENDOR_CONTRACT_VERSION,
              sentAt: new Date(),
              signedAt: new Date(),
              lastEventAt: new Date(),
              rawPayload: { source: 'manual_contract_accept_endpoint' },
            },
          });
        } catch (error) {
          if (!isPrismaTableMissingError(error)) throw error;
        }
      }

      await prisma.$transaction(async (tx) => {
        const fresh = await tx.vendorApplication.findUnique({ where: { id: vendor.id } });
        if (!fresh) return;
        await syncVendorProfileActivationStatus(tx, fresh);
      });

      return sendJson(res, 200, { compliance: buildVendorActivationState(vendor, accepted) });
    }

    if (
      req.method === 'POST'
      && (path === '/api/vendor/compliance/training-complete' || path === '/api/vendor/training/complete')
    ) {
      requireJwt(req, 'vendor');
      return sendJson(res, 403, {
        error: 'Training completion is admin-confirmed only. Please wait for admin approval.',
      });
    }

    if (req.method === 'PATCH' && path.match(/^\/api\/requests\/[^/]+\/offers\/[^/]+$/)) {
      ensureLegacyFlowEnabled();
      const auth = requireJwt(req, 'customer', 'admin');
      await expireStaleRequests();
      const [, , , requestId, , offerId] = path.split('/');
      const body = await readBody(req);
      const status = body.status;
      const isAdmin = auth.role === 'admin' || isAdminAuthorized(req);
      if (!['accepted', 'declined', 'ignored', 'pending'].includes(status)) {
        return sendJson(res, 400, { error: 'Invalid status' });
      }

      const request = await prisma.serviceRequest.findUnique({ where: { id: requestId } });
      if (!request) return sendJson(res, 404, { error: 'Request not found' });

      if (!isAdmin) {
        const customerEmail = (body.customerEmail || '').trim().toLowerCase();
        if (!customerEmail) {
          return sendJson(res, 401, { error: 'customerEmail is required for customer offer updates' });
        }
        if (customerEmail !== String(auth.email || '').toLowerCase()) {
          return sendJson(res, 403, { error: 'Token customer mismatch' });
        }
        if (customerEmail !== request.customerEmail.toLowerCase()) {
          return sendJson(res, 403, { error: 'You can only manage offers for your own requests' });
        }
      }

      if (request.status !== 'open') {
        return sendJson(res, 400, { error: 'Request is closed or expired' });
      }

      const offer = await prisma.vendorOffer.findFirst({
        where: { id: offerId, requestId },
      });
      if (!offer) return sendJson(res, 404, { error: 'Offer not found' });

      await prisma.$transaction(async (tx) => {
        await tx.vendorOffer.update({
          where: { id: offerId },
          data: { status },
        });

        if (status === 'accepted') {
          await tx.serviceRequest.update({
            where: { id: requestId },
            data: { status: 'closed', closedAt: new Date(), closedReason: 'offer_accepted' },
          });
          await tx.vendorOffer.updateMany({
            where: { requestId, id: { not: offerId }, status: 'pending' },
            data: { status: 'ignored' },
          });
        }
      });

      const updatedOffer = await prisma.vendorOffer.findUnique({ where: { id: offerId } });
      const updatedRequest = await prisma.serviceRequest.findUnique({ where: { id: requestId } });
      if (isAdmin) {
        await writeAdminAuditLog(req, 'request_offer_status_updated', offerId, {
          requestId,
          nextStatus: status,
        });
      }

      return sendJson(res, 200, {
        offer: updatedOffer
          ? {
              ...updatedOffer,
              price: Number(updatedOffer.price),
              message: updatedOffer.message || '',
              paymentStatus: updatedOffer.paymentStatus || 'unpaid',
              stripeSessionId: updatedOffer.stripeSessionId || null,
              stripePaymentIntent: updatedOffer.stripePaymentIntent || null,
              paidAt: updatedOffer.paidAt || null,
            }
          : null,
        requestStatus: updatedRequest?.status || request.status,
      });
    }

    return notFound(res);
  } catch (error) {
    const status = Number(error?.status) || 500;
    return sendJson(res, status, { error: error?.message || 'Internal server error' });
  }
}).listen(PORT, '0.0.0.0', async () => {
  try {
    await prisma.$connect();
    console.log(`API running on http://localhost:${PORT}`);
  } catch (error) {
    console.error('Failed to connect to database:', error.message);
  }
});
