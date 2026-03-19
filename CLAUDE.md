# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

**Pickup TMG** is a PIN-based kiosk PWA for SEUR pickup point staff. It manages employee time tracking (check-in/out), weekly schedule assignment, operational guides, and payment summaries. The UI is optimized for cognitive accessibility: large tap targets, high contrast, Lexend font, and simple flows.

## No Build Step

This is a **vanilla JavaScript PWA** with no bundler, no npm, and no build process. To develop, serve the project root with any static file server:

```bash
# Example using Python
python -m http.server 8080

# Example using Node.js (if available)
npx serve .
```

No compilation, transpilation, or install step required.

## Backend: Supabase

### Edge Functions (Deno/TypeScript)
Located in `supabase/functions/`. Five functions, deploy individually:
```bash
supabase functions deploy kiosk-admin-verify
supabase functions deploy kiosk-employees
supabase functions deploy kiosk-clock
supabase functions deploy kiosk-schedule
supabase functions deploy kiosk-payment
```

Local development:
```bash
supabase start          # Start local Supabase stack
supabase functions serve  # Serve functions locally
```

### Database Migrations
```bash
supabase db push        # Apply migrations to remote
supabase migration new <name>  # Create new migration
```

Migrations live in `supabase/migrations/`. Current tables: `kiosk_employees`, `kiosk_attendance`, `kiosk_schedule_slots`, `kiosk_payment_months` — all with RLS enabled (service role bypasses policies).

### JWT Disabled
All Edge Functions have `verify_jwt = false` — the kiosk uses PIN-based auth, not tokens.

## Architecture

### Frontend Module System
All JS files use **IIFE module pattern** (no ES modules, no bundler). Load order in `index.html` matters — dependencies must load before dependents:

```
utils.js → api.js → offline-clock-queue.js → pin.js, clock.js, schedule.js, guia.js, payment.js, admin.js, install.js → app.js
```

`app.js` is loaded last and bootstraps everything via `App.init()`.

### Screen Navigation
`index.html` contains all screens as overlapping `<div>` containers. Navigation works by toggling CSS classes for visibility/opacity transitions. `App` module manages routing.

### Session State
`App.session` holds: `{ pin, employeeProfileId, userId, employeeCode, employeeName, photoUrl, currentStatus, role }`. It's set after PIN verification and cleared on logout.

### API Layer (`js/api.js`)
All API calls go through **Supabase Edge Functions** at `https://mzuvkinwebqgmnutchsv.supabase.co/functions/v1`. Every request is a `POST` with JSON body including `orgSlug`. Functions: `kiosk-admin-verify`, `kiosk-employees`, `kiosk-clock`, `kiosk-schedule`, `kiosk-payment`.

### Service Worker (`sw.js`)
Cache version is hardcoded (currently `pickup-tmg-v69`). **Increment the cache version number** whenever static assets change to force cache invalidation on existing clients. The SW uses cache-first for static assets and network-first for API/Supabase calls. The app checks for SW updates every 5 minutes and on visibility change, and the user confirms activation with the on-screen update button.

### Web Awesome Components
UI components (dialogs, buttons, inputs, selects) come from Web Awesome, loaded from `vendor/webawesome/dist-cdn/`. Import declarations are in `js/webawesome-init.js`.

## Deployment

Hosted on **Vercel** as a static site (no build command). Configuration in `vercel.json` sets cache headers and security headers. The `sw.js` and `manifest.json` are served with `no-cache`; vendor/icons/images are immutable-cached.

## Key Conventions

- **Organization slug**: `'ambitos'` is hardcoded in `js/api.js`. All API calls include it.
- **Language**: All UI text is in Spanish. Keep all user-facing strings in Spanish.
- **Cognitive accessibility**: The UI targets low-tech-literacy users — use Lexend font, large tap targets (min 48px), high contrast, simple language. Avoid jargon.
- **No ES modules in app code**: `webawesome-init.js` is the only `type="module"` script (for Web Awesome imports). All other JS uses IIFE pattern with `var`.
- **New static assets**: When adding files that should work offline, add them to `FILES_TO_CACHE` in `sw.js` and increment the cache version.

## Screens / Modules Reference

| Screen | Module | Purpose |
|--------|--------|---------|
| PIN entry | `js/pin.js` | Dual-mode: employee login or admin verification |
| Menu | `js/app.js` | Navigation hub, public by default |
| Clock | `js/clock.js` | Check-in / check-out with shift display |
| Schedule | `js/schedule.js` | Weekly grid, PIN-based slot assign/release |
| Guía | `js/guia.js` | Step-by-step operational flows with images |
| Payment | `js/payment.js` | Read-only monthly payment summary |
| Admin | `js/admin.js` | Employee management + monthly payment calculation |
