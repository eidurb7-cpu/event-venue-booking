import 'dotenv/config';
import { createServer } from 'node:http';
import { randomUUID } from 'node:crypto';
import { PrismaClient } from '@prisma/client';
import jwt from 'jsonwebtoken';
import Stripe from 'stripe';
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import nodemailer from 'nodemailer';

const prisma = new PrismaClient();
const PORT = Number(process.env.PORT || process.env.API_PORT || 4000);
const ALLOWED_ORIGIN = process.env.ALLOWED_ORIGIN || 'http://localhost:5173';
const ADMIN_DASHBOARD_KEY = process.env.ADMIN_DASHBOARD_KEY || '';
const ADMIN_SETUP_KEY = process.env.ADMIN_SETUP_KEY || '';
const JWT_SECRET = process.env.JWT_SECRET || '';
const ADMIN_TOKEN_TTL = process.env.ADMIN_TOKEN_TTL || '12h';
const USER_TOKEN_TTL = process.env.USER_TOKEN_TTL || '30d';
const STRIPE_SECRET_KEY = process.env.STRIPE_SECRET_KEY || '';
const STRIPE_WEBHOOK_SECRET = process.env.STRIPE_WEBHOOK_SECRET || '';
const STRIPE_PLATFORM_COMMISSION_PERCENT = Number(process.env.STRIPE_PLATFORM_COMMISSION_PERCENT || 15);
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
  res.writeHead(status, {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': ALLOWED_ORIGIN,
    'Access-Control-Allow-Methods': 'GET,POST,PATCH,OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization, x-admin-key, x-admin-setup-key',
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
  if (req.method === 'OPTIONS') {
    res.writeHead(204, {
      'Access-Control-Allow-Origin': ALLOWED_ORIGIN,
      'Access-Control-Allow-Methods': 'GET,POST,PATCH,OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization, x-admin-key, x-admin-setup-key',
    });
    res.end();
    return true;
  }
  return false;
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

async function getVendorApplicationByEmail(email) {
  return prisma.vendorApplication.findFirst({
    where: { email: { equals: String(email || '').trim(), mode: 'insensitive' } },
  });
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
    user = await tx.user.create({
      data: {
        name: application.businessName,
        email: application.email,
        password: application.password || `vendor_${randomUUID()}`,
        googleSub: application.googleSub || null,
        role: 'vendor',
      },
    });
  } else if (!user.googleSub && application.googleSub) {
    user = await tx.user.update({
      where: { id: user.id },
      data: { googleSub: application.googleSub },
    });
  }

  const vendorProfile = await tx.vendorProfile.upsert({
    where: { vendorApplicationId: application.id },
    update: {
      userId: user.id,
      status: mapVendorApplicationStatusToProfileStatus(application.status),
      category: pickPrimaryCategory(application.categories),
      description: application.businessIntro || undefined,
    },
    create: {
      userId: user.id,
      vendorApplicationId: application.id,
      status: mapVendorApplicationStatusToProfileStatus(application.status),
      category: pickPrimaryCategory(application.categories),
      description: application.businessIntro || undefined,
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

async function sendMailSafe({ to, subject, text, html }) {
  if (!mailTransporter || !SMTP_FROM || !to) return;
  try {
    await mailTransporter.sendMail({
      from: SMTP_FROM,
      to,
      subject,
      text,
      html,
    });
  } catch {
    // Keep API resilient when email provider is unavailable.
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

    if (req.method === 'POST' && path === '/api/payments/webhook') {
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

      // Placeholder for future payment status persistence.
      if (event.type === 'checkout.session.completed') {
        const session = event.data.object;
        const requestId = session.metadata?.requestId;
        const offerId = session.metadata?.offerId;
        const bookingId = session.metadata?.bookingId;
        const invoiceId = session.metadata?.invoiceId;
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
        }
        if (bookingId) {
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
            } else {
              await tx.invoice.updateMany({
                where: { bookingId },
                data: {
                  status: 'paid',
                  paidAt: new Date(),
                  stripeSessionId: session.id || null,
                },
              });
            }
            const booking = await tx.booking.update({
              where: { id: bookingId },
              data: {
                status: 'paid',
                isCompleted: false,
              },
            });
            await bookBookingAvailability(tx, booking);
          });
        }
        return sendJson(res, 200, { received: true, event: event.type });
      }
      if (event.type === 'checkout.session.expired') {
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

    if (req.method === 'POST' && (path === '/api/stripe/checkout' || path === '/api/cart/checkout-session')) {
      if (enforceRateLimit(req, res, 'payment')) return;
      if (!stripe) {
        return sendJson(res, 400, { error: 'Stripe is not configured' });
      }

      const body = await readBody(req);
      const cart = body?.cart || {};
      const venue = cart?.venue || null;
      const services = Array.isArray(cart?.services) ? cart.services : [];
      const successUrl = normalizeOptionalString(body?.successUrl, 500) || `${FRONTEND_BASE_URL}/checkout/success`;
      const cancelUrl = normalizeOptionalString(body?.cancelUrl, 500) || `${FRONTEND_BASE_URL}/cart`;

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
        success_url: successUrl,
        cancel_url: cancelUrl,
        line_items: lineItems,
        metadata: {
          source: 'web_cart',
          venueId: String(venue.id),
          services: JSON.stringify(services.map((s) => s?.id).filter(Boolean)).slice(0, 500),
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
      return sendJson(res, 200, {
        connected: Boolean(vendor.stripeAccountId),
        stripeAccountId: vendor.stripeAccountId,
        chargesEnabled: Boolean(account.charges_enabled),
        payoutsEnabled: Boolean(account.payouts_enabled),
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
        customer = await prisma.user.create({
          data: {
            name: profile.name || profile.email.split('@')[0],
            email: profile.email,
            password: `google_${randomUUID()}`,
            googleSub: profile.sub,
            role: 'customer',
          },
        });
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

      const { user } = await prisma.$transaction(async (tx) => ensureVendorIdentityFromApplication(tx, vendor));
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

      const existing = await prisma.user.findUnique({ where: { email } });
      if (existing && existing.role === 'admin') {
        return sendJson(res, 409, { error: 'Admin user already exists for this email' });
      }
      if (existing && existing.role !== 'admin') {
        return sendJson(res, 409, { error: 'Email already used by non-admin user' });
      }

      const adminUser = await prisma.user.create({
        data: { name, email, password, role: 'admin' },
      });
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

    if (req.method === 'POST' && path === '/api/auth/signup/vendor') {
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
        return sendJson(res, 409, { error: 'Vendor application already exists for this email' });
      }

      if (body.googleSub) {
        const existingGoogle = await prisma.vendorApplication.findFirst({
          where: { googleSub: body.googleSub },
        });
        if (existingGoogle) {
          return sendJson(res, 409, { error: 'Vendor application already exists for this Google account' });
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

    if (req.method === 'POST' && path === '/api/marketplace/bookings/request') {
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
          data: { totalPrice: runningTotal },
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

        return {
          booking: {
            id: booking.id,
            status: booking.status,
            eventDate: booking.eventDate,
            totalPrice: booking.totalPrice,
            finalPrice: booking.finalPrice,
            invoice: booking.invoice,
          },
          items,
        };
      });

      return sendJson(res, 200, payload);
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

        const finalTotalCents = booking.items.reduce(
          (sum, item) => sum + Number(item.finalPriceCents || item.latestPriceCents || 0),
          0,
        );
        if (finalTotalCents <= 0) throw httpError(400, 'Final total must be greater than zero');

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
          },
        });

        await tx.invoice.update({
          where: { id: invoice.id },
          data: { stripeSessionId: session.id },
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
        if (app.status !== 'approved') throw httpError(403, 'Vendor is not approved');

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
      await expireStaleRequests();
      const requests = await prisma.serviceRequest.findMany({
        where: { status: 'open' },
        include: { offers: { orderBy: { createdAt: 'desc' } } },
        orderBy: { createdAt: 'desc' },
      });
      return sendJson(res, 200, { requests: requests.map(serializeRequest) });
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

    if (req.method === 'GET' && path === '/api/admin/vendor-applications') {
      const applications = await prisma.vendorApplication.findMany({
        orderBy: { createdAt: 'desc' },
      });
      return sendJson(res, 200, { applications });
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
        const { vendorProfile } = await ensureVendorIdentityFromApplication(tx, fresh);
        if (status === 'approved') {
          await tx.vendorProfile.update({
            where: { id: vendorProfile.id },
            data: { status: 'active' },
          });
        }
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
      return sendJson(res, 200, { application: updated });
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
      return sendJson(res, 200, { inquiries });
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
      return sendJson(res, 200, { vendor });
    }

    if (req.method === 'GET' && path === '/api/vendor/posts') {
      const vendorEmail = (url.searchParams.get('vendorEmail') || '').trim();
      if (!vendorEmail) return sendJson(res, 400, { error: 'vendorEmail is required' });
      const vendor = await prisma.vendorApplication.findFirst({
        where: { email: { equals: vendorEmail, mode: 'insensitive' } },
      });
      if (!vendor) return sendJson(res, 404, { error: 'Vendor profile not found' });
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
            },
          },
        },
        orderBy: { createdAt: 'desc' },
      });
      return sendJson(res, 200, {
        posts: posts.map((post) => ({
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

    if (req.method === 'POST' && path === '/api/vendor/posts') {
      const body = await readBody(req);
      const vendorEmail = (body.vendorEmail || '').trim();
      if (!vendorEmail) return sendJson(res, 400, { error: 'vendorEmail is required' });
      const vendor = await prisma.vendorApplication.findFirst({
        where: { email: { equals: vendorEmail, mode: 'insensitive' } },
      });
      if (!vendor) return sendJson(res, 404, { error: 'Vendor profile not found' });
      if (vendor.status !== 'approved') {
        return sendJson(res, 403, { error: `Vendor account is ${vendor.status}. Admin approval required.` });
      }
      const { title, serviceName } = body;
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

    if (req.method === 'PATCH' && path.match(/^\/api\/vendor\/posts\/[^/]+$/)) {
      const postId = path.split('/')[4];
      const body = await readBody(req);
      const vendorEmail = (body.vendorEmail || '').trim();
      if (!vendorEmail) return sendJson(res, 400, { error: 'vendorEmail is required' });
      const vendor = await prisma.vendorApplication.findFirst({
        where: { email: { equals: vendorEmail, mode: 'insensitive' } },
      });
      if (!vendor) return sendJson(res, 404, { error: 'Vendor profile not found' });
      if (vendor.status !== 'approved') {
        return sendJson(res, 403, { error: `Vendor account is ${vendor.status}. Admin approval required.` });
      }
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

    if (req.method === 'POST' && path.match(/^\/api\/requests\/[^/]+\/offers$/)) {
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
        if (vendor.status !== 'approved') {
          return sendJson(res, 403, {
            error: `Dein Vendor-Konto ist ${vendor.status}. Bitte warte auf Admin-Freigabe.`,
          });
        }
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
