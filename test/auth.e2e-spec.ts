import { JwtService } from '@nestjs/jwt';
import request from 'supertest';
import { Owner } from '../src/owner/owner.entity';
import { registerOwner, uniqueOwner } from './utils/helpers';
import { createTestApp, TestApp, truncateAll } from './utils/test-app';

describe('Auth (e2e)', () => {
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

  describe('POST /api/v1/auth/register', () => {
    it('valid body → 201 { status: "created" }', async () => {
      const creds = uniqueOwner();
      const res = await request(server())
        .post('/api/v1/auth/register')
        .send(creds)
        .expect(201);

      expect(res.body).toEqual({ status: 'created' });

      const stored = await ctx.dataSource
        .getRepository(Owner)
        .findOne({ where: { email: creds.email } });
      expect(stored).not.toBeNull();
      // Password is never stored in the clear.
      expect(stored!.passwordHash).not.toContain(creds.password);
      expect(stored!.passwordHash.startsWith('scrypt:')).toBe(true);
    });

    it('duplicate email → same 201 { status: "created" } (anti-enumeration, no 409) and no second row', async () => {
      const creds = uniqueOwner();
      const first = await request(server())
        .post('/api/v1/auth/register')
        .send(creds)
        .expect(201);
      const second = await request(server())
        .post('/api/v1/auth/register')
        .send(creds)
        .expect(201);

      // Identical response — an attacker cannot tell the email already existed.
      expect(second.body).toEqual(first.body);
      expect(second.body).toEqual({ status: 'created' });

      const count = await ctx.dataSource
        .getRepository(Owner)
        .count({ where: { email: creds.email } });
      expect(count).toBe(1);
    });

    it('invalid body → 400 with the error envelope', async () => {
      const res = await request(server())
        .post('/api/v1/auth/register')
        .send({ name: 'x', email: 'not-an-email', password: 'short' })
        .expect(400);

      expect(res.body.error.code).toBe('VALIDATION_FAILED');
      expect(typeof res.body.error.message).toBe('string');
    });

    it('unknown/extra field → 400 (whitelist + forbidNonWhitelisted)', async () => {
      const res = await request(server())
        .post('/api/v1/auth/register')
        .send({ ...uniqueOwner(), isAdmin: true })
        .expect(400);

      expect(res.body.error.code).toBe('VALIDATION_FAILED');
    });
  });

  describe('POST /api/v1/auth/login', () => {
    it('valid credentials → 200 { token }', async () => {
      const creds = await registerOwner(ctx);
      const res = await request(server())
        .post('/api/v1/auth/login')
        .send({ email: creds.email, password: creds.password })
        .expect(200);

      expect(typeof res.body.token).toBe('string');
      expect(res.body.token.length).toBeGreaterThan(0);
    });

    it('wrong password → 401 INVALID_CREDENTIALS', async () => {
      const creds = await registerOwner(ctx);
      const res = await request(server())
        .post('/api/v1/auth/login')
        .send({ email: creds.email, password: 'wrong-password' })
        .expect(401);

      expect(res.body.error.code).toBe('INVALID_CREDENTIALS');
    });

    it('unknown email → 401 with the same response (anti-enumeration)', async () => {
      const creds = await registerOwner(ctx);
      const wrongPassword = await request(server())
        .post('/api/v1/auth/login')
        .send({ email: creds.email, password: 'wrong-password' })
        .expect(401);
      const unknownEmail = await request(server())
        .post('/api/v1/auth/login')
        .send({ email: 'nobody@example.com', password: 'wrong-password' })
        .expect(401);

      expect(unknownEmail.body).toEqual(wrongPassword.body);
      expect(unknownEmail.body.error.code).toBe('INVALID_CREDENTIALS');
    });
  });

  describe('JwtAuthGuard (protected route: GET /api/v1/widgets)', () => {
    it('no Authorization header → 401 UNAUTHORIZED envelope', async () => {
      const res = await request(server()).get('/api/v1/widgets').expect(401);
      expect(res.body.error.code).toBe('UNAUTHORIZED');
    });

    it('malformed token → 401', async () => {
      const res = await request(server())
        .get('/api/v1/widgets')
        .set('Authorization', 'Bearer not.a.jwt')
        .expect(401);
      expect(res.body.error.code).toBe('UNAUTHORIZED');
    });

    it('expired token → 401', async () => {
      const creds = await registerOwner(ctx);
      const owner = await ctx.dataSource
        .getRepository(Owner)
        .findOneOrFail({ where: { email: creds.email } });
      const jwt = ctx.app.get(JwtService);
      const expired = await jwt.signAsync(
        { sub: owner.id },
        { expiresIn: '-1s' },
      );

      const res = await request(server())
        .get('/api/v1/widgets')
        .set('Authorization', `Bearer ${expired}`)
        .expect(401);
      expect(res.body.error.code).toBe('UNAUTHORIZED');
    });

    it('wrong scheme (Basic …) → 401', async () => {
      const res = await request(server())
        .get('/api/v1/widgets')
        .set('Authorization', 'Basic dXNlcjpwYXNz')
        .expect(401);
      expect(res.body.error.code).toBe('UNAUTHORIZED');
    });

    it('valid token for a deleted owner → 401 (never 500)', async () => {
      const creds = await registerOwner(ctx);
      const owner = await ctx.dataSource
        .getRepository(Owner)
        .findOneOrFail({ where: { email: creds.email } });
      const jwt = ctx.app.get(JwtService);
      const token = await jwt.signAsync({ sub: owner.id });

      await ctx.dataSource.getRepository(Owner).delete({ id: owner.id });

      const res = await request(server())
        .get('/api/v1/widgets')
        .set('Authorization', `Bearer ${token}`)
        .expect(401);
      expect(res.body.error.code).toBe('UNAUTHORIZED');
    });
  });
});
