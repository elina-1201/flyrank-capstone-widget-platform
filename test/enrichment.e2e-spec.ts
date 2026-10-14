import request from 'supertest';
import { NOTIFIER } from '../src/submissions/notifier.interface';
import { OutboxWorker } from '../src/submissions/outbox-worker';
import { createOwnerWithToken, createWidget } from './utils/helpers';
import { createTestApp, TestApp, truncateAll } from './utils/test-app';

/** A fetch stub that answers by URL substring; unmatched URLs throw. */
function stubFetch(
    handlers: Array<{ match: string; response: () => Response | Promise<Response> }>,
): void {
    global.fetch = (async (input: string | URL | Request) => {
        const url = typeof input === 'string' ? input : input.toString();
        const handler = handlers.find((h) => url.includes(h.match));
        if (!handler) {
            throw new Error(`unexpected fetch: ${url}`);
        }
        return handler.response();
    }) as typeof fetch;
}

const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), {
        status,
        headers: { 'content-type': 'application/json' },
    });

describe('Enrichment & side effects (e2e)', () => {
    let ctx: TestApp;
    const realFetch = global.fetch;

    beforeAll(async () => {
        ctx = await createTestApp();
    });

    afterAll(async () => {
        global.fetch = realFetch;
        await ctx.close();
    });

    beforeEach(async () => {
        await truncateAll(ctx.dataSource);
    });

    const server = () => ctx.app.getHttpServer();

    const submit = (widgetId: string, key: string) =>
        request(server())
            .post('/api/v1/public/submissions')
            .send({
                widgetId,
                idempotencyKey: key,
                payload: { email: 'visitor@example.com' },
            });

    describe('geo enrichment', () => {
        it('provider A down → B answers → submission enriched by ipapi.co', async () => {
            const { token } = await createOwnerWithToken(ctx);
            const widget = await createWidget(ctx, token);

            stubFetch([
                {
                    match: 'ip-api.com',
                    response: () => json({ status: 'fail' }),
                },
                {
                    match: 'ipapi.co',
                    response: () =>
                        json({
                            country_code: 'DE',
                            region: 'Berlin',
                            city: 'Berlin',
                        }),
                },
            ]);

            const res = await submit(
                widget.id,
                '00000000-0000-4000-8000-000000000040',
            ).expect(201);

            const [row] = await ctx.dataSource.query(
                'SELECT country_code, region, city, geo_provider FROM submissions WHERE id = $1',
                [res.body.id],
            );
            expect(row.country_code).toBe('DE');
            expect(row.city).toBe('Berlin');
            expect(row.geo_provider).toBe('ipapi.co');
        });

        it('both providers down → stored without geo, still 2xx', async () => {
            const { token } = await createOwnerWithToken(ctx);
            const widget = await createWidget(ctx, token);

            stubFetch([
                { match: 'ip-api.com', response: () => json({ status: 'fail' }) },
                { match: 'ipapi.co', response: () => json({ error: true }) },
            ]);

            const res = await submit(
                widget.id,
                '00000000-0000-4000-8000-000000000041',
            ).expect(201);

            const [row] = await ctx.dataSource.query(
                'SELECT country_code, geo_provider FROM submissions WHERE id = $1',
                [res.body.id],
            );
            expect(row.country_code).toBeNull();
            expect(row.geo_provider).toBeNull();
        });
    });

    describe('notifier failure', () => {
        it('notifier throws → submission still succeeds + stored', async () => {
            const failing = await createTestApp({
                realOutboxWorker: true,
                configure: (builder) =>
                    builder.overrideProvider(NOTIFIER).useValue({
                        notify: async () => {
                            throw new Error('smtp down');
                        },
                    }),
            });

            try {
                const { token } = await createOwnerWithToken(failing);
                const widget = await createWidget(failing, token);

                const res = await request(failing.app.getHttpServer())
                    .post('/api/v1/public/submissions')
                    .send({
                        widgetId: widget.id,
                        idempotencyKey: '00000000-0000-4000-8000-000000000042',
                        payload: { email: 'visitor@example.com' },
                    })
                    .expect(201);

                // The submission is stored regardless of the side effect.
                const [row] = await failing.dataSource.query(
                    'SELECT id FROM submissions WHERE id = $1',
                    [res.body.id],
                );
                expect(row).toBeDefined();

                // Driving the worker records the failure without touching the row.
                await failing.app.get(OutboxWorker).processOutbox();

                const events = await failing.dataSource.query(
                    'SELECT status, attempts, last_error FROM submission_events',
                );
                expect(events.length).toBeGreaterThan(0);
                expect(events.every((e: { attempts: number }) => e.attempts === 1)).toBe(
                    true,
                );
                expect(
                    events.every((e: { last_error: string }) =>
                        e.last_error.includes('smtp down'),
                    ),
                ).toBe(true);
            } finally {
                await failing.close();
            }
        });
    });
});