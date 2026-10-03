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
