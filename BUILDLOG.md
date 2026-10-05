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
