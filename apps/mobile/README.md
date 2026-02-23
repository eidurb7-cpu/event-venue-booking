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

- Customer:
  - login
  - profile load + update
  - requests load
  - browse public vendor posts
  - select service date and see availability state
  - save planner (persistent across app restarts)
- Vendor:
  - login
  - compliance/status dashboard
  - profile edit (address, website, intro, etc.)
  - real file uploads for profile image + gallery (via backend upload URL flow)
  - create service posts with availability calendar rules:
    - single-date green/red toggle
    - bulk date-range green/red generation
  - offers inbox snapshot
  - inquiry thread to admin
- Admin:
  - login
  - overview metrics snapshot
  - vendor compliance confirmations (contract/training)

This app lives in a separate folder and does not replace the existing web app.
