# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

**Pickup TMG** is a PIN-based kiosk PWA for SEUR pickup point staff. It manages employee time tracking (check-in/out), weekly schedule assignment, operational guides, payment summaries, and contract signing. The UI is optimized for cognitive accessibility: large tap targets, high contrast, Lexend font, and simple flows.

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
Located in `supabase/functions/`. Deploy individually:
```bash
supabase functions deploy kiosk-admin-verify
supabase functions deploy kiosk-employees
supabase functions deploy kiosk-clock
supabase functions deploy kiosk-schedule
supabase functions deploy kiosk-payment
supabase functions deploy kiosk-contract
supabase functions deploy kiosk-report
supabase functions deploy gdpr-retention
```

Shared utilities live in `supabase/functions/_shared/kiosk.ts` (auth, rate limiting, audit logging, CORS headers).

Local development:
```bash
supabase start            # Start local Supabase stack
supabase functions serve  # Serve functions locally
```

### Database Migrations
```bash
supabase db push               # Apply migrations to remote
supabase migration new <name>  # Create new migration
```

Migrations live in `supabase/migrations/`. Core kiosk tables: `kiosk_employees`, `kiosk_attendance`, `kiosk_schedule_slots`, `kiosk_payment_months`, `kiosk_contracts` — all with RLS enabled (service role bypasses policies).

### JWT Disabled
All Edge Functions have `verify_jwt = false` — the kiosk uses PIN-based auth, not tokens.

## Architecture

### Frontend Module System
All JS files use **IIFE module pattern** (no ES modules, no bundler). Load order in `index.html` matters — dependencies must load before dependents:

```
utils.js → pin-pad.js → api.js → offline-clock-queue.js → webawesome-init.js
  → pin.js, clock.js, schedule.js, guia.js, payment.js, admin.js, contract.js, install.js
  → app.js → sw-register.js
```

`app.js` is loaded last (before `sw-register.js`) and bootstraps everything via `App.init()`.

### Two PWA Entry Points
- **`/index.html`** — main kiosk app (all screens, PIN-gated)
- **`/direct/`** — standalone shared-tablet view (`direct/direct.js`) showing the weekly schedule grid and a clock-in flow optimized for walk-up use; fully self-contained with its own CSS and JS

### Screen Navigation
`index.html` contains all screens as overlapping `<div>` containers. Navigation works by toggling CSS classes for visibility/opacity transitions. `App` module manages routing.

### Session State
`App.session` holds: `{ pin, employeeProfileId, userId, employeeCode, employeeName, photoUrl, currentStatus, role }`. Set after PIN verification, cleared on logout. Employee idle timeout: 10 min; admin idle timeout: 5 min.

### API Layer (`js/api.js`)
All API calls go through **Supabase Edge Functions** at `https://mzuvkinwebqgmnutchsv.supabase.co/functions/v1`. Every request is a `POST` with JSON body including `orgSlug`. The organization slug `'ambitos'` is hardcoded here.

### Shared PIN Pad (`js/pin-pad.js`)
`PinPad.create(config)` returns a reusable PIN capture instance wired to DOM elements (dots + keypad). Used by both `js/pin.js` and `js/contract.js`. Supports keyboard input, configurable max length, and `onChange`/`onComplete`/`onClear` callbacks.

### Contract Signing (`js/contract.js`)
Multi-step flow: summary → participant PIN → participant signature canvas → preview → admin signature canvas → preview → done. Uses `vendor/signature_pad/signature_pad.umd.min.js` for canvas-based signatures.

### Service Worker (`sw.js`)
Cache version is hardcoded (currently `pickup-tmg-v75`). **Increment the cache version number** whenever static assets change to force cache invalidation on existing clients. SW registration is in `js/sw-register.js`. The app checks for updates every 5 minutes and on visibility change; the user confirms activation with the on-screen update button.

### Web Awesome Components
UI components (dialogs, buttons, inputs, selects) come from Web Awesome, loaded from `vendor/webawesome/dist-cdn/`. Import declarations are in `js/webawesome-init.js` (the only `type="module"` script).

## Deployment

Hosted on **Vercel** as a static site (no build command). `vercel.json` sets cache headers and CSP. `sw.js`, `manifest.json`, and HTML entry points are served `no-cache`; `/vendor/`, `/icons/`, `/img/`, `/fonts/` are immutable-cached; `/js/`, `/css/`, `/direct/` use `max-age=60`.

## Key Conventions

- **Language**: All UI text is in Spanish. Keep all user-facing strings in Spanish.
- **Cognitive accessibility**: Lexend font, min 48px tap targets, high contrast, simple language.
- **No ES modules in app code**: `webawesome-init.js` is the only `type="module"` script. All other JS uses IIFE pattern with `var`.
- **New static assets**: When adding files that should work offline, add them to `FILES_TO_CACHE` in `sw.js` and increment the cache version.
- **Idle timeouts**: Employee screens auto-logout after 10 min; admin screens after 5 min.

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
| Contract | `js/contract.js` | Participant agreement signing (dual-signature flow) |
| Direct | `direct/direct.js` | Standalone shared-tablet schedule + clock-in view |
