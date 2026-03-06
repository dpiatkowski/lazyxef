# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
# Development (watch mode with auto-restart)
npm run dev

# Production start
npm run start

# Run all tests
npm test

# Run a single test file
npx vitest run test/app.test.ts
```

No build step is required — the app uses Node's `--experimental-strip-types` to run TypeScript directly.

## Environment Setup

```bash
cp .env.example .env
# Fill in SELLER_NIP, SELLER_NAME, SELLER_ADDRESS, ITEM_NAME, ITEM_NET_PRICE
```

Required env vars: `SELLER_NIP`, `SELLER_NAME`, `SELLER_ADDRESS`, `ITEM_NAME`. Everything else has defaults.

Set `KSEF_SIMULATE=true` (default) to skip real HTTP calls to KSeF — simulated mode returns a deterministic `SIM-REF-*` / `SIM-DOC-*` reference based on the payload hash.

## Architecture

This is a local Polish e-invoicing (KSeF) app built with **Hono + SQLite**. It issues single-line-item invoices and submits them to the KSeF government API.

**Dependency wiring** happens in `src/server.ts` (the entry point). `createApp()` in `src/app.ts` receives fully-constructed dependencies and mounts routes — this pattern makes the app directly testable without spawning an HTTP server (Hono supports `app.request()` in tests).

**Data flow for invoice submission:**
1. Web form → `POST /invoices` → `InvoiceService.createAndSend()`
2. `InvoiceService` validates input (Zod), looks up contractor, builds the FA(3) JSON payload, saves an `invoice_attempts` row with status `sending`, then calls `KsefClient.submitInvoice()`
3. On success → status updated to `accepted`, KSeF references stored
4. On transient error (5xx / 429 / network) → status set to `retry_pending`, a `pending_jobs` row is enqueued
5. `RetryWorker` polls the DB every `RETRY_INTERVAL_MS` ms, picks up due jobs, and calls `InvoiceService.retrySend()`. Backoff: `min(300s, 30s × attempt)`; max attempts configured via `RETRY_MAX_ATTEMPTS`

**Key layers:**

| Layer | File(s) | Responsibility |
|---|---|---|
| Config | `src/config.ts` | Load & validate env vars |
| Types | `src/types.ts` | Shared domain types |
| HTTP routes | `src/app.ts` | Hono route handlers, Eta templating |
| Services | `src/services/` | Business logic (invoice, retry, contractors) |
| Repository | `src/repositories/sqlite/` | SQLite access via `better-sqlite3` |
| Templates | `src/views/*.eta` | Server-rendered HTML (Eta engine) |
| Data | `data/contractors.json` | Static contractor list (hot-reloadable via `POST /admin/reload-contractors`) |

**SQLite schema** (three tables, auto-created on startup):
- `invoice_attempts` — one row per invoice submission attempt
- `ksef_events` — audit log of every submit/accept/fail event per attempt
- `pending_jobs` — retry queue (`retry_submit` job type only)

**Contractors** are loaded from `data/contractors.json` into `ContractorsStore` (in-memory). Each must have a unique `id` and a 10-digit `nip`. Reload without restart: `POST /admin/reload-contractors`.

**Tests** use Vitest and construct the full app in-process with a temp SQLite file and `KSEF_SIMULATE=true`. No mocking framework — real classes wired together.
