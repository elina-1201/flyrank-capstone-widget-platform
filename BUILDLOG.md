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
