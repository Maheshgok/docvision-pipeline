# Netlify Deployment Guide

## Environment Variables Setup

Configure the following environment variables in Netlify Dashboard  Site settings  Build & deploy  Environment variables:

### Client-side Variables (embedded in JavaScript bundle)
These are prefixed with `VITE_` and are publicly visible:

```
VITE_FIREBASE_API_KEY=your_actual_firebase_api_key
VITE_FIREBASE_AUTH_DOMAIN=your-project.firebaseapp.com
VITE_FIREBASE_PROJECT_ID=your-project-id
VITE_FIREBASE_STORAGE_BUCKET=your-project.appspot.com
VITE_FIREBASE_MESSAGING_SENDER_ID=123456789
VITE_FIREBASE_APP_ID=1:123456789:web:your_app_id
VITE_FIREBASE_MEASUREMENT_ID=G-MEASUREMENT_ID
VITE_API_BASE_URL=https://your-api-endpoint.com
VITE_GOOGLE_CLIENT_ID=your_google_client_id
```

### Server-side Variables (for Netlify Functions only)
These are NOT prefixed with `VITE_` and remain secret:

```
GOOGLE_CLIENT_SECRET=your_google_client_secret
FIREBASE_ADMIN_PRIVATE_KEY=your_firebase_admin_private_key_json
OPENAI_API_KEY=your_openai_api_key
```

## Secrets Scanning

This project is configured to ignore client-side environment variables in Netlify's secrets scanning via the `SECRETS_SCAN_OMIT_KEYS` setting in `netlify.toml`.

## Build Configuration

- Build command: `npm run build`
- Publish directory: `dist`
- Functions directory: `netlify/functions`
- Node version: 18

## Deployment

1. Connect your GitHub repository to Netlify
2. Set the build settings (auto-detected from netlify.toml)
3. Configure environment variables as listed above
4. Deploy!

The app will be available at your Netlify domain with:
- Frontend: `/`
- API functions: `/api/*` (redirected to `/.netlify/functions/*`)
