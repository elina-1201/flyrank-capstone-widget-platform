# Evidence

One proof per Section 6 requirement checkbox. Proofs are either an automated test
(name + result) or a live `curl` transcript against the running system.

**How to reproduce**

```bash
cp .env.example .env    # first run only
docker compose up       # one command: Postgres + Mailpit + API (migrations apply on boot)
docker compose run --rm api pnpm seed:prod   # demo owner + widget (fixed ids — see capstone.yaml)
pnpm test               # unit tests
pnpm test:e2e           # e2e tests — serial; needs Postgres (docker compose up -d db)
```

The e2e database (`embedded_widget_test`) is created on the first boot of the Postgres
volume by `db-init/01-create-test-db.sql` — no manual setup needed (volume predates the
script? `docker compose down -v`, or create it by hand — see README).

Verified from a clean slate (`docker compose down -v && docker compose up -d`):

E2e suites — `test:e2e` ships serial:

```
Test Suites: 6 passed, 6 total
Tests:       45 passed, 45 total
```

Unit tests (`pnpm test`):

```
Test Suites: 2 passed, 2 total
Tests:       6 passed, 6 total
```

And `capstone.yaml`'s `test:` command, run as shipped:

```
$ pnpm install --frozen-lockfile && docker compose up -d --wait db && pnpm test:e2e
 ✔ Container embedded-widget-db  Healthy
Test Suites: 6 passed, 6 total
Tests:       45 passed, 45 total
```

Live transcripts below carry the ids of the run that captured them; on a fresh seed the
demo widget is `demoWidget01` (`00000000-0000-4000-8000-000000000001`).

---

## Widget management

### ✅ Authenticated CRUD endpoints; requests without valid auth are rejected

**Tests** — `test/widgets.e2e-spec.ts`, `test/auth.e2e-spec.ts`

```
PASS Widgets (e2e) CRUD happy path create → 201 with widget + embed snippet
PASS Widgets (e2e) CRUD happy path list → only the owner's widgets
PASS Widgets (e2e) CRUD happy path get one → 200 with the widget
PASS Widgets (e2e) CRUD happy path patch → 200 with updated fields
PASS Widgets (e2e) CRUD happy path delete → 204, then get → 404
PASS Auth (e2e) JwtAuthGuard (protected route: GET /api/v1/widgets) no Authorization header → 401 UNAUTHORIZED envelope
PASS Auth (e2e) JwtAuthGuard (protected route: GET /api/v1/widgets) malformed token → 401
PASS Auth (e2e) JwtAuthGuard (protected route: GET /api/v1/widgets) expired token → 401
PASS Auth (e2e) JwtAuthGuard (protected route: GET /api/v1/widgets) wrong scheme (Basic …) → 401
```

### ✅ Multi-tenant isolation: A cannot read or modify B's widgets or submissions

**Tests** — `test/widgets.e2e-spec.ts`, `test/dashboard.e2e-spec.ts`

```
PASS Widgets (e2e) tenant isolation A cannot GET/PATCH/DELETE B's widget → 404 WIDGET_NOT_FOUND
PASS Widgets (e2e) tenant isolation A's list never includes B's widgets
PASS Dashboard (e2e) aggregates totals, byWidget, byDay, byCountry — tenant-scoped
```

---

## Embed snippet

### ✅ Embed snippet generated per widget

**Test** — `test/widget-delivery.e2e-spec.ts`

```
PASS Widget delivery (e2e) embed snippet contains <script src="…/widget.v<version>.js?id=<publicId>">
PASS Widget delivery (e2e) embed snippet two widgets → two distinct publicIds
```

**Live** — `pnpm seed` prints the snippet (fixed id, see `capstone.yaml`):

```
$ docker compose run --rm api pnpm seed:prod
Created owner demo@example.com (password: password123)
Created demo widget

Embed snippet:
<script src="http://localhost:3000/widget.v1.js?id=demoWidget01"></script>
```

---

## Widget delivery

### ✅ Public config endpoint serves a small payload with correct cache headers

**Test** — `test/widget-delivery.e2e-spec.ts`

```
PASS Widget delivery (e2e) GET /api/v1/public/widgets/:publicId/config 200 with a small payload and a short Cache-Control
PASS Widget delivery (e2e) GET /api/v1/public/widgets/:publicId/config unknown publicId → 404 WIDGET_NOT_FOUND
```

### ✅ Widget JavaScript served as a versioned bundle

**Test** — `test/widget-delivery.e2e-spec.ts`

```
PASS Widget delivery (e2e) versioned bundle /widget.v1.js is served with a long, immutable cache
PASS Widget delivery (e2e) versioned bundle old version keeps serving after a new one ships
```

### ✅ The widget renders on a page served from a different origin

The shipped demo page — `customer-site/index.html` — embeds the widget with one
`<script>` tag. Serve it from a second origin:

```bash
python3 -m http.server 5500 --directory customer-site
```

**Live** — the page loads on `:5500`; the bundle + config come from `:3000` cross-origin:

```
$ curl -s -o /dev/null -w "%{http_code}\n" http://localhost:5500/
200
$ curl -s http://localhost:5500/ | grep -n DEFAULT_WIDGET_ID
293:            var DEFAULT_WIDGET_ID = 'demoWidget01';

$ curl -s -i -H 'Origin: http://localhost:5500' http://localhost:3000/api/v1/public/widgets/demoWidget01/config | head -7
HTTP/1.1 200 OK
X-Powered-By: Express
Access-Control-Allow-Origin: http://localhost:5500
Vary: Origin
Cache-Control: public, max-age=60
Content-Type: application/json; charset=utf-8
Content-Length: 278
```

Verified in a browser: the form renders on `http://localhost:5500`, and submitting it
stores a row (`browser-probe@example.com`) visible via the dashboard:

```
$ curl -s "http://localhost:3000/api/v1/widgets/00000000-0000-4000-8000-000000000001/submissions?perPage=5" -H "Authorization: Bearer $TOKEN"
{ "data": [ { "id": "f1492340-…", "payload": { "name": "Browser check", "email": "browser-probe@example.com" }, … } ], "total": 2 }
```

---

## Public submission API

### ✅ Cross-origin submissions work: CORS headers correct, preflight handled

**Test** — `test/submissions.e2e-spec.ts`

```
PASS Submissions (e2e) CORS OPTIONS preflight → Allow-Origin/-Methods/-Headers; POST carries Allow-Origin
```

**Live** — Probe 1:

```
$ curl -s -i -X POST http://localhost:3000/api/v1/public/submissions \
    -H 'Content-Type: application/json' -H 'Origin: http://localhost:5500' \
    -d '{"widgetId":"dd383454-…","idempotencyKey":"11111111-…","payload":{"email":"probe1@example.com","name":"Probe One"}}'
HTTP/1.1 201 Created
Access-Control-Allow-Origin: http://localhost:5500
{"id":"2bde7136-6f47-4b87-b929-44ae81af2770","status":"stored"}
```

### ✅ All input validated; malformed and oversized payloads rejected with 4xx + JSON errors

**Test** — `test/submissions.e2e-spec.ts`

```
PASS Submissions (e2e) validation & error cases missing required field → 400 VALIDATION_FAILED
PASS Submissions (e2e) validation & error cases wrong type → 400
PASS Submissions (e2e) validation & error cases extra/unknown top-level field → 400
PASS Submissions (e2e) validation & error cases malformed JSON → 400 envelope (BAD_REQUEST), never 500
PASS Submissions (e2e) validation & error cases unknown widget → 404 WIDGET_NOT_FOUND
PASS Submissions (e2e) validation & error cases oversized payload → 413 PAYLOAD_TOO_LARGE
```

**Live** — Probe 2:

```
$ curl -s -w " [%{http_code}]\n" -X POST …/submissions -H 'Content-Type: application/json' -d '{ bad json'
{"error":{"code":"BAD_REQUEST","message":"Expected property name or '}' in JSON at position 2 (line 1 column 3)"}} [400]

$ curl -s -w " [%{http_code}]\n" -X POST …/submissions --data @/tmp/big.json
{"error":{"code":"PAYLOAD_TOO_LARGE","message":"payload too large"}} [413]

$ curl -s -w " [%{http_code}]\n" -X POST …/submissions -d '{"widgetId":"…","payload":{"name":"x"}}'
{"error":{"code":"VALIDATION_FAILED","message":"email is required"}} [400]

$ curl -s -w " [%{http_code}]\n" -X POST …/submissions -d '{"widgetId":"00000000-…","payload":{"email":"a@b.co"}}'
{"error":{"code":"WIDGET_NOT_FOUND","message":"widget not found"}} [404]

$ curl -s -w " [%{http_code}]\n" http://localhost:3000/api/v1/nope
{"error":{"code":"NOT_FOUND","message":"Cannot GET /api/v1/nope"}} [404]
```

Every failure — including a body that fails to parse before any handler runs —
uses the same `{ error: { code, message } }` envelope, enforced by
`src/common/api-error.filter.ts`. No `500` appears in the API logs.

### ✅ Valid submissions stored safely, linked to the right widget and tenant

**Test** — `test/submissions.e2e-spec.ts`

```
PASS Submissions (e2e) valid submission 201, row linked to the correct widget + tenant, visible via dashboard
```

**Live** — Probe 1b (visible via the dashboard):

```
$ curl -s "http://localhost:3000/api/v1/widgets/dd383454-…/submissions?page=1&perPage=3" -H "Authorization: Bearer $TOKEN"
{
  "total": 10,
  "first": {
    "id": "6b003d21-0f24-4d44-8d3b-26a1fb1dc85c",
    "payload": { "email": "burst9@example.com" },
    "ip": "127.0.0.1",
    "countryCode": null,
    "city": null,
    "geoProvider": null,
    "submittedAt": "2026-10-14T13:39:44.056Z"
  }
}
```

---

## Abuse protection

### ✅ Rate limiting per IP and/or per widget returns 429 under a burst — API keeps serving

**Test** — `test/submissions.e2e-spec.ts`

```
PASS Submissions (e2e) rate limiting burst → 429s, then a normal request from another IP still succeeds
```

**Live** — Probe 3:

```
$ for i in $(seq 1 14); do … done
req 1 -> 201
…
req 9 -> 201
req 10 -> 429
req 11 -> 429
req 12 -> 429
req 13 -> 429
req 14 -> 429

$ curl -s -o /dev/null -w "GET /health -> %{http_code}\n" http://localhost:3000/health
GET /health -> 200
$ curl -s -o /dev/null -w "GET config -> %{http_code}\n" http://localhost:3000/api/v1/public/widgets/zkqL7c6CBlSN/config
GET config -> 200
$ curl -s -o /dev/null -w "GET /widget.v1.js -> %{http_code}\n" http://localhost:3000/widget.v1.js
GET /widget.v1.js -> 200
```

### ✅ At least one spam-prevention technique demonstrably blocks a spam submission

**Test** — `test/submissions.e2e-spec.ts` (honeypot)

```
PASS Submissions (e2e) honeypot filled → 201 success shape but silently dropped (no row)
PASS Submissions (e2e) honeypot empty → accepted and stored
```

**Live** — Probe 6:

```
$ curl -s -w "\nstatus=%{http_code}\n" -X POST …/submissions \
    -d '{"widgetId":"dd383454-…","idempotencyKey":"33333333-…","honeypot":"bot","payload":{"email":"bot@example.com"}}'
{"id":"33333333-3333-4333-8333-333333333333","status":"stored"}
status=201
```

The response is the success shape (the bot learns nothing), but no row is written.

---

## Enrichment & safe side effects

### ✅ Provider fallback chain: A down → B answers → submission enriched

**Test** — `test/enrichment.e2e-spec.ts` (deterministic `fetch` mock)

```
PASS Enrichment & side effects (e2e) geo enrichment provider A down → B answers → submission enriched by ipapi.co
```

### ✅ All providers down → submission still succeeds (without geo)

**Test** — `test/enrichment.e2e-spec.ts`

```
PASS Enrichment & side effects (e2e) geo enrichment both providers down → stored without geo, still 2xx
```

### ✅ A failing confirmation email / webhook does not prevent the submission from being stored

**Test** — `test/enrichment.e2e-spec.ts`

```
PASS Enrichment & side effects (e2e) notifier failure notifier throws → submission still succeeds + stored
```

**Live** — Probe 5. Mailpit was stopped so every send fails, then a submission was
made. It is stored (`201`) and the outbox records the failure instead of the
request hanging:

```
$ docker compose stop mailpit
$ curl -s -w " [%{http_code}]\n" -X POST …/submissions \
    -H 'X-Forwarded-For: 203.0.113.9' \
    -d '{"widgetId":"…","idempotencyKey":"…","payload":{"email":"notifier-fixed@example.com"}}'
{"id":"49bceb8a-…","status":"stored"} [201]

# t+20s — the worker has tried and recorded the failure with backoff
 type                | status  | attempts | last_error
---------------------+---------+----------+----------------------------
 confirmation_email  | pending |        1 | getaddrinfo ENOTFOUND mailpit
 owner_notification  | pending |        1 | getaddrinfo ENOTFOUND mailpit

# no connection is left pinned mid-transaction
 pid | state | in_state
-----+-------+----------
(0 rows)

# retries back off, then the event is marked failed after 5 attempts
 pending 2 … pending 3 … pending 4 … failed 5

[OutboxWorker] submission event 53 failed after 5 attempts: getaddrinfo ENOTFOUND mailpit

# restarting the notifier recovers: a new submission's events are sent
 confirmation_email | sent attempts=0
 owner_notification | sent attempts=0
$ curl -s http://localhost:8025/api/v1/messages
{ "total": 2, … }
```

This case originally exposed a real bug: the worker dispatched **inside** its DB
transaction and the notifier had no socket timeout, so an unreachable SMTP host
left the connection `idle in transaction` and the retry path never ran. The worker
now claims in a short transaction and dispatches outside it, with a dispatch
ceiling (`DISPATCH_TIMEOUT_MS`) and notifier-level SMTP timeouts. See `BUILDLOG.md`.

```
$ docker exec embedded-widget-db psql -U postgres -d embedded_widget -c \
    "SELECT type, status, attempts, count(*) FROM submission_events GROUP BY type, status, attempts ORDER BY type;"
        type        | status | attempts | count
--------------------+--------+----------+-------
 confirmation_email | sent   |        0 |    12
 owner_notification | sent   |        0 |    12

$ curl -s http://localhost:8025/api/v1/messages
{ "total": 20, "subjects": ["Thanks for your interest", "New lead on \"Join our newsletter\"", …] }
```

---

## Documentation

### ✅ README with architecture diagram, setup instructions, and API documentation

`README.md` contains a Mermaid architecture diagram, the request pipeline, exact
run + seed steps, the full API reference, trade-offs, and a limitations note.

### ✅ One command boots the system (Section 11: "a stranger can run it")

`docker compose up` builds the API image and starts Postgres + Mailpit + the API; the
API applies migrations on boot. Verified live, starting from a clean slate
(`docker compose down -v` first):

```
$ docker compose up -d
[+] Running 5/5
 ✔ Network flyrank-capstone-widget-platform_default  Created
 ✔ Volume "flyrank-capstone-widget-platform_pgdata"  Created
 ✔ Container embedded-widget-mailpit                 Healthy
 ✔ Container embedded-widget-db                      Healthy
 ✔ Container embedded-widget-api                     Healthy

$ docker compose ps
NAME                      STATUS
embedded-widget-api       Up 7 minutes
embedded-widget-db        Up 7 minutes (healthy)
embedded-widget-mailpit   Up 7 minutes (healthy)

$ curl -s http://localhost:3000/health
{"status":"ok","db":"ok"}

$ docker compose run --rm api pnpm seed:prod
Created owner demo@example.com (password: password123)
Created demo widget

Embed snippet:
<script src="http://localhost:3000/widget.v1.js?id=demoWidget01"></script>
```

---

## Shared requirements (Section 13)

### ✅ 1 · Layered architecture — data / logic / HTTP separated

Entities (`src/**/*.entity.ts`) · services (`src/**/*.service.ts`) · controllers
(`src/**/*.controller.ts` + DTOs). See the README "Architecture" table.

### ✅ 2 · Validation at the boundary — bad input → clean 4xx, never 500

Covered by the `test/submissions.e2e-spec.ts` validation cases and Probe 2 above.

### ✅ 3 · ≥1 background job — off the request path, retries + failure alert

`OutboxWorker` (`@Cron` every 10s) claims due events with `FOR UPDATE SKIP LOCKED`,
dispatches via the `Notifier`, and on failure increments `attempts`, sets `last_error`,
backs off, and marks `failed` after 5 attempts (logged as an alert). Claiming happens in
a short transaction and dispatching happens **outside** it, so a hung transport cannot
pin the connection open or stall the loop.

**Test** — `src/submissions/outbox-worker.spec.ts`

```
PASS OutboxWorker claims a due pending event and marks it sent
PASS OutboxWorker on throw → attempts++, backoff, stays pending
PASS OutboxWorker marks failed after MAX_ATTEMPTS (5)
PASS OutboxWorker a notifier that never settles still fails fast (does not hang the loop)
```

### ✅ 4 · Real persistence — schema as migrations, right indexes, isolated tenants

**Live** — migrations applied and indexes present:

```
$ docker exec embedded-widget-db psql -U postgres -d embedded_widget -c "SELECT name FROM migrations ORDER BY id;"
       name
-------------------
 Init1791887088265

$ … -c "SELECT indexname FROM pg_indexes WHERE tablename='submissions' ORDER BY indexname;"
           indexname
--------------------------------
 IDX_4c20916032c4b0a7551b3309b4   -- (widget_id, submitted_at)
 PK_10b3be95b8b2fb1e482e07d706b
 UQ_15649cedf148fb846c9727f9255   -- idempotency_key UNIQUE

$ … -c "SELECT indexname FROM pg_indexes WHERE tablename='submission_events' ORDER BY indexname;"
           indexname
--------------------------------
 IDX_42f642fd3207bcb9eee8026e2b   -- (status, next_attempt_at)
 IDX_8c2bb197e4311c469005597a87   -- submission_id
 PK_9d543c147bfdb64e11af9f09c83
```

### ✅ 5 · Idempotency — the retried action happens once

**Test** — `test/submissions.e2e-spec.ts`

```
PASS Submissions (e2e) idempotency duplicate idempotency_key → single row, no duplicate event
```

**Live** — same key twice → one row:

```
$ curl -s -X POST …/submissions -d '{"…","idempotencyKey":"55555555-…","payload":{"email":"idem@example.com"}}'
{"id":"ad4bd544-fed6-46a9-b43e-a91ce331025c","status":"stored"}
$ curl -s -X POST …/submissions -d '{"…","idempotencyKey":"55555555-…","payload":{"email":"idem@example.com"}}'
{"id":"ad4bd544-fed6-46a9-b43e-a91ce331025c","status":"stored"}

$ … -c "SELECT count(*) AS rows FROM submissions WHERE idempotency_key='55555555-…';"
 rows
------
    1
```

### ✅ 6 · Secrets clean — env only, never logged

`.env` is git-ignored (`.gitignore`); `.env.example` is committed with placeholders.
No secret is logged; the `Owner.passwordHash` column is `@Exclude()`d from serialization.

### ✅ 7 · Cost tracked (if AI is used)

No paid AI is used at runtime — the platform makes no AI/LLM calls, so there is no
per-call cost to attribute or budget to guard. (AI was used only as a development
assistant; see `BUILDLOG.md`.)

---

## Acceptance probes (Section 13)

| Probe | Result | Evidence |
| --- | --- | --- |
| **1** — valid submission from second-origin page → stored, 2xx, visible via dashboard | ✅ | Probe 1 + 1b transcripts above |
| **2** — malformed + oversized payload → clean 4xx JSON, never 500 | ✅ | Probe 2 transcript above |
| **3** — burst → 429s, then a normal request still succeeds | ✅ | Probe 3 + 3b transcripts above |
| **4** — disable provider A → enriched by B; disable both → stored without geo | ✅ | `test/enrichment.e2e-spec.ts` (deterministic mock) |
| **5** — force notifier to throw → submission still succeeds + stored | ✅ | `test/enrichment.e2e-spec.ts` |
| **6** — fill honeypot → silently dropped/rejected | ✅ | Probe 6 transcript above |

**Re-running the live probes.** Submissions are rate-limited per client IP (10/min,
fixed 60 s window). Probe 3's burst deliberately exhausts the window for `127.0.0.1`,
so probes that submit (4–6) are run with a distinct client: start the API with
`TRUST_PROXY=1` (set it in `.env`, then `docker compose up -d api`) and send
`X-Forwarded-For: 203.0.113.<n>` per request — otherwise a `429` only means "wait for
the window to reset". The honeypot probe survives either way (checked before the
limiter). A normal sweep of the `capstone.yaml` probes needs no special handling; its
submission probe also carries an `X-Forwarded-For` header for the same purpose.