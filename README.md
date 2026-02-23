
# Event Venue Booking Website

This is a code bundle for Event Venue Booking Website. The original project is available at https://www.figma.com/design/ElcUGn8alvziMwonRDrFOM/Event-Venue-Booking-Website.

## Run frontend + backend

1. Install dependencies:
`npm i`

2. Create `.env` in project root and add:
`DATABASE_URL="your_neon_connection_string"`

3. Run Prisma migration once:
`npm run prisma:migrate`

4. Start backend API (Terminal 1):
`npm run dev:api`

5. Start frontend (Terminal 2):
`npm run dev`

Frontend runs on `http://localhost:5173`.
Backend runs on `http://localhost:4000`.

## Mobile app (Expo)

A real mobile app scaffold is available at `apps/mobile` using the same backend/API.

1. `cd apps/mobile`
2. `npm install`
3. `npm run start`

Optional API override for local backend:
`EXPO_PUBLIC_API_BASE_URL=http://localhost:4000`

## Optional environment variables

- `VITE_API_BASE_URL` (frontend), default: `http://localhost:4000`
- `API_PORT` (backend), default: `4000`
- `ALLOWED_ORIGIN` (backend CORS), default: `http://localhost:5173`
- `ADMIN_DASHBOARD_KEY` (legacy fallback; admin now uses JWT login)
- `ADMIN_SETUP_KEY` (one-time admin bootstrap endpoint)
- `JWT_SECRET` (admin JWT signing secret)
- `STRIPE_SECRET_KEY` (Stripe server key)
- `STRIPE_WEBHOOK_SECRET` (Stripe webhook signature key)
- `STRIPE_PLATFORM_COMMISSION_PERCENT` (platform fee percentage for Stripe Connect destination charges)
- `AUTH_GOOGLE_ID` (Google OAuth client id for backend token verification)
- `VITE_GOOGLE_CLIENT_ID` (Google client id exposed to frontend for vendor sign-in)
- `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_BUCKET_NAME`, `R2_PUBLIC_BASE_URL` (Cloudflare R2 upload)
- `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, `SMTP_FROM`, `ADMIN_NOTIFY_EMAIL` (vendor application email notifications)
- `CONTRACT_SIGNING_PROVIDER` (label for external e-sign provider, default: `external`)
- `CONTRACT_SIGNING_WEBHOOK_SECRET` (required for `/api/vendor/contract/signing/webhook`)

## Admin dashboard

1. Set `ADMIN_SETUP_KEY` and `JWT_SECRET` in `.env`
2. Start API + frontend
3. Open `http://localhost:5173/admin`
4. If no admin exists, create one using:
`POST /api/admin/bootstrap` with header `x-admin-setup-key: <ADMIN_SETUP_KEY>`
5. Login with admin email/password in `/admin`
6. In dashboard, use `Demo Vendors seeden` to add test approved/pending vendors.

## Stripe checkout

- Customer can click "Mit Stripe bezahlen" on accepted offers in customer portfolio.
- Backend endpoint used: `POST /api/payments/checkout-session`
- Webhook endpoint available: `POST /api/payments/webhook`

## Google auth + R2

- Vendor signup supports Google verification:
`POST /api/auth/google/vendor/verify`
- Vendor login via Google endpoint:
`POST /api/auth/google/vendor/login`
- Vendor document upload uses R2 presigned URL:
`POST /api/uploads/vendor-document-url`
  
