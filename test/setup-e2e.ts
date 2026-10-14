// Runs before every e2e test file (jest `setupFiles`), so the environment is in
// place before AppModule — and therefore ConfigModule.forRoot — is imported.
// ConfigModule does not override variables already present in process.env, so
// these values win over the developer's .env file.

process.env.NODE_ENV = 'test';

// Point at a dedicated test database so tests never touch dev data.
process.env.DATABASE_URL =
  process.env.TEST_DATABASE_URL ??
  'postgres://postgres:postgres@localhost:5433/embedded_widget_test';

process.env.JWT_SECRET = 'test-jwt-secret';
process.env.JWT_EXPIRES_IN = '7d';
process.env.PUBLIC_BASE_URL = 'http://localhost:3000';
process.env.WIDGET_BUNDLE_VERSION = 'v1';

// Trust X-Forwarded-For in tests so a request can simulate a distinct client IP
// (supertest always connects from 127.0.0.1, which would otherwise share one
// rate-limit bucket).
process.env.TRUST_PROXY = 'true';

// Disable outbound email in tests; the notifier is mocked where it matters.
process.env.SMTP_HOST = '';
process.env.SMTP_PORT = '';
