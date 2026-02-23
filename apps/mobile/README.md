# EventVenue Mobile

This is a real Expo mobile client connected to the same backend used by the web app.

## Setup

1. Go to this folder:
`cd apps/mobile`

2. Install dependencies:
`npm install`

3. Start app:
`npm run start`

4. Open on device with Expo Go (Android/iOS) or run emulator:
- `npm run android`
- `npm run ios`

## Backend URL

Default API base points to production:
`https://event-venue-booking.vercel.app`

Override with env var when needed:
`EXPO_PUBLIC_API_BASE_URL=http://localhost:4000`

## Current flows

- Customer: load requests by email
- Vendor: login + dashboard snapshot (profile/compliance/posts)
- Admin: login + overview snapshot

This app lives in a separate folder and does not replace the existing web app.
