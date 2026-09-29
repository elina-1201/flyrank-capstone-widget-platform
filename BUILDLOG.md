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
