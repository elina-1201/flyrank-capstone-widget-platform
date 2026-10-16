# Build Log

## 2026-09-29 — Initial backend wiring (validation, TypeORM owner, Supabase)

**Where AI helped**
- Integrated a global `ValidationPipe` (`whitelist`, `forbidNonWhitelisted`, `transform`) plus a `ClassSerializerInterceptor` for response shaping; validation failures return DESIGN.md's `{ error: { code: "VALIDATION_FAILED", ... } }` envelope.
- Added the `Tenant` TypeORM entity (the "owner" — DESIGN.md's `tenants` table) with `OwnerModule` / `OwnerService` / `OwnerController` and a validated `POST /api/v1/auth/register` route.
- Wired TypeORM (Postgres via `DATABASE_URL`, `autoLoadEntities`, dev `synchronize`) and a global `SupabaseModule` / `SupabaseService` exposing anon and service-role clients from `SUPABASE_URL` / `SUPABASE_ANON_KEY` / `SUPABASE_SERVICE_ROLE_KEY`.
- Added `.env.example` (`.env` is gitignored); user fills in Supabase keys themselves.

## 2026-09-29 — Rename Tenant→Owner and extract DatabaseModule

**What the human changed**
- Renamed the `Tenant` entity to `Owner` (file `tenant.entity.ts` → `owner.entity.ts`, table `tenants` → `owners`) and updated `OwnerService` / `OwnerModule` / `OwnerController` to match, so the whole `owner/` feature uses one name.
- Extracted the TypeORM `forRootAsync` wiring out of `AppModule` into a dedicated `DatabaseModule` (`src/database/database.module.ts`) and imported it by name in `AppModule`.

## 2026-10-03 — Drop Supabase (auth will be local Postgres + self-issued JWT)

**Where AI helped**
- Removed the unused `SupabaseModule` / `SupabaseService` (`src/supabase/`), the `SupabaseModule` import from `AppModule`, the `@supabase/supabase-js` dependency (re-locked `pnpm-lock.yaml`), and the `SUPABASE_*` variables from `.env.example`. Auth moves fully to local Postgres with backend-issued JWTs.

## 2026-10-03 — Local JWT auth (register/login + bearer guard)

**Where AI helped**
- Added `AuthModule` (`AuthService`, `AuthController`, `LoginOwnerDto`, `JwtAuthGuard`, `@CurrentOwner()`) that issues JWTs via `@nestjs/jwt` using `JWT_SECRET` / `JWT_EXPIRES_IN`. `POST /api/v1/auth/register` now returns `{ owner, token }` and `POST /api/v1/auth/login` returns `{ token }` (`401 INVALID_CREDENTIALS` on mismatch).
- Moved the register route from `OwnerController` into `AuthController` and removed `OwnerController`. Added `OwnerService.findByEmail` and a constant-time `verifyPassword` (scrypt + `timingSafeEqual`).

**Where AI was wrong**
- First attempt typed `JWT_EXPIRES_IN` as a plain `string` for `signOptions.expiresIn`, which fails `@nestjs/jwt`'s `number | StringValue` type; fixed by casting via `JwtSignOptions['expiresIn']`.

**What the human changed**
- Renamed `OwnerService.register` to `OwnerService.create` (now takes a pre-hashed `passwordHash`) and moved `hashPassword` / `verifyPassword` from `OwnerService` into `AuthService`, so credential crypto lives with the auth workflow and `OwnerService` stays pure persistence.

## 2026-10-05 — Root API index + health check

**Where AI helped**
- Refactored `GET /` from `Hello World!` to return `{ name: "Embedded widget platform", version: "1.0", endpoints: [...] }`, listing the routes that actually exist.
- Added `GET /health` which pings Postgres (`SELECT 1` via TypeORM's `DataSource`) and returns `{ status: "ok", db: "ok" }`, or `503 DB_UNAVAILABLE` when the database is unreachable.
- Added an "Keep the API index current" rule to `AGENTS.md` (bump `APP_VERSION` / update `ENDPOINTS` after major updates) and updated the controller spec for the new methods.

## 2026-10-05 — Widgets (admin) CRUD

**Where AI helped**
- Added the `Widget` entity (`widgets` table — `public_id` nanoid UNIQUE, `type` CHECK, `fields`/`display_options` jsonb, `owner_id` FK → `owners.id`) with `WidgetModule` / `WidgetService` / `WidgetController`.
- Implemented owner-scoped CRUD behind `JwtAuthGuard` + `@CurrentOwner()`: `POST /api/v1/widgets` (create + embed snippet), `GET /api/v1/widgets`, and `GET` / `PATCH` / `DELETE /api/v1/widgets/:id` — all owner-scoped via a shared `getOwned` helper that returns `404 WIDGET_NOT_FOUND` so non-owned widgets don't leak existence.
- Added `nanoid@^3` (v3, not ESM-only v5, to fit the CommonJS build) and `PUBLIC_BASE_URL` for the snippet origin (relative `/widget.js` fallback until the public embed section serves it).
- Updated the root API index and checked off the section in PLAN.md (also corrected bullet-1 `tenant_id` → `owner_id` to match DESIGN.md).

**What the human changed**
- `UpdateWidgetDto` → `PartialType(CreateWidgetDto)` via `@nestjs/mapped-types` (new dependency) instead of a hand-written all-optional DTO.
- `WidgetService.update()` → `this.widgets.merge(widget, dto)` instead of explicit per-field guards.

## 2026-10-06 — Public embed flow (config + versioned bundle + scoped CORS)

**Where AI helped**
- Added `PublicModule` / `PublicController` with `GET /api/v1/public/widgets/:publicId/config` (`Cache-Control: public, max-age=60`, `404 WIDGET_NOT_FOUND`) and `GET /widget.v1.js` (`Cache-Control: immutable`, `application/javascript`).
- `WidgetService` gained `findByPublicId` (public-id lookup) and the embed snippet now points at `/widget.v1.js?id=…` (versioned).
- The bundle renders fields/title/button into the script's parent div, POSTs to `/api/v1/public/submissions` with a provisional honeypot + `crypto.randomUUID()` idempotency key, and escapes all rendered values.
- CORS is scoped (not global): `cors` middleware on `/api/v1/public` and `/widget.v1.js` only; admin routes stay same-origin. Added `cors` + `@types/cors` as direct deps.

## 2026-10-06 — Versioned bundle served from files (not a hardcoded route)

**Where AI helped**
- Moved the bundle out of a TS constant into `public/widget.v1.js` and serve the `public/` dir statically via `useStaticAssets` (`Cache-Control: public, max-age=31536000, immutable`).
- Bundle CORS now matches `/^\/widget\.v\d+\.js$/` instead of the hardcoded `/widget.v1.js`; adding a version means adding a `widget.vN.js` file with no route code change.
- Snippet src reads `WIDGET_BUNDLE_VERSION` (default `v1`, added to `.env.example`) so new widgets embed the configured version while old snippets keep serving their original file.
- Removed `PublicController.bundle()` and deleted `src/public/widget-bundle.ts`.

## 2026-10-06 — Submissions (public) — store flow, rate limit, geo enrich

**Where AI helped**
- Added the `Submission` entity (`submissions` table: `idempotency_key` uuid UNIQUE, `payload` jsonb, `ip_address` inet, `user_agent`/`country_code`/`region`/`city`/`geo_provider`, `submitted_at`) and `SubmissionsModule`.
- Implemented `POST /api/v1/public/submissions` end-to-end: `CreateSubmissionDto` → payload size guard (`413`) → widget lookup (`404`) → honeypot drop → Zod validation against `widget.fields` (`400`) → `RateLimitService` (`429`) → spam heuristic → `GeoService` → idempotent store (`23505` returns the existing row) → `201`.
- Added `zod`; `RateLimitService` (in-memory fixed-window: 10/min per IP, 100/min per widget, periodic sweep) and `GeoService` (ip-api.com → ipapi.co fallback, short timeout, failures leave geo NULL).
- Updated the root API index (`POST /api/v1/public/submissions`, `APP_VERSION` → 1.2) and removed the "provisional field names" comment from `widget.v1.js`.

**Where AI was wrong**
- Used NestJS's non-existent `TooManyRequestsException`; fixed to `new HttpException({ error }, HttpStatus.TOO_MANY_REQUESTS)`.
- Used Zod v4's non-existent `issue.received`; fixed to `issue.input` (with `too_small` covering empty strings).

**What the human changed**
- Switched payload validation from the hand-written imperative check to a dynamic **Zod** schema built per-widget from `widget.fields` (`z.string().min(1)` for required fields, `z.string().optional()` otherwise); unknown keys are stripped by `z.object`'s default mode.

## 2026-10-07 — SubmissionEvent outbox (entity + transactional enqueue)

**Where AI helped**
- Added the `SubmissionEvent` entity (`submission_events`): bigint identity `id`, `submission_id` FK (indexed), `type`/`status` literal unions, `payload` jsonb, `attempts`, `next_attempt_at`, `last_error`, `created_at`, and a poll index on `(status, next_attempt_at)`; registered it in `SubmissionsModule`.
- Injected `DataSource` into `SubmissionsService` and wrapped the submission insert + event insert in ONE transaction (duplicate `idempotencyKey` rolls back → no duplicate event). `buildSubmissionEvents` enqueues a `confirmation_email` event when the widget has an `email` field; `webhook` is an UPPER-CASE placeholder pending a webhook URL config.

**Where AI was wrong**
- First pass followed PLAN.md's stale spec (uuid id, `widget_id`/`owner_id`, `processing`/`dead` statuses, `available_at`) and then dropped `payload` to match DESIGN.md; the human restored `payload` plus the poll index.
- Logged to BUILDLOG before the bulletpoint was complete; the human asked to hold it until now.

**What the human changed**
- Pinned the schema to DESIGN.md (bigint identity, `submission_id` only, `pending`/`sent`/`failed`, `next_attempt_at`) then overrode it on two points: `payload` jsonb is genuinely required and the `(status, next_attempt_at)` poll index must exist.

## 2026-10-08 — Outbox worker (cron + retry/backoff + mailpit notifier)

**Where AI helped**
- Added `nodemailer` (v10) + `@nestjs/schedule` (v12) and `ScheduleModule.forRoot()` to `AppModule` so `@Cron` works.
- Defined the `Notifier` interface + `NOTIFIER` injection token, and `MailpitNotifier` (nodemailer → `SMTP_HOST`/`SMTP_PORT`, `from` = `SMTP_FROM`, plain SMTP for Mailpit).
- Added a `mailpit` service to `docker-compose.yml` (SMTP 1025, UI 8025, loopback-bound) and `SMTP_HOST`/`SMTP_PORT`/`SMTP_FROM` to `.env.example`.
- Created `OutboxWorker` (`@Cron` every 10s): claims `pending` events with `FOR UPDATE SKIP LOCKED` in one transaction, dispatches via `Notifier`, marks `sent` on success; on throw: `attempts++`, `last_error`, exponential backoff on `next_attempt_at` (10s base, 5min cap), `failed` after 5.
- Registered `OutboxWorker` + `{ provide: NOTIFIER, useClass: MailpitNotifier }` in `SubmissionsModule`.

**Where AI was wrong**
- Claimed `@types/nodemailer` was needed; nodemailer v10 ships its own `.d.ts`, so no extra package.
- `Notifier` had to be imported with `import type` (TS1272 under `isolatedModules` + `emitDecoratorMetadata`).

**What the human changed**
- Corrected the `@types/nodemailer` mistake (package never installed).

## 2026-10-13 — Schema as migrations (replace `synchronize`)

**Where AI helped**
- Added `src/database/data-source.ts` (loads `.env` itself via `dotenv/config`, lists the four entities, `migrations` glob for both `ts-node` and `dist`) and `typeorm` / `migration:generate` / `migration:run` / `migration:revert` scripts; installed `dotenv` as a dev dep.
- Generated `Init1791887088265` against an empty schema and verified it contains every PLAN.md-mandated item (unique keys, `widgets.type` CHECK, all three CASCADE FKs + indexes, `submissions.ip_address` inet, `submission_events.id` bigint identity).
- Switched `DatabaseModule` to `synchronize: false` + `migrationsRun: true`, so `pnpm start:dev` still builds the schema on boot (verified from a wiped schema); confirmed `migration:run` / `revert` round-trip and that migrations compile into `dist/`.
- Documented the workflow in README and checked off the PLAN.md section.

**Where AI was wrong**
- Initially assumed the `typeorm` `^1.1.1` dependency range was "bogus" per the PLAN.md preflight note; it resolves fine and ships the CLI, so no pin was needed.


## 2026-10-13 — Dashboard (paginated submissions + summary)

**Where AI helped**
- Added `DashboardModule` (`DashboardController` / `DashboardService` / `ListSubmissionsQueryDto`) behind `JwtAuthGuard` + `@CurrentOwner()`.
- `GET /api/v1/widgets/:id/submissions?page=&perPage=` — owner-scoped (reuses `WidgetService.findOne` so a non-owned widget 404s), `findAndCount` ordered by `submittedAt DESC`, returns `{ data, page, perPage, total }` with the DESIGN.md field shape (`ip`, `countryCode`, `city`, `geoProvider`, `submittedAt`).
- `GET /api/v1/dashboard/summary` — one `Promise.all` of four owner-scoped aggregate queries (totals, byWidget, byDay via `date_trunc('day')`, byCountry) joined through `widgets.owner_id`.
- Wired `DashboardModule` into `AppModule`, bumped `APP_VERSION` → 1.3 and added both routes to the root API index.

## 2026-10-14 — Verification & evidence (e2e + unit test plan)

**Where AI helped**
- Verified the existing `test/widget-delivery.e2e-spec.ts` (config cache headers, versioned bundle, embed snippet) and checked off its three PLAN.md bullets.
- Created `test/submissions.e2e-spec.ts` (12 tests): CORS preflight + `Allow-Origin` on `POST`; valid submission linked to the right widget/tenant and visible via the dashboard; validation/error cases (missing field, wrong type, extra field, malformed JSON, unknown widget, oversized → `413`, never `500`); rate-limit burst → `429` then a different IP still succeeds; honeypot filled → dropped / empty → stored; duplicate `idempotency_key` → one row, no duplicate event.
- Created `test/enrichment.e2e-spec.ts` (3 tests) with a deterministic `fetch` stub: provider A down → B enriches; both down → stored without geo, still `2xx`; notifier throws → submission still stored (drives the real `OutboxWorker`).
- Created `test/dashboard.e2e-spec.ts` — inserts submissions directly so geo/timestamps are controlled, then asserts totals/byWidget/byDay/byCountry and tenant isolation.
- Extended `test/utils/test-app.ts` with `realOutboxWorker` + `configure` options so a test can drive the worker and override providers.
- Added `trust proxy` support to `configure-app.ts` (new `TRUST_PROXY` env var, documented in `.env.example`, enabled in `test/setup-e2e.ts`) so `req.ip` reflects the real client behind a reverse proxy — otherwise per-IP rate limiting would bucket every visitor together.

**Where AI was wrong**
- The `outbox.worker.spec.ts` unit suite failed to load because `@nestjs/schedule` (and then `@nestjs/typeorm`) ship as ESM, which the CommonJS unit jest config cannot `require`. First tried mocking `@nestjs/schedule` alone, which only moved the error to `@nestjs/typeorm`; the real fix was adding `NODE_OPTIONS=--experimental-vm-modules` to the `test` / `test:watch` scripts (matching `test:e2e`).
- Ran the full e2e suite in parallel (jest default) and saw 16 failures; the suites share one database and `truncateAll` wipes tables mid-run for other workers. Confirmed it is a pre-existing infra issue (passes serially, 38/38), not caused by these changes — flagged for a separate fix (e.g. `maxWorkers: 1`).

## 2026-10-14 — Documentation pack (README, capstone.yaml, EVIDENCE, LICENSE, seed)

**Where AI helped**
- Rewrote `README.md`: Mermaid architecture diagram, layering table, the ordered submission pipeline, exact run + seed steps, the full API reference, the Trade-offs section (moved here from PLAN.md), and a limitations note.
- Added `src/database/seed.ts` + a `pnpm seed` script — idempotent demo data (one owner `demo@example.com` / `password123`, one signup-form widget) that prints the embed snippet. Verified it runs and re-runs cleanly.
- Created `capstone.yaml` (`run` / `seed` / `test` / `base_url` / probes / demo credentials) and `EVIDENCE.md` (one proof per Section 6 checkbox: test names + results, plus live `curl` transcripts for the six acceptance probes).
- Added `LICENSE` (MIT) and set `"license": "MIT"` in `package.json`; filled safe local placeholders into `.env.example` (`DATABASE_URL`, `JWT_SECRET`, `PUBLIC_BASE_URL`).
- Captured live probe evidence against the running server: cross-origin `201` with `Access-Control-Allow-Origin`, malformed → `400`, oversized → `413`, burst → `429` then `/health` still `200`, honeypot → `201` with no row, duplicate key → one row, outbox events `sent` + Mailpit caught 20 messages.

## 2026-10-14 — One-command Docker run (Dockerfile + api service)

**Where AI helped**
- Added a multi-stage `Dockerfile` (build stage compiles TS; runtime stage installs prod deps and copies `dist/` + `public/`) and a `.dockerignore`.
- Added an `api` service to `docker-compose.yml` with `env_file: .env` and overrides for the two host-specific values (`DATABASE_URL` → `db:5432`, `SMTP_HOST` → `mailpit`), plus a Postgres healthcheck and `depends_on` so the API waits for the DB. `docker compose up` now boots Postgres + Mailpit + API in one command.
- Added a `seed:prod` script (`node dist/database/seed.js`) so seeding works in the prod-only runtime image; documented `docker compose run --rm api pnpm seed:prod`.
- Updated README (one-command Docker path first, local dev second), `capstone.yaml` (`run: docker compose up`), and `EVIDENCE.md` (one-command proof).
- Verified live: `docker compose up` → all three containers healthy, `/health` → `{"status":"ok","db":"ok"}`, `seed:prod` idempotent, and a cross-origin submission stored + emailed via Mailpit inside the container network.

**Where AI was wrong**
- The first image build failed with `ERR_PNPM_IGNORED_BUILDS`: corepack pulled pnpm 12, which errors on ignored build scripts. Fixed by pinning `"packageManager": "pnpm@10.27.0"` to match local.
- `seed:prod` then failed with `Cannot find module 'dotenv/config'` — `dotenv` was a devDependency, absent from the prod image. Moved it to `dependencies` and re-locked.

**What the human changed**
- Chose the full scope (Dockerfile + api service), `env_file` with service-name overrides, and the `seed:prod` approach over keeping ts-node in the runtime image.

## 2026-10-15 — Acceptance probes on the live system (Probes 1–6) + two fixes

**Where AI helped**
- Ran all six Section 13 acceptance probes against the booted Docker stack (Postgres + Mailpit + API) and recorded the transcripts in `EVIDENCE.md`; checked off the remaining PLAN.md bullets.
- Fixed an **outbox hang**: Probe 5 (notifier down) showed the worker's transaction stuck `idle in transaction` — it dispatched *inside* its DB transaction and `MailpitNotifier` had no socket timeout, so an unreachable SMTP host hung forever and the retry/backoff path never ran. The worker now claims in a short transaction (`next_attempt_at` bump as claim marker), dispatches **outside** it with a `DISPATCH_TIMEOUT_MS` ceiling, and finalizes per event; the notifier sets `connectionTimeout`/`greetingTimeout`/`socketTimeout`. Added a regression test (a notifier that never settles) and verified live: events go `pending → attempts 1..4 → failed`, no `idle in transaction`, and recovery works once Mailpit returns.
- Fixed an **envelope gap**: DESIGN.md requires `{ error: { code, message } }` on every non-2xx, but a body `body-parser` rejected before any handler ran returned Nest's raw `{ statusCode, message, error }`. Added `src/common/api-error.filter.ts` (catch-all extending `BaseExceptionFilter`) that delegates already-enveloped exceptions and reshapes the rest; malformed JSON is now `400 { error: { code: "BAD_REQUEST", … } }`.

**Where AI was wrong**
- First attempt at the envelope fix caught only `SyntaxError`, and the second only matched a `type` field — neither fired, because `body-parser`'s error reaches Nest already wrapped in a `BadRequestException`. Diagnosed by logging the exception class in the filter, then generalised to any un-enveloped `HttpException`.
- Forgot to pass the HTTP adapter to the catch-all `BaseExceptionFilter`, which turned every delegated `4xx` into a `500` until corrected.
- Probe 4's "provider A down → B answers" leg could not be run live: `ipapi.co` rate-limits this shared egress IP. Verified the fallback with the deterministic mock in `test/enrichment.e2e-spec.ts` instead, and used `X-Forwarded-For` (via a temporary `TRUST_PROXY=1` instance) to prove the live enrich and graceful-degradation paths.

## 2026-10-15 — Customer site in-repo, Supabase skills removed, testing fixes planned

**Where AI helped**
- Added `customer-site/index.html`, so the "customer website" lives in the repo instead of as a sibling file outside it. Plain HTML, the widget loaded by one `<script>` tag, form visible without scrolling (copy left, widget column right). The page accepts `?id=<publicId>` to target any widget and defaults to the id `pnpm seed` creates; a fallback card stays in place if the API is unreachable. Verified live from a second origin (`python -m http.server 5500 --directory customer-site`): the form rendered, a real submit returned "Thank you!", and the row appeared in `submissions` (geo NULL — the request arrived from the Docker gateway's private IP, which is the intended graceful-degradation path).
- Removed `.agents/skills/supabase/` and `.agents/skills/supabase-postgres-best-practices/` — both sourced from `supabase/agent-skills` and unused since auth moved to local Postgres — and emptied `skills-lock.json`. No Supabase reference remains outside git history and the historical notes in `BUILDLOG.md` / `PLAN.md` / the README trade-off table.

## 2026-10-16 — Submission readiness (deterministic e2e, test DB provisioning, runnable probes)

**Where AI helped**
- `test:e2e` now ships `--runInBand` (`package.json`), so the shipped suite is serial by default; the README hedge is gone. Re-verified from a clean volume: 6 suites / 45 tests pass, and the exact `capstone.yaml` `test:` chain also passes.
- Added `db-init/01-create-test-db.sql`, mounted into the `db` service — the first boot of the Postgres volume creates `embedded_widget_test`, so the test command works on a clean machine with no manual setup. README documents the reset path; `capstone.yaml`'s `test:` now provisions everything itself (`pnpm install --frozen-lockfile && docker compose up -d --wait db && pnpm test:e2e`).
- `capstone.yaml` probes now have concrete inputs: the demo widget gets fixed ids in `seed.ts` (`demoWidget01` / `00000000-0000-4000-8000-000000000001`), the submission probe sends a real body with a fixed idempotency key (safe to re-run — never a second row), and a note explains the 10/min per-IP rate limit so a stray `429` is not misread as a failed probe.
- `customer-site/index.html` default id updated to the fixed `demoWidget01`, so the shipped demo page works out of the box after seeding.
- `EVIDENCE.md` refreshed: clean-slate reproduction steps, fresh serial test summaries, the shipped `test:` transcript, and the different-origin proof now points at `customer-site/index.html` (`python3 -m http.server 5500 --directory customer-site` → cross-origin config with CORS headers → browser submit visible in the dashboard). Also added a note on re-running the live probes with distinct clients (`X-Forwarded-For` + `TRUST_PROXY=1`).
- Verified live end to end: `docker compose down -v` → boot → e2e passes → seed → all four shipped probes answer (health `200`, config `200`, submission `201` + idempotent replay, dashboard `200`) → browser submit lands in the dashboard → outbox delivered both emails to Mailpit.
