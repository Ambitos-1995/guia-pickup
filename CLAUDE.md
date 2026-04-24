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

## Testing

```bash
npm test                  # Run all tests (static + e2e)
npm run test:static       # Static assertions only (Node.js test runner, no browser)
npm run test:e2e          # Playwright e2e tests (auto-starts server on :4173)
npm run test:e2e:headed   # E2e tests with visible browser
npm run test:install      # Install Playwright browsers (chromium only, run once after clone)
```

Run a single test or project:
```bash
npx playwright test --grep "test name"          # Filter by test title
npx playwright test -p desktop-chromium         # One project only
npx playwright test tests/e2e/app.spec.js       # One spec file
```

**Static tests** (`tests/static/`) use Node.js built-in `node:test` — they read source files and assert structural invariants (script load order, SW cache entries, branding, asset existence). No server needed. Two test files: `shell.test.js` (script order, IDs, SW cache completeness) and `assets.test.js` (referenced files exist on disk).

**E2E tests** (`tests/e2e/`) use Playwright with three projects: `desktop-chromium`, `mobile-chrome` (Pixel 7), and `desktop-webkit` (WebKit only runs `pwa.webkit.spec.js`). Playwright auto-launches `scripts/test-server.js` on port 4173. All Supabase API calls are intercepted by `tests/e2e/helpers/mock-api.js` — no real backend needed. Mock PINs: `1234` (employee Ismael), `4321` (employee Lucia), `5555` (employee Nora), `123456` (admin Marta).

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
supabase functions deploy kiosk-payment-receipt
supabase functions deploy kiosk-report
supabase functions deploy kiosk-pin-migrate
supabase functions deploy gdpr-retention
```

Shared utilities live in `supabase/functions/_shared/kiosk.ts` (auth, rate limiting, audit logging, CORS headers). **Any change here requires redeploying every Edge Function that imports from it** — there is no shared bundle, each function bakes in its own copy at deploy time.

All functions are deployed with `--no-verify-jwt` except `kiosk-pin-migrate` (which runs authenticated admin migrations). The Supabase CLI prints "Docker is not running" warnings during remote deploys; this is cosmetic — Docker is only needed for `supabase start` (local stack).

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

### Edge Function Secrets

Managed via `npx supabase secrets set|unset|list`. Required:

- `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_ANON_KEY`, `SUPABASE_DB_URL` — auto-provisioned.
- `KIOSK_ALLOWED_ORIGINS` (or `EDGE_ALLOWED_ORIGINS`) — comma-separated; CORS fail-closed if empty.
- `KIOSK_SESSION_SECRET` — HMAC key for session tokens. Fail-closed (no fallback). Rotating only invalidates active sessions.
- `KIOSK_PIN_LOOKUP_SECRET` — optional; falls back to `SUPABASE_SERVICE_ROLE_KEY`. **Do not set it to a new value in production**: stored `kiosk_employees.pin_lookup_hash` rows are HMAC-SHA256(secret, `${orgId}:${pin}`) bound to whatever value was active at migration time. A new value breaks login for every migrated employee (Argon2id `pin_hash` is one-way — cannot regenerate lookups without the plaintext PIN). Rotating this secret requires a coordinated PIN reset for all employees.
- `CRON_SECRET` — required by `gdpr-retention` via `X-Cron-Secret` header.

`supabase secrets list` returns SHA-256 digests, not values. The service_role JWT shown in Dashboard → Settings → API may differ from the `SUPABASE_SERVICE_ROLE_KEY` that Edge Functions actually read at runtime — do not assume they are identical.

## Architecture

### Frontend Module System
All JS files use **IIFE module pattern** (no ES modules, no bundler). Load order in `index.html` matters — dependencies must load before dependents:

```
webawesome-init.js (type="module") →
utils.js → legal-templates.js → pin-pad.js → api.js → offline-clock-queue.js
  → pin.js, schedule.js, clock.js, guia.js, payment.js, admin.js, install.js
  → signature_pad.umd.min.js → jspdf.umd.min.js → contract.js
  → app.js → sw-register.js
```

`app.js` is loaded last (before `sw-register.js`) and bootstraps everything via `App.init()`. The exact order is enforced by a static test in `tests/static/shell.test.js`.

### Two PWA Entry Points
- **`/index.html`** — main kiosk app (all screens, PIN-gated)
- **`/direct/`** — standalone shared-tablet view (`direct/direct.js`) showing the weekly schedule grid and a clock-in flow optimized for walk-up use; fully self-contained with its own CSS and JS

### Screen Navigation
`index.html` contains all screens as overlapping `<div>` containers. Navigation works by toggling CSS classes for visibility/opacity transitions. `App` module manages routing.

### Session State
`App.session` holds: `{ pin, employeeProfileId, userId, employeeCode, employeeName, photoUrl, currentStatus, role, accessToken }`. Set after PIN verification, cleared on logout. Employee idle timeout: 10 min; admin idle timeout: 5 min. The `accessToken` is a server-side session token sent as `Authorization: Bearer` on API calls that require auth.

### Auth & PIN Data Model

PINs live in `kiosk_employees` with two derived columns:
- `pin_hash` — Argon2id of the PIN (verification, one-way).
- `pin_lookup_hash` — HMAC-SHA256 of `${orgId}:${pin}` using `KIOSK_PIN_LOOKUP_SECRET` or `SUPABASE_SERVICE_ROLE_KEY`. Enables constant-time lookup by PIN without full table scan.

The plaintext `pin` column is nullable and stays `NULL` for all migrated employees; new employees are always inserted with `pin_hash` + `pin_lookup_hash` (see `kiosk-employees` handlers). The legacy plaintext fallback was removed from `resolveEmployeeByPin` once all production employees had migrated.

Sessions are server-side: rows with idle + absolute timeouts, issued on PIN verify and carried as `Authorization: Bearer` tokens (HMAC-signed using `KIOSK_SESSION_SECRET`). Offline clock replays use a separate short-lived `X-Kiosk-Clock-Token`.

### Offline Clock Queue (`js/offline-clock-queue.js`)
Clock-in/out actions are queued in IndexedDB (`pickup-tmg-offline-clock-v1`) when the network is unavailable. The queue auto-flushes after 1.5s on reconnection and retries every 15s. Queued entries use `X-Kiosk-Clock-Token` for replay auth. A banner shows pending count to the user.

### API Layer (`js/api.js`)
All API calls go through **Supabase Edge Functions** at `https://mzuvkinwebqgmnutchsv.supabase.co/functions/v1`. Every request is a `POST` with JSON body including `orgSlug`. The organization slug `'ambitos'` is the default but both `orgSlug` and `supabaseProjectUrl` can be overridden at runtime via `window.__SEUR_CONFIG__`.

### Shared PIN Pad (`js/pin-pad.js`)
`PinPad.create(config)` returns a reusable PIN capture instance wired to DOM elements (dots + keypad). Used by both `js/pin.js` and `js/contract.js`. Supports keyboard input, configurable max length, and `onChange`/`onComplete`/`onClear` callbacks.

### Contract Signing (`js/contract.js`)
Multi-step flow: summary → participant PIN → participant signature canvas → preview → admin signature canvas → preview → done. Uses `vendor/signature_pad/signature_pad.umd.min.js` for canvas-based signatures and `vendor/jspdf/jspdf.umd.min.js` for PDF generation. Legal clause content lives in `js/legal-templates.js` (versioned templates for contracts and receipts).

### Service Worker (`sw.js`)
Cache version is hardcoded (currently `pickup-tmg-v89`). **Increment the cache version number** whenever static assets change to force cache invalidation on existing clients. SW registration is in `js/sw-register.js`. The app checks for updates every 5 minutes and on visibility change; the user confirms activation with the on-screen update button.

### Web Awesome Components
UI components (dialogs, buttons, inputs, selects) come from Web Awesome, loaded from `vendor/webawesome/dist-cdn/`. Import declarations are in `js/webawesome-init.js` (the only `type="module"` script).

## Deployment

Hosted on **Vercel** as a static site (no build command). `vercel.json` sets cache headers and CSP. `sw.js`, `manifest.json`, and HTML entry points are served `no-cache`; `/vendor/`, `/icons/`, `/img/`, `/fonts/` are immutable-cached; `/js/`, `/css/`, `/direct/` use `max-age=60`.

## Key Conventions

- **Language**: All UI text is in Spanish. Keep all user-facing strings in Spanish.
- **Cognitive accessibility**: Lexend font, min 48px tap targets, high contrast, simple language.
- **No ES modules in app code**: `webawesome-init.js` is the only `type="module"` script. All other JS uses IIFE pattern with `var`. Use `var` (not `let`/`const`) in app JS to match the existing codebase style.
- **New static assets**: When adding files that should work offline, add them to `FILES_TO_CACHE` in `sw.js` and increment the cache version.
- **Idle timeouts**: Employee screens auto-logout after 10 min; admin screens after 5 min.
- **Timezone**: All backend date/time logic uses `Europe/Madrid` (`APP_TIME_ZONE` in `_shared/kiosk.ts`). The frontend displays times as received from the server.
- **Session auth**: Edge functions use server-side session tokens (not JWTs). Sessions are created on PIN verify, carry a role (`org_admin` | `respondent`), and have both idle and absolute timeouts. Clock operations also support an `X-Kiosk-Clock-Token` header for offline replay.
- **App version**: `APP_VERSION` in `js/app.js` is a human-readable release tag (e.g. `2026.03.18-r3`). Update it when shipping user-visible changes.
- **Migrations are append-only**: never edit an applied migration file. To reverse, write a new migration. If applying DDL via MCP (`mcp__supabase__apply_migration`), also write the same SQL to `supabase/migrations/{version}_name.sql` so the repo stays in sync with remote.

## Screens / Modules Reference

| Screen | Module | Purpose |
|--------|--------|---------|
| PIN entry | `js/pin.js` | Dual-mode: employee login or admin verification |
| Menu | `js/app.js` | Navigation hub, public by default |
| Clock | `js/clock.js` | Check-in / check-out with shift display |
| Schedule | `js/schedule.js` | Weekly grid, PIN-based slot assign/release |
| Guía | `js/guia.js` | Step-by-step operational flows with images |
| Payment | `js/payment.js` | Monthly payment summary + receipt signing flow |
| Admin | `js/admin.js` | Employee management, payment calculation, contracts, receipt management |
| Contract | `js/contract.js` | Participant agreement signing (dual-signature flow) |
| Direct | `direct/direct.js` | Standalone shared-tablet schedule + clock-in view |
