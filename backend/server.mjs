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
const PORT = Number(process.env.API_PORT || 4000);
const ALLOWED_ORIGIN = process.env.ALLOWED_ORIGIN || 'http://localhost:5173';
const ADMIN_DASHBOARD_KEY = process.env.ADMIN_DASHBOARD_KEY || 'change-me-admin-key';
const ADMIN_SETUP_KEY = process.env.ADMIN_SETUP_KEY || 'change-me-setup-key';
const JWT_SECRET = process.env.JWT_SECRET || 'change-me-jwt-secret';
const ADMIN_TOKEN_TTL = process.env.ADMIN_TOKEN_TTL || '12h';
const STRIPE_SECRET_KEY = process.env.STRIPE_SECRET_KEY || '';
const STRIPE_WEBHOOK_SECRET = process.env.STRIPE_WEBHOOK_SECRET || '';
const STRIPE_PLATFORM_COMMISSION_PERCENT = Number(process.env.STRIPE_PLATFORM_COMMISSION_PERCENT || 15);
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
const DEFAULT_RESPONSE_HOURS = 48;
const MAX_RESPONSE_HOURS = 168;
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

    if (req.method === 'POST' && path === '/api/payments/webhook') {
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

    if (req.method === 'POST' && path === '/api/auth/google/vendor/verify') {
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
        role: 'customer',
        user: { id: customer.id, name: customer.name, email: customer.email },
      });
    }

    if (req.method === 'POST' && path === '/api/auth/google/vendor/login') {
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

      return sendJson(res, 200, {
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

    if (req.method === 'POST' && path === '/api/auth/signup/customer') {
      return sendJson(res, 400, { error: 'Customer signup is Google-only. Please use Google sign-in.' });
    }

    if (req.method === 'POST' && path === '/api/auth/signup/vendor') {
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

    if (req.method === 'POST' && path === '/api/requests') {
      const body = await readBody(req);
      const { customerName, customerEmail, selectedServices, budget } = body;
      if (!customerName || !customerEmail || !Array.isArray(selectedServices) || selectedServices.length === 0 || !budget) {
        return sendJson(res, 400, { error: 'Missing required fields' });
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
      await expireStaleRequests();
      const requests = await prisma.serviceRequest.findMany({
        where: { status: 'open' },
        include: { offers: { orderBy: { createdAt: 'desc' } } },
        orderBy: { createdAt: 'desc' },
      });
      return sendJson(res, 200, { requests: requests.map(serializeRequest) });
    }

    if (req.method === 'GET' && path === '/api/requests') {
      await expireStaleRequests();
      const email = (url.searchParams.get('customerEmail') || '').trim();
      const requests = await prisma.serviceRequest.findMany({
        where: email ? { customerEmail: { equals: email, mode: 'insensitive' } } : undefined,
        include: { offers: { orderBy: { createdAt: 'desc' } } },
        orderBy: { createdAt: 'desc' },
      });
      return sendJson(res, 200, { requests: requests.map(serializeRequest) });
    }

    if (req.method === 'GET' && path === '/api/vendor/offers') {
      await expireStaleRequests();
      const vendorEmail = (url.searchParams.get('vendorEmail') || '').trim();
      if (!vendorEmail) return sendJson(res, 400, { error: 'vendorEmail is required' });

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
      await expireStaleRequests();
      const [, , , requestId, , offerId] = path.split('/');
      const body = await readBody(req);
      const status = body.status;
      const isAdmin = isAdminAuthorized(req);
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
    return sendJson(res, 500, { error: error.message || 'Internal server error' });
  }
}).listen(PORT, async () => {
  try {
    await prisma.$connect();
    console.log(`API running on http://localhost:${PORT}`);
  } catch (error) {
    console.error('Failed to connect to database:', error.message);
  }
});
