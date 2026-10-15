import request from 'supertest';
import { createOwnerWithToken, createWidget } from './utils/helpers';
import { createTestApp, TestApp, truncateAll } from './utils/test-app';

describe('Submissions (e2e)', () => {
    let ctx: TestApp;

    beforeAll(async () => {
        ctx = await createTestApp();
    });

    afterAll(async () => {
        await ctx.close();
    });

    beforeEach(async () => {
        await truncateAll(ctx.dataSource);
    });

    const server = () => ctx.app.getHttpServer();

    describe('CORS', () => {
        it('OPTIONS preflight → Allow-Origin/-Methods/-Headers; POST carries Allow-Origin', async () => {
            const { token } = await createOwnerWithToken(ctx);
            const widget = await createWidget(ctx, token);

            const preflight = await request(server())
                .options('/api/v1/public/submissions')
                .set('Origin', 'https://customer.example.com')
                .set('Access-Control-Request-Method', 'POST')
                .set('Access-Control-Request-Headers', 'Content-Type')
                .expect(204);

            expect(preflight.headers['access-control-allow-origin']).toBe(
                'https://customer.example.com',
            );
            expect(preflight.headers['access-control-allow-methods']).toContain(
                'POST',
            );
            expect(preflight.headers['access-control-allow-headers']).toContain(
                'Content-Type',
            );

            const post = await request(server())
                .post('/api/v1/public/submissions')
                .set('Origin', 'https://customer.example.com')
                .send({
                    widgetId: widget.id,
                    idempotencyKey: '00000000-0000-4000-8000-000000000001',
                    payload: { email: 'visitor@example.com' },
                })
                .expect(201);

            expect(post.headers['access-control-allow-origin']).toBe(
                'https://customer.example.com',
            );
        });
    });

    describe('valid submission', () => {
        it('201, row linked to the correct widget + tenant, visible via dashboard', async () => {
            const { token } = await createOwnerWithToken(ctx);
            const widget = await createWidget(ctx, token);

            const res = await request(server())
                .post('/api/v1/public/submissions')
                .send({
                    widgetId: widget.id,
                    idempotencyKey: '00000000-0000-4000-8000-000000000002',
                    payload: { email: 'visitor@example.com' },
                })
                .expect(201);

            expect(res.body.status).toBe('stored');
            expect(res.body.id).toEqual(expect.any(String));

            // Row is linked to the right widget and tenant.
            const rows = await ctx.dataSource.query(
                'SELECT s.widget_id, w.owner_id FROM submissions s JOIN widgets w ON w.id = s.widget_id WHERE s.id = $1',
                [res.body.id],
            );
            expect(rows).toHaveLength(1);
            expect(rows[0].widget_id).toBe(widget.id);

            // Visible via the dashboard, scoped to the owning tenant.
            const list = await request(server())
                .get(`/api/v1/widgets/${widget.id}/submissions`)
                .set('Authorization', `Bearer ${token}`)
                .expect(200);

            expect(list.body.total).toBe(1);
            expect(list.body.data[0].id).toBe(res.body.id);
            expect(list.body.data[0].payload).toEqual({
                email: 'visitor@example.com',
            });
        });
    });

    describe('validation & error cases', () => {
        const uuid = (n: number) =>
            `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;

        it('missing required field → 400 VALIDATION_FAILED', async () => {
            const { token } = await createOwnerWithToken(ctx);
            const widget = await createWidget(ctx, token);

            const res = await request(server())
                .post('/api/v1/public/submissions')
                .send({
                    widgetId: widget.id,
                    idempotencyKey: uuid(10),
                    payload: {},
                })
                .expect(400);

            expect(res.body.error.code).toBe('VALIDATION_FAILED');
        });

        it('wrong type → 400', async () => {
            const { token } = await createOwnerWithToken(ctx);
            const widget = await createWidget(ctx, token);

            const res = await request(server())
                .post('/api/v1/public/submissions')
                .send({
                    widgetId: widget.id,
                    idempotencyKey: uuid(11),
                    payload: { email: 12345 },
                })
                .expect(400);

            expect(res.body.error.code).toBe('VALIDATION_FAILED');
        });

        it('extra/unknown top-level field → 400', async () => {
            const { token } = await createOwnerWithToken(ctx);
            const widget = await createWidget(ctx, token);

            const res = await request(server())
                .post('/api/v1/public/submissions')
                .send({
                    widgetId: widget.id,
                    idempotencyKey: uuid(12),
                    payload: { email: 'visitor@example.com' },
                    unexpected: 'nope',
                })
                .expect(400);

            expect(res.body.error.code).toBe('VALIDATION_FAILED');
        });

        it('malformed JSON → 400, never 500', async () => {
            const res = await request(server())
                .post('/api/v1/public/submissions')
                .set('Content-Type', 'application/json')
                .send('{ "widgetId": ');

            expect(res.status).toBe(400);
            expect(res.status).toBeLessThan(500);
            // The envelope holds for parse failures too (body-parser throws
            // before any route handler runs).
            expect(res.body.error.code).toBe('BAD_REQUEST');
            expect(typeof res.body.error.message).toBe('string');
        });

        it('unknown widget → 404 WIDGET_NOT_FOUND', async () => {
            const res = await request(server())
                .post('/api/v1/public/submissions')
                .send({
                    widgetId: uuid(99),
                    idempotencyKey: uuid(13),
                    payload: { email: 'visitor@example.com' },
                })
                .expect(404);

            expect(res.body.error.code).toBe('WIDGET_NOT_FOUND');
        });

        it('oversized payload → 413 PAYLOAD_TOO_LARGE', async () => {
            const { token } = await createOwnerWithToken(ctx);
            const widget = await createWidget(ctx, token);

            const res = await request(server())
                .post('/api/v1/public/submissions')
                .send({
                    widgetId: widget.id,
                    idempotencyKey: uuid(14),
                    payload: { email: 'a'.repeat(11 * 1024) },
                })
                .expect(413);

            expect(res.body.error.code).toBe('PAYLOAD_TOO_LARGE');
        });
    });

    describe('rate limiting', () => {
        it('burst → 429s, then a normal request from another IP still succeeds', async () => {
            const { token } = await createOwnerWithToken(ctx);
            const widget = await createWidget(ctx, token);

            const submit = (ip: string, n: number) =>
                request(server())
                    .post('/api/v1/public/submissions')
                    .set('X-Forwarded-For', ip)
                    .send({
                        widgetId: widget.id,
                        idempotencyKey: `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`,
                        payload: { email: 'visitor@example.com' },
                    });

            // Per-IP limit is 10/min: the 11th request from the same IP is throttled.
            const statuses: number[] = [];
            for (let i = 1; i <= 11; i += 1) {
                const res = await submit('203.0.113.7', i);
                statuses.push(res.status);
            }

            expect(statuses.slice(0, 10).every((s) => s === 201)).toBe(true);
            expect(statuses[10]).toBe(429);

            const throttled = await submit('203.0.113.7', 12);
            expect(throttled.status).toBe(429);
            expect(throttled.body.error.code).toBe('RATE_LIMITED');

            // A different visitor (different IP) is unaffected.
            const other = await submit('203.0.113.8', 13);
            expect(other.status).toBe(201);
        });
    });

    describe('honeypot', () => {
        it('filled → 201 success shape but silently dropped (no row)', async () => {
            const { token } = await createOwnerWithToken(ctx);
            const widget = await createWidget(ctx, token);

            const res = await request(server())
                .post('/api/v1/public/submissions')
                .send({
                    widgetId: widget.id,
                    idempotencyKey: '00000000-0000-4000-8000-000000000020',
                    honeypot: 'bot-filled-this',
                    payload: { email: 'bot@example.com' },
                })
                .expect(201);

            expect(res.body.status).toBe('stored');

            const [{ count }] = await ctx.dataSource.query(
                'SELECT COUNT(*)::int AS count FROM submissions',
            );
            expect(count).toBe(0);
        });

        it('empty → accepted and stored', async () => {
            const { token } = await createOwnerWithToken(ctx);
            const widget = await createWidget(ctx, token);

            const res = await request(server())
                .post('/api/v1/public/submissions')
                .send({
                    widgetId: widget.id,
                    idempotencyKey: '00000000-0000-4000-8000-000000000021',
                    honeypot: '',
                    payload: { email: 'human@example.com' },
                })
                .expect(201);

            expect(res.body.status).toBe('stored');

            const [{ count }] = await ctx.dataSource.query(
                'SELECT COUNT(*)::int AS count FROM submissions',
            );
            expect(count).toBe(1);
        });
    });

    describe('idempotency', () => {
        it('duplicate idempotency_key → single row, no duplicate event', async () => {
            const { token } = await createOwnerWithToken(ctx);
            const widget = await createWidget(ctx, token);

            const body = {
                widgetId: widget.id,
                idempotencyKey: '00000000-0000-4000-8000-000000000030',
                payload: { email: 'visitor@example.com' },
            };

            const first = await request(server())
                .post('/api/v1/public/submissions')
                .send(body)
                .expect(201);
            const second = await request(server())
                .post('/api/v1/public/submissions')
                .send(body)
                .expect(201);

            // Same row is returned for the retried action.
            expect(second.body.id).toBe(first.body.id);

            const [{ submissions }] = await ctx.dataSource.query(
                'SELECT COUNT(*)::int AS submissions FROM submissions',
            );
            expect(submissions).toBe(1);

            const [{ events }] = await ctx.dataSource.query(
                'SELECT COUNT(*)::int AS events FROM submission_events',
            );
            // One owner_notification + one confirmation_email — not doubled.
            expect(events).toBe(2);
        });
    });
});
