import 'dotenv/config';

const API_BASE = process.env.TEST_API_BASE_URL || 'http://localhost:4000';
const AUTH_BEARER = process.env.TEST_AUTH_BEARER || '';
const BOOKING_ID = process.env.TEST_BOOKING_ID || '';
const BOOKING_ITEM_ID = process.env.TEST_BOOKING_ITEM_ID || '';

function logStep(message) {
  process.stdout.write(`\n[check] ${message}\n`);
}

async function expectStatus(path, options, expectedStatus) {
  const res = await fetch(`${API_BASE}${path}`, options);
  const text = await res.text();
  if (res.status !== expectedStatus) {
    throw new Error(`Expected ${expectedStatus} for ${path}, got ${res.status}. Body: ${text}`);
  }
  return text ? JSON.parse(text) : {};
}

async function main() {
  logStep(`Health check on ${API_BASE}/health`);
  await expectStatus('/health', { method: 'GET' }, 200);

  logStep('Unauthorized structured-offer action should be blocked');
  await expectStatus(
    '/api/bookings/fake-booking/items/fake-item/offer',
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ priceCents: 10000, reason: 'test' }),
    },
    401,
  );

  logStep('Webhook signature validation should reject unsigned webhook');
  await expectStatus(
    '/api/payments/webhook',
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ type: 'checkout.session.completed', data: { object: {} } }),
    },
    400,
  );

  if (AUTH_BEARER && BOOKING_ID && BOOKING_ITEM_ID) {
    logStep('Run authenticated booking-thread read');
    const thread = await expectStatus(
      `/api/bookings/${encodeURIComponent(BOOKING_ID)}/thread`,
      {
        method: 'GET',
        headers: {
          Authorization: `Bearer ${AUTH_BEARER}`,
        },
      },
      200,
    );
    const version = Number(thread?.items?.[0]?.currentOfferVersion || 1);

    logStep('Check stale offerVersion reject logic');
    await expectStatus(
      `/api/bookings/${encodeURIComponent(BOOKING_ID)}/items/${encodeURIComponent(BOOKING_ITEM_ID)}/accept`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${AUTH_BEARER}`,
        },
        body: JSON.stringify({ offerVersion: Math.max(1, version - 1) }),
      },
      409,
    );

    logStep('Check checkout gate (non-accepted booking should reject with 400)');
    await expectStatus(
      `/api/bookings/${encodeURIComponent(BOOKING_ID)}/checkout`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${AUTH_BEARER}`,
        },
        body: JSON.stringify({
          customerEmail: 'placeholder@example.com',
          successUrl: 'https://example.com/success',
          cancelUrl: 'https://example.com/cancel',
        }),
      },
      400,
    );
  } else {
    logStep('Skipping deep booking checks (set TEST_AUTH_BEARER, TEST_BOOKING_ID, TEST_BOOKING_ITEM_ID)');
  }

  logStep('All checks passed.');
}

main().catch((err) => {
  console.error('\n[check] FAILED:', err.message);
  process.exit(1);
});
