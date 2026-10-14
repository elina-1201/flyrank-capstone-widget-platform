import request from 'supertest';
import {
    createOwnerWithToken,
    createWidget,
    widgetPayload,
} from './utils/helpers';
import { createTestApp, TestApp, truncateAll } from './utils/test-app';

describe('Widgets (e2e)', () => {
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

    describe('CRUD happy path', () => {
        it('create → 201 with widget + embed snippet', async () => {
            const { token } = await createOwnerWithToken(ctx);
            const res = await request(server())
                .post('/api/v1/widgets')
                .set('Authorization', `Bearer ${token}`)
                .send(widgetPayload())
                .expect(201);

            expect(res.body.widget.id).toEqual(expect.any(String));
            expect(res.body.widget.publicId).toHaveLength(12);
            expect(res.body.widget.type).toBe('signup_form');
            expect(res.body.snippet).toMatch(
                /^<script src=".*\/widget\.v1\.js\?id=[A-Za-z0-9_-]{12}"><\/script>$/,
            );
            expect(res.body.snippet).toContain(res.body.widget.publicId);
        });

        it('list → only the owner\'s widgets', async () => {
            const { token } = await createOwnerWithToken(ctx);
            await createWidget(ctx, token, { title: 'First' });
            await createWidget(ctx, token, { title: 'Second' });

            const res = await request(server())
                .get('/api/v1/widgets')
                .set('Authorization', `Bearer ${token}`)
                .expect(200);

            expect(Array.isArray(res.body)).toBe(true);
            expect(res.body).toHaveLength(2);
            expect(res.body.map((w: { title: string }) => w.title).sort()).toEqual([
                'First',
                'Second',
            ]);
        });

        it('get one → 200 with the widget', async () => {
            const { token } = await createOwnerWithToken(ctx);
            const widget = await createWidget(ctx, token);

            const res = await request(server())
                .get(`/api/v1/widgets/${widget.id}`)
                .set('Authorization', `Bearer ${token}`)
                .expect(200);

            expect(res.body.widget.id).toBe(widget.id);
            expect(res.body.widget.publicId).toBe(widget.publicId);
        });

        it('patch → 200 with updated fields', async () => {
            const { token } = await createOwnerWithToken(ctx);
            const widget = await createWidget(ctx, token);

            const res = await request(server())
                .patch(`/api/v1/widgets/${widget.id}`)
                .set('Authorization', `Bearer ${token}`)
                .send({ title: 'Renamed', buttonText: 'Go' })
                .expect(200);

            expect(res.body.widget.title).toBe('Renamed');
            expect(res.body.widget.buttonText).toBe('Go');
            // PATCH must not clobber identity fields.
            expect(res.body.widget.id).toBe(widget.id);
            expect(res.body.widget.publicId).toBe(widget.publicId);
        });

        it('delete → 204, then get → 404', async () => {
            const { token } = await createOwnerWithToken(ctx);
            const widget = await createWidget(ctx, token);

            await request(server())
                .delete(`/api/v1/widgets/${widget.id}`)
                .set('Authorization', `Bearer ${token}`)
                .expect(204);

            await request(server())
                .get(`/api/v1/widgets/${widget.id}`)
                .set('Authorization', `Bearer ${token}`)
                .expect(404);
        });
    });

    describe('validation & not-found', () => {
        it('invalid type → 400', async () => {
            const { token } = await createOwnerWithToken(ctx);
            const res = await request(server())
                .post('/api/v1/widgets')
                .set('Authorization', `Bearer ${token}`)
                .send(widgetPayload({ type: 'banner' }))
                .expect(400);

            expect(res.body.error.code).toBe('VALIDATION_FAILED');
        });

        it('missing required fields → 400', async () => {
            const { token } = await createOwnerWithToken(ctx);
            const res = await request(server())
                .post('/api/v1/widgets')
                .set('Authorization', `Bearer ${token}`)
                .send({ type: 'cta' })
                .expect(400);

            expect(res.body.error.code).toBe('VALIDATION_FAILED');
        });

        it('unknown id → 404 WIDGET_NOT_FOUND', async () => {
            const { token } = await createOwnerWithToken(ctx);
            const res = await request(server())
                .get('/api/v1/widgets/00000000-0000-4000-8000-000000000000')
                .set('Authorization', `Bearer ${token}`)
                .expect(404);

            expect(res.body.error.code).toBe('WIDGET_NOT_FOUND');
        });
    });

    describe('tenant isolation', () => {
        it("A cannot GET/PATCH/DELETE B's widget → 404 WIDGET_NOT_FOUND", async () => {
            const a = await createOwnerWithToken(ctx);
            const b = await createOwnerWithToken(ctx);
            const bWidget = await createWidget(ctx, b.token);

            const get = await request(server())
                .get(`/api/v1/widgets/${bWidget.id}`)
                .set('Authorization', `Bearer ${a.token}`)
                .expect(404);
            expect(get.body.error.code).toBe('WIDGET_NOT_FOUND');

            const patch = await request(server())
                .patch(`/api/v1/widgets/${bWidget.id}`)
                .set('Authorization', `Bearer ${a.token}`)
                .send({ title: 'hijacked' })
                .expect(404);
            expect(patch.body.error.code).toBe('WIDGET_NOT_FOUND');

            const del = await request(server())
                .delete(`/api/v1/widgets/${bWidget.id}`)
                .set('Authorization', `Bearer ${a.token}`)
                .expect(404);
            expect(del.body.error.code).toBe('WIDGET_NOT_FOUND');

            // B's widget is untouched.
            const stillThere = await request(server())
                .get(`/api/v1/widgets/${bWidget.id}`)
                .set('Authorization', `Bearer ${b.token}`)
                .expect(200);
            expect(stillThere.body.widget.title).not.toBe('hijacked');
        });

        it("A's list never includes B's widgets", async () => {
            const a = await createOwnerWithToken(ctx);
            const b = await createOwnerWithToken(ctx);
            await createWidget(ctx, a.token, { title: 'A widget' });
            const bWidget = await createWidget(ctx, b.token, { title: 'B widget' });

            const res = await request(server())
                .get('/api/v1/widgets')
                .set('Authorization', `Bearer ${a.token}`)
                .expect(200);

            const ids = res.body.map((w: { id: string }) => w.id);
            expect(ids).not.toContain(bWidget.id);
            expect(res.body).toHaveLength(1);
        });
    });
});
