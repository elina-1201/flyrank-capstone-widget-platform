import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { createOwnerWithToken, createWidget } from './utils/helpers';
import { createTestApp, TestApp, truncateAll } from './utils/test-app';

describe('Dashboard (e2e)', () => {
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

  /** Inserts a submission directly so geo + timestamp are fully controlled. */
  async function insertSubmission(
    widgetId: string,
    countryCode: string | null,
    submittedAt: string,
  ): Promise<void> {
    await ctx.dataSource.query(
      `INSERT INTO submissions
                (widget_id, idempotency_key, payload, ip_address, country_code, submitted_at)
             VALUES ($1, $2, $3, $4, $5, $6)`,
      [
        widgetId,
        randomUUID(),
        JSON.stringify({ email: 'visitor@example.com' }),
        '203.0.113.1',
        countryCode,
        submittedAt,
      ],
    );
  }

  it('aggregates totals, byWidget, byDay, byCountry — tenant-scoped', async () => {
    const a = await createOwnerWithToken(ctx);
    const b = await createOwnerWithToken(ctx);

    const a1 = await createWidget(ctx, a.token, { title: 'A one' });
    const a2 = await createWidget(ctx, a.token, { title: 'A two' });
    const b1 = await createWidget(ctx, b.token, { title: 'B one' });

    // A: 3 submissions across two widgets, two days, two countries.
    await insertSubmission(a1.id, 'US', '2026-01-01T10:00:00Z');
    await insertSubmission(a1.id, 'DE', '2026-01-02T10:00:00Z');
    await insertSubmission(a2.id, 'US', '2026-01-02T11:00:00Z');
    // B: 3 submissions that A must never see.
    await insertSubmission(b1.id, 'FR', '2026-01-01T10:00:00Z');
    await insertSubmission(b1.id, 'FR', '2026-01-01T11:00:00Z');
    await insertSubmission(b1.id, 'FR', '2026-01-01T12:00:00Z');

    const res = await request(server())
      .get('/api/v1/dashboard/summary')
      .set('Authorization', `Bearer ${a.token}`)
      .expect(200);

    expect(res.body.totals.submissions).toBe(3);

    const byWidget = res.body.byWidget as Array<{
      widgetId: string;
      title: string;
      count: number;
    }>;
    expect(byWidget).toHaveLength(2);
    expect(byWidget.map((w) => w.widgetId).sort()).toEqual(
      [a1.id, a2.id].sort(),
    );
    expect(byWidget.find((w) => w.widgetId === a1.id)?.count).toBe(2);
    expect(byWidget.find((w) => w.widgetId === a2.id)?.count).toBe(1);

    const byDay = res.body.byDay as Array<{ day: string; count: number }>;
    expect(byDay).toEqual([
      { day: '2026-01-01', count: 1 },
      { day: '2026-01-02', count: 2 },
    ]);

    const byCountry = res.body.byCountry as Array<{
      countryCode: string | null;
      count: number;
    }>;
    expect(byCountry).toEqual([
      { countryCode: 'US', count: 2 },
      { countryCode: 'DE', count: 1 },
    ]);

    // B sees only its own rows.
    const bRes = await request(server())
      .get('/api/v1/dashboard/summary')
      .set('Authorization', `Bearer ${b.token}`)
      .expect(200);

    expect(bRes.body.totals.submissions).toBe(3);
    expect(bRes.body.byWidget).toHaveLength(1);
    expect(bRes.body.byWidget[0].widgetId).toBe(b1.id);
    expect(bRes.body.byCountry).toEqual([{ countryCode: 'FR', count: 3 }]);
  });
});
