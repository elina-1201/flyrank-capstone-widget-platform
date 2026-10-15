# Implementation plan

Source of truth: [`DESIGN.md`](./DESIGN.md). Check off items as they land.

Legend: `[x]` done · `[ ]` to do.

## Foundation

- [x] NestJS scaffold + `ConfigModule` + `DatabaseModule` (TypeORM/Postgres via `DATABASE_URL`) — previous commit
- [x] Global `ValidationPipe` + `ClassSerializerInterceptor` with DESIGN.md `{ error: { code, message } }` envelope — previous commit

## Auth refactor — drop Supabase, self-host auth on local Postgres

Auth is self-hosted: the backend issues JWTs and stores `password_hash` in the
local Postgres `owners` table. No Supabase Auth.

- [x] Remove `src/supabase/` (`SupabaseModule` / `SupabaseService`) and the `SupabaseModule` import from `AppModule`
- [x] Remove `@supabase/supabase-js` from `package.json` (re-lock `pnpm-lock.yaml`)
- [x] Remove `SUPABASE_*` vars from `.env.example`

## Owners & auth (local Postgres + self-issued JWT)

- [x] `Owner` entity (`owners` table) + `POST /api/v1/auth/register` (validation, scrypt hash, silent no-op on duplicate email — anti-enumeration, no `409`) — previous commit
- [x] Add `JWT_SECRET` + `JWT_EXPIRES_IN` to `.env.example`
- [x] Create `AuthModule` in `src/auth/` with `JwtModule.registerAsync` reading `JWT_SECRET` / `JWT_EXPIRES_IN`
- [x] `AuthService.register` — hash password, delegate to `OwnerService.create`, return `{ status: "created" }` (anti-enumeration: identical response for existing emails)
- [x] `POST /api/v1/auth/login` — `LoginOwnerDto`, verify scrypt hash, return `{ token }` (`401 INVALID_CREDENTIALS` on mismatch)
- [x] Bearer JWT guard + `@CurrentOwner()` decorator + `401 UNAUTHORIZED` envelope for admin/dashboard routes

## Widgets (admin)

- [x] `Widget` entity (`widgets` table) — `public_id` (nanoid), `type` CHECK, `fields`/`display_options` jsonb, `owner_id` FK
- [x] `POST /api/v1/widgets` — create + return embed snippet `<script src="…/widget.js?id=<publicId>">`
- [x] `GET /api/v1/widgets` — list owner's widgets
- [x] `GET /api/v1/widgets/:id` — read one (tenant-scoped, `404 WIDGET_NOT_FOUND` on others')
- [x] `PATCH /api/v1/widgets/:id` — update one
- [x] `DELETE /api/v1/widgets/:id` — delete one

## Public embed flow

- [x] CORS enabled for public routes (+ `OPTIONS` preflight) — scoped to `/api/v1/public/*` and `/widget.v<version>.js`
- [x] `GET /api/v1/public/widgets/:publicId/config` — config JSON, short `max-age`
- [x] `GET /widget.v<version>.js` — versioned bundle (static file under `public/`; add a file to ship a new version, old versions keep serving)

## Submissions (public)

- [x] `Submission` entity (`submissions` table) — `idempotency_key` UNIQUE, `payload` jsonb, geo columns, `submitted_at`
- [x] `POST /api/v1/public/submissions` — validate payload against `widget.fields` → honeypot drop → rate limit → spam check → geo enrich → store → `201`
- [x] Rate limiting (per IP / per widget, ephemeral TTL store)
- [x] Geo enrichment via ip-api.com / ipapi.co with fallback

## Side effects (outbox + worker)

Flow reference: [`../BACKGROUND-JOB.md`](../BACKGROUND-JOB.md). Work top to bottom, one box at a time.

- [x] `SubmissionEvent` entity (`submission_events` outbox) — enqueue `confirmation_email` / `webhook` on store
  - [x] Create `src/submissions/submission-event.entity.ts` — `id` (bigint identity), `submission_id` (indexed), `type` (`confirmation_email` | `webhook`), `status` (`pending`/`sent`/`failed`), `payload` jsonb, `attempts` int, `next_attempt_at` timestamptz, `last_error` text, `created_at`; index on `(status, next_attempt_at)`
  - [x] Register entity in `SubmissionsModule` — `TypeOrmModule.forFeature([Submission, SubmissionEvent])`
  - [x] Inject `DataSource` into `SubmissionsService`; wrap submission insert + event insert in ONE transaction (atomicity; duplicate `idempotencyKey` → rollback → no duplicate event)
- [x] Worker — process outbox with retry/backoff + failure alert, never blocking the submission response
  - [x] Add `nodemailer` + `@nestjs/schedule`; add `ScheduleModule.forRoot()` to `AppModule`
  - [x] Define `Notifier` interface + `MailpitNotifier` (nodemailer SMTP → `SMTP_HOST`/`SMTP_PORT`)
  - [x] Add `mailpit` service to `docker-compose.yml` (SMTP 1025, UI 8025) + `SMTP_HOST`/`SMTP_PORT`/`SMTP_FROM` to `.env.example`
  - [x] Create `OutboxWorker` (`@Cron` every ~10s): claim `pending` + `next_attempt_at <= now()` with `FOR UPDATE SKIP LOCKED` → `notifier.notify(event)` → `sent`; on throw: `attempts++`, set `last_error`, backoff `next_attempt_at`, `failed` after N
  - [x] Register `OutboxWorker` + `Notifier` in `SubmissionsModule`

## Schema as migrations (replace `synchronize`)

Shared req #4 wants "schema as migrations". Today `DatabaseModule` uses `synchronize`
(dev auto-syncs, prod has no schema path at all). Replace it with versioned TypeORM
migrations so the schema is created/evolved deliberately and `run:` stays one command.

- [x] Preflight: verify `typeorm` resolves (pin `^0.3.20` if the `^1.1.1` range is bogus) + `pnpm add -D dotenv`
- [x] Add CLI data source `src/database/data-source.ts` (runs outside Nest, so it loads `.env` itself):
  - `import 'reflect-metadata'; import 'dotenv/config';`
  - `entities: [Owner, Widget, Submission, SubmissionEvent]`
  - `migrations: [join(__dirname, 'migrations', '*{.ts,.js}')]` — works under both `ts-node` and compiled `dist`
  - `url: process.env.DATABASE_URL`, `synchronize: false`
- [x] Add scripts to `package.json`:
  - `"typeorm": "typeorm-ts-node-commonjs -d src/database/data-source.ts"`
  - `"migration:generate"`, `"migration:run"`, `"migration:revert"` → wrap the `typeorm` script
- [x] Generate the initial migration against an EMPTY schema (else the diff is a no-op):
  - `docker compose down -v && docker compose up -d` — or `psql "$DATABASE_URL" -c 'DROP SCHEMA public CASCADE; CREATE SCHEMA public;'`
  - `pnpm typeorm migration:generate src/database/migrations/Init`
- [x] Review the generated migration — it MUST include: `owners.email` UNIQUE · `widgets.public_id` UNIQUE · `widgets.type` CHECK `IN ('signup_form','cta','popover')` · `widgets.owner_id` FK→owners CASCADE + index · `submissions.idempotency_key` UNIQUE · `submissions (widget_id, submitted_at)` index · `submissions.widget_id` FK→widgets CASCADE · `submissions.ip_address` inet · `submission_events.id` BIGINT identity · `submission_events (status, next_attempt_at)` index · `submission_events.submission_id` FK→submissions CASCADE + index. Missing item → fix the entity, regenerate, don't hand-edit SQL.
- [x] Switch `DatabaseModule` off `synchronize`:
  - `synchronize: false`, `migrations: [join(__dirname, 'migrations', '*{.ts,.js}')]`, `migrationsRun: true` (auto-apply pending migrations on boot)
- [x] Apply + verify: `pnpm migration:run` → `pnpm start:dev` → `\d submissions`, `\d submission_events`, `SELECT * FROM migrations;`
- [x] Docs: README states "schema applies on boot via `migrationsRun`; manage with `pnpm migration:run` / `revert`" · `capstone.yaml` `run:` just boots (schema auto-applies), `seed:` = demo data (NOT migrations)

## Dashboard (admin)

- [x] `GET /api/v1/widgets/:id/submissions` — paginated, tenant-scoped
- [x] `GET /api/v1/dashboard/summary` — aggregate stats (totals, byWidget, byDay, byCountry)

## Verification & evidence — automated test plan

Each bullet = one test case to implement. `EVIDENCE.md` records the **test name + output**
per Section 6 checkbox. Negative/failure cases are first-class — missing auth, malformed
input, oversized payloads, provider-down, notifier-throws. Do not test only happy paths.

### `test/auth.e2e-spec.ts`

- [x] register: valid → `201 { status: "created" }`; duplicate email → **same** `201 { status: "created" }` (anti-enumeration, no `409`) and no second row created; invalid body → `400`
- [x] login: valid → `200 { token }`; wrong password → `401 INVALID_CREDENTIALS`; unknown email → `401` (same response, anti-enumeration)
- [x] guard: no `Authorization` → `401`; malformed token → `401`; expired token → `401`; wrong scheme (`Basic …`) → `401`; all return the error envelope, never `500`

### `test/widgets.e2e-spec.ts`

- [x] CRUD happy path: create → `201` + embed snippet; list; get; patch; delete
- [x] create invalid `type` → `400`; missing required fields → `400`; unknown id → `404`
- [x] **tenant isolation**: A `GET`/`PATCH`/`DELETE` B's widget → `404 WIDGET_NOT_FOUND`; A's list never includes B's

### `test/widget-delivery.e2e-spec.ts`

- [x] config: `200`, small payload, `Cache-Control: max-age=…`; unknown `publicId` → `404`; CORS header present
- [x] versioned bundle: `/widget.v1.js` served with long cache; old version still served after a new one ships
- [x] embed snippet: response contains `<script src="…/widget.v<version>.js?id=<publicId>">`; two widgets → two distinct `publicId`s

### `test/submissions.e2e-spec.ts`

- [x] CORS preflight: `OPTIONS` → correct `Allow-Origin`/`-Methods`/`-Headers`; `POST` carries `Allow-Origin`
- [x] valid submission → `201`, row linked to correct `widget_id` + tenant, visible via dashboard
- [x] missing required field → `400`; wrong type → `400`; extra/unknown field rejected; malformed JSON → `400`; unknown widget → `404`; **oversized → `413`**; never `500`
- [x] rate limit: burst → `429`s, then a normal request still succeeds
- [x] honeypot filled → dropped/rejected; empty → accepted
- [x] idempotency: duplicate `idempotency_key` → single row, no duplicate event

### `test/enrichment.e2e-spec.ts`

- [x] provider A down → B answers → enriched (deterministic mock)
- [x] both down → stored without geo, still `2xx`
- [x] notifier throws → submission still succeeds + stored

### `test/dashboard.e2e-spec.ts`

- [x] summary aggregates (totals, byWidget, byDay, byCountry); tenant-scoped — A never sees B's rows

### `test/outbox.worker.spec.ts` (unit)

- [x] claim `pending` + due → `sent`; on throw → `attempts++`, backoff, `failed` after N

### Documentation

- [x] `README.md` — architecture diagram, exact run + seed steps, API docs, limitations note.
- [x] `capstone.yaml` — `run:`, `seed:`, `test:`, `base_url:`, probe endpoints.
- [x] `EVIDENCE.md` — one pasted proof per Section 6 checkbox.
- [x] `BUILDLOG.md` — AI-usage log (honest).
- [x] `.env.example` — every env var, safe placeholders.
- [x] `LICENSE` (MIT) + `"license"` set in `package.json`.

### Shared requirements (Section 13) — verified by inspection, not code tests

- [x] **1 · Layered architecture** — data / logic / HTTP separated (entities · services · controllers).
- [x] **2 · Validation at the boundary** — bad input → clean `4xx`, never `500` (covered above).
- [x] **3 · ≥1 background job** — outbox worker processes events off the request path, with retries + failure alert.
- [x] **4 · Real persistence** — schema as migrations, right indexes, isolated tenants.
- [x] **5 · Idempotency** — duplicate `idempotency_key` → single row, no duplicate event.
- [x] **6 · Secrets clean** — `.env` git-ignored, `.env.example` committed, secrets never logged.
- [x] **7 · Cost tracked (if AI used)** — per-call attribution + budget guard, or an explicit note that no paid AI is used.

### Acceptance probes (Section 13) — end-to-end, run against the live system

- [x] **Probe 1** — valid submission from second-origin page → stored, `2xx`, visible via dashboard.
- [x] **Probe 2** — malformed + oversized payload → clean `4xx` JSON, never `500`.
- [x] **Probe 3** — burst → `429`s, then a normal request still succeeds.
- [x] **Probe 4** — disable provider A → enriched by B; disable both → stored without geo.
- [x] **Probe 5** — force notifier to throw → submission still succeeds + stored.
- [x] **Probe 6** — fill honeypot → silently dropped/rejected.
