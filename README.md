# Embeddable Widget & Lead-Capture Platform

A backend platform that lets a customer define an embeddable widget (signup form, CTA,
popover), hand them one line of `<script>`, and safely catch everything the public
internet throws back — validated, spam-filtered, geo-enriched, stored, and shown in a
dashboard.

The public internet is the input: CORS, caching, abuse, and resilience are the point.

## Architecture

Three request paths, kept separate in the code: **admin** (owner CRUD, authenticated),
**public** (no auth, CORS-open), and **dashboard** (owner reads, authenticated).

```mermaid
sequenceDiagram
    participant O as Owner (dashboard)
    participant API as Backend (API)
    participant P as Customer page (browser)
    participant V as Visitor

    O->>API: POST /api/v1/widgets (authenticated)
    API-->>O: widget saved + embed snippet
    Note over P: customer pastes the one-line <script>
    P->>API: GET /widget.v1.js?id=abc123
    P->>API: GET /api/v1/public/widgets/abc123/config
    API-->>P: config JSON (fields, button text)
    Note over P: render the form into a div
    V->>P: fills the form, clicks submit
    P->>API: POST /api/v1/public/submissions (cross-origin)
    API->>API: validate → honeypot → rate limit → spam → geo → store → outbox
    API-->>P: 201
    Note over API: outbox worker emails the owner/visitor (retries, never blocks)
```

Layering (shared requirement #1 — data / logic / HTTP separated):

| Layer | Where | Responsibility |
| --- | --- | --- |
| Data | `src/**/*.entity.ts`, `src/database/migrations/` | Tables, indexes, FKs, schema evolution |
| Logic | `src/**/*.service.ts` | Validation, rate limiting, geo, outbox, aggregation |
| HTTP | `src/**/*.controller.ts`, `src/**/dto/` | Routing, auth guards, request/response shapes |

### Request pipeline (public submission)

`POST /api/v1/public/submissions` runs a fixed, ordered pipeline:

1. **Payload size guard** — `> 10 KB` → `413 PAYLOAD_TOO_LARGE`
2. **Widget lookup** — unknown `widgetId` → `404 WIDGET_NOT_FOUND`
3. **Honeypot** — a filled `honeypot` field is dropped silently (no row, `201` shape)
4. **Payload validation** — a per-widget Zod schema built from `widget.fields`; unknown keys stripped, missing required → `400 VALIDATION_FAILED`
5. **Rate limit** — per IP (10/min) and per widget (100/min) → `429 RATE_LIMITED`
6. **Spam heuristic** — 3+ URLs in the payload/UA → dropped silently
7. **Geo enrichment** — ip-api.com → ipapi.co fallback; all down → stored without geo
8. **Store** — submission + outbox events in **one transaction** (idempotent on `idempotency_key`)
9. **Side effects** — an outbox worker emails off the request path; failure never blocks the `201`

## Requirements

- **Docker** (for the one-command run) — or **Node.js** 20+ and **pnpm** for local dev

## Setup & run

### One command (Docker)

```bash
cp .env.example .env   # first run only — fill in JWT_SECRET
docker compose up
```

That single command builds the API image and starts **Postgres + Mailpit + the API**.
The API applies pending migrations on boot, so the schema is ready with no extra step.
The API listens on `http://localhost:3000`; Mailpit's web UI is at `http://localhost:8025`.

Seed demo data (one owner + one widget; idempotent):

```bash
docker compose run --rm api pnpm seed:prod
```

Config comes from `.env` (`env_file`); the two host-specific values are overridden inside
the compose network — `DATABASE_URL` → `db:5432` and `SMTP_HOST` → `mailpit` — so the same
`.env` works for both Docker and local dev.

### Local dev (without Docker for the API)

```bash
pnpm install
cp .env.example .env   # fill in DATABASE_URL, JWT_SECRET, PUBLIC_BASE_URL
docker compose up -d db mailpit
pnpm start:dev         # pending migrations apply automatically on boot
pnpm seed
```

### Demo credentials (from `pnpm seed`)

| Field | Value |
| --- | --- |
| Email | `demo@example.com` |
| Password | `password123` |

The seed gives the demo widget fixed ids, so the bundled demo page works out of the box.
Serve it from a **different origin** than the API and open it:

```bash
python3 -m http.server 5500 --directory customer-site
# open http://localhost:5500 — the widget renders and a submission lands in the dashboard
```

The seed also prints the widget's embed snippet — paste it into any other page to try the
same flow.

### Environment variables

Every variable is documented in `.env.example`. `.env` is git-ignored; never commit it.

| Variable | Purpose |
| --- | --- |
| `PORT` | HTTP port (default `3000`) |
| `NODE_ENV` | `development` / `production` / `test` |
| `DATABASE_URL` | Postgres connection string |
| `JWT_SECRET` | Signing secret for owner JWTs |
| `JWT_EXPIRES_IN` | Token lifetime (e.g. `7d`) |
| `PUBLIC_BASE_URL` | Origin used to build the embed snippet `src` |
| `WIDGET_BUNDLE_VERSION` | Bundle filename under `public/` (e.g. `v1` → `widget.v1.js`) |
| `TRUST_PROXY` | Express `trust proxy` — set behind a reverse proxy so `req.ip` is the real client |
| `SMTP_HOST` / `SMTP_PORT` / `SMTP_FROM` | Outbound email (Mailpit in local dev) |

## API

All errors use one envelope: `{ "error": { "code": string, "message": string } }`.
Bad input is always a clean `4xx` — never a `500`.

### Public (no auth, CORS-open)

| Method | Path | Success | Notes |
| --- | --- | --- | --- |
| `GET` | `/widget.v<version>.js` | `200` | Versioned bundle, `Cache-Control: immutable` |
| `GET` | `/api/v1/public/widgets/:publicId/config` | `200` | Config JSON, `Cache-Control: max-age=60`; unknown → `404 WIDGET_NOT_FOUND` |
| `POST` | `/api/v1/public/submissions` | `201 { id, status }` | See pipeline above; `400` / `404` / `413` / `429` |

### Admin (authenticated — `Authorization: Bearer <jwt>`)

| Method | Path | Success | Notes |
| --- | --- | --- | --- |
| `POST` | `/api/v1/auth/register` | `201 { status: "created" }` | Silent no-op on duplicate email (anti-enumeration) |
| `POST` | `/api/v1/auth/login` | `200 { token }` | `401 INVALID_CREDENTIALS` on mismatch |
| `POST` | `/api/v1/widgets` | `201 { widget, snippet }` | Create + embed snippet |
| `GET` | `/api/v1/widgets` | `200 [ … ]` | List the owner's widgets |
| `GET` | `/api/v1/widgets/:id` | `200 { widget }` | Owner-scoped; others' → `404 WIDGET_NOT_FOUND` |
| `PATCH` | `/api/v1/widgets/:id` | `200 { widget }` | Owner-scoped |
| `DELETE` | `/api/v1/widgets/:id` | `204` | Owner-scoped |

### Dashboard (authenticated)

| Method | Path | Success | Notes |
| --- | --- | --- | --- |
| `GET` | `/api/v1/widgets/:id/submissions?page=&perPage=` | `200 { data, page, perPage, total }` | Paginated, tenant-scoped |
| `GET` | `/api/v1/dashboard/summary` | `200 { totals, byWidget, byDay, byCountry }` | Aggregate stats |

### Ops

| Method | Path | Success | Notes |
| --- | --- | --- | --- |
| `GET` | `/` | `200` | Platform info + endpoint index |
| `GET` | `/health` | `200 { status, db }` | Pings Postgres; `503 DB_UNAVAILABLE` when down |

## Database schema & migrations

The schema is owned by versioned TypeORM migrations — `synchronize` is off. Pending
migrations apply automatically on boot (`migrationsRun: true`), so `pnpm start:dev`
is still the only command needed to get a working schema.

Manage them explicitly when needed:

```bash
pnpm migration:run      # apply pending migrations
pnpm migration:revert   # roll back the last one
pnpm migration:generate src/database/migrations/<Name>  # diff entities → new migration
```

The CLI uses `src/database/data-source.ts`, which loads `.env` itself (it runs outside
Nest). After changing an entity, generate a migration and commit it — do not hand-edit
the generated SQL.

## Tests

```bash
pnpm test        # unit tests (src/**/*.spec.ts)
pnpm test:e2e    # end-to-end tests (test/**/*.e2e-spec.ts) — serial, needs Postgres
```

The e2e suites boot the real `AppModule` against a dedicated test database
(`TEST_DATABASE_URL`, default `postgres://postgres:postgres@localhost:5433/embedded_widget_test`).
They share that database, so the suites run serially (`--runInBand` is part of the
`test:e2e` script).

The test database is created by `db-init/01-create-test-db.sql` the first time the
Postgres volume initializes. If your `pgdata` volume predates that script, reset it
(`docker compose down -v`) or create the database by hand:

```bash
docker compose exec db psql -U postgres -c 'CREATE DATABASE embedded_widget_test;'
```

`capstone.yaml`'s `test:` runs these suites with the setup included
(`pnpm install && docker compose up -d --wait db && pnpm test:e2e`).

## Trade-offs

- **Own rate-limiter vs `@nestjs/throttler`** — throttler keys on route/IP patterns and
  adds storage abstraction overhead; our limiter needs per-IP **and** per-widget keys with an
  ephemeral TTL store, inserted at a precise spot in the pipeline (after honeypot drop, before
  geo). Rolling it by hand keeps that ordering explicit and dependency-free.
- **Nest `@Cron` vs Inngest** — in-process cron keeps the stack self-contained (no external
  queue service, no webhook ingress, trivial local dev). We accept the trade-offs: no durable
  cross-instance dedup and retries live in Postgres (the outbox) rather than in Inngest.
- **Self-hosted auth vs Supabase Auth** — no vendor lock-in, but we give up refresh tokens,
  token revocation, and built-in email verification / password reset; self-issued JWTs stay
  valid until expiry.
- **Free geo APIs (ip-api.com / ipapi.co) vs local GeoIP DB (MaxMind)** — no license or offline
  DB updates, but per-request network egress, provider rate limits, and the ip-api.com free tier
  is plain `http://` (no TLS).
- **In-memory rate-limit store vs Redis** — a per-process `Map` with TTL is zero-ops and fast,
  but counters are not shared across instances and reset on restart (fine for single-instance).
- **Synchronous geo enrich in the submit path vs background** — keeps the store atomic (one
  transaction writes row + geo), but the response can wait up to ~3s when both providers time out.
- **`trust proxy` opt-in vs always-on** — per-IP rate limiting and geo enrichment need `req.ip`
  to be the real visitor, which behind a reverse proxy means reading `X-Forwarded-For`. But that
  header is client-settable, so trusting it while directly exposed lets an attacker spoof a fresh
  IP per request and bypass the limiter. We default `TRUST_PROXY` off (safe when exposed directly)
  and require it to be set to match the deployment topology; the cost is a config step that, if
  forgotten behind a proxy, silently collapses every visitor into one rate-limit bucket and
  enriches the proxy's IP instead of the visitor's.

## Limitations

- **Single-instance assumptions.** Rate-limit counters live in an in-process `Map` and the
  outbox worker runs in-process via `@Cron`. Running multiple instances would need a shared
  store (Redis) and cross-instance locking; the outbox already uses `FOR UPDATE SKIP LOCKED`,
  but the rate limiter does not.
- **No token revocation.** Self-issued JWTs are valid until they expire — there is no
  refresh-token rotation, logout, or server-side revocation list.
- **Geo is best-effort.** The free providers are rate-limited and the ip-api.com free tier is
  plain `http://`. Enrichment is synchronous, so a slow provider can add up to ~3s to a
  submission before it degrades to "no geo".
- **Email is local-only.** Mailpit catches mail in dev; there is no production SMTP provider
  wired up. The graded property is that a failing side effect never blocks the submission.
- **No frontend.** The dashboard is an API only; the "customer site" is the plain
  `customer-site/index.html` served from a second origin. This is a backend capstone.
- **`TRUST_PROXY` must match the deployment.** Left unset behind a proxy, per-IP rate limiting
  and geo enrichment silently use the proxy's address (see Trade-offs).

## License

MIT — see [`LICENSE`](./LICENSE).
