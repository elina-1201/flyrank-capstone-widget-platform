import { existsSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import request from 'supertest';
import { createOwnerWithToken, createWidget } from './utils/helpers';
import { createTestApp, TestApp, truncateAll } from './utils/test-app';

describe('Widget delivery (e2e)', () => {
  let ctx: TestApp;
  const publicDir = join(process.cwd(), 'public');
  const v2Path = join(publicDir, 'widget.v2.js');

  beforeAll(async () => {
    ctx = await createTestApp();
  });

  afterAll(async () => {
    // Clean up the temporary bundle shipped by the versioning test.
    if (existsSync(v2Path)) {
      rmSync(v2Path);
    }
    await ctx.close();
  });

  beforeEach(async () => {
    await truncateAll(ctx.dataSource);
  });

  const server = () => ctx.app.getHttpServer();

  describe('GET /api/v1/public/widgets/:publicId/config', () => {
    it('200 with a small payload and a short Cache-Control', async () => {
      const { token } = await createOwnerWithToken(ctx);
      const widget = await createWidget(ctx, token);

      const res = await request(server())
        .get(`/api/v1/public/widgets/${widget.publicId}/config`)
        .expect(200);

      expect(res.headers['cache-control']).toContain('max-age=60');
      expect(res.body).toMatchObject({
        id: widget.id,
        type: 'signup_form',
        title: 'Join our newsletter',
      });
      expect(Array.isArray(res.body.fields)).toBe(true);
      // Config is intentionally small — it is fetched on every page load.
      expect(JSON.stringify(res.body).length).toBeLessThan(2000);
    });

    it('unknown publicId → 404 WIDGET_NOT_FOUND', async () => {
      const res = await request(server())
        .get('/api/v1/public/widgets/doesnotexist/config')
        .expect(404);
      expect(res.body.error.code).toBe('WIDGET_NOT_FOUND');
    });

    it('CORS header present for a cross-origin request', async () => {
      const { token } = await createOwnerWithToken(ctx);
      const widget = await createWidget(ctx, token);

      const res = await request(server())
        .get(`/api/v1/public/widgets/${widget.publicId}/config`)
        .set('Origin', 'https://customer.example.com')
        .expect(200);

      expect(res.headers['access-control-allow-origin']).toBe(
        'https://customer.example.com',
      );
    });
  });

  describe('versioned bundle', () => {
    it('/widget.v1.js is served with a long, immutable cache', async () => {
      const res = await request(server()).get('/widget.v1.js').expect(200);

      expect(res.headers['content-type']).toMatch(/javascript/);
      expect(res.headers['cache-control']).toContain('max-age=31536000');
      expect(res.headers['cache-control']).toContain('immutable');
      expect(res.text.length).toBeGreaterThan(0);
    });

    it('old version keeps serving after a new one ships', async () => {
      // Ship a new bundle version by dropping a file in public/.
      writeFileSync(v2Path, '/* widget bundle v2 */\n', 'utf8');

      const v1 = await request(server()).get('/widget.v1.js').expect(200);
      const v2 = await request(server()).get('/widget.v2.js').expect(200);

      expect(v1.text.length).toBeGreaterThan(0);
      expect(v2.text).toContain('widget bundle v2');
    });
  });

  describe('embed snippet', () => {
    it('contains <script src="…/widget.v<version>.js?id=<publicId>">', async () => {
      const { token } = await createOwnerWithToken(ctx);
      const widget = await createWidget(ctx, token);

      expect(widget.snippet).toBe(
        `<script src="http://localhost:3000/widget.v1.js?id=${widget.publicId}"></script>`,
      );
    });

    it('two widgets → two distinct publicIds', async () => {
      const { token } = await createOwnerWithToken(ctx);
      const first = await createWidget(ctx, token);
      const second = await createWidget(ctx, token);

      expect(first.publicId).not.toBe(second.publicId);
      expect(first.snippet).not.toBe(second.snippet);
    });
  });
});
