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
Located in `supabase/functions/`. Deploy with:
```bash
supabase functions deploy kiosk-admin-verify
supabase functions deploy kiosk-employees
supabase functions deploy kiosk-clock
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

Migrations live in `supabase/migrations/`. Current schema: `kiosk_employees` and `kiosk_attendance` tables, both with RLS enabled (service role bypasses policies).

### JWT Disabled
All three Edge Functions have `verify_jwt = false` — the kiosk uses PIN-based auth, not tokens.

## Architecture

### Frontend Module System
All JS files use **IIFE module pattern** (no ES modules, no bundler). Load order in `index.html` matters — dependencies must load before dependents:

```
utils.js → api.js → pin.js, clock.js, schedule.js, payment.js, admin.js → app.js
```

`app.js` is loaded last and bootstraps everything via `App.init()`.

### Screen Navigation
`index.html` contains all 6 screens as overlapping `<div>` containers. Navigation works by toggling CSS classes for visibility/opacity transitions. `App` module manages routing.

### Session State
`App.session` holds: `{ pin, employeeProfileId, userId, employeeCode, employeeName, photoUrl, currentStatus, role }`. It's set after PIN verification and cleared on logout.

### API Layer (`js/api.js`)
Two backend targets:
- **Supabase Edge Functions** (`https://mzuvkinwebqgmnutchsv.supabase.co/functions/v1`): admin verify, employee verify/create/list, check-in/out
- **Legacy REST API** (`/api/v1`, dev: `http://localhost:3006/api/v1`): schedule slots and payment management — this server is external and not in this repo

### Service Worker (`sw.js`)
Cache version is hardcoded (currently v12). **Increment the cache version** whenever static assets change to force cache invalidation on existing clients. The SW auto-checks for updates every 60 seconds from the app.

### Web Awesome Components
UI components (dialogs, buttons, inputs, selects) come from Web Awesome, loaded from `vendor/webawesome/dist-cdn/`. Import declarations are in `js/webawesome-init.js`.

## Organization Slug
The org identifier `'ambitos'` is hardcoded in `js/api.js`. All API calls route through this slug.

## Screens / Modules Reference

| Screen | Module | Purpose |
|--------|--------|---------|
| PIN entry | `js/pin.js` | Dual-mode: employee login or admin verification |
| Menu | `js/app.js` | Navigation hub after PIN auth |
| Clock | `js/clock.js` | Check-in / check-out with shift display |
| Schedule | `js/schedule.js` | Weekly grid, PIN-based slot assign/release |
| Guía | `js/guia.js` | 11 step-by-step operational flows with images |
| Payment | `js/payment.js` | Read-only monthly payment summary |
| Admin | `js/admin.js` | Employee management + monthly payment calculation |
