import {
  BadRequestException,
  ClassSerializerInterceptor,
  ValidationError,
  ValidationPipe,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Reflector } from '@nestjs/core';
import { NestExpressApplication } from '@nestjs/platform-express';
import cors from 'cors';
import { join } from 'path';

/**
 * Parses `TRUST_PROXY` into the value Express' `trust proxy` setting expects.
 * Unset/empty → `false` (do NOT trust `X-Forwarded-For`; safe default when the
 * app is exposed directly). `true`/`false` → boolean. A bare integer → hop
 * count. Anything else (e.g. `loopback`, a CIDR) is passed through verbatim.
 *
 * This matters for rate limiting: behind a reverse proxy/CDN, `req.ip` is the
 * proxy's address unless `trust proxy` is set, which would collapse every
 * visitor into one rate-limit bucket.
 */
function parseTrustProxy(raw: string | undefined): boolean | number | string {
  const value = raw?.trim();
  if (!value) {
    return false;
  }
  if (value === 'true') {
    return true;
  }
  if (value === 'false') {
    return false;
  }
  if (/^\d+$/.test(value)) {
    return Number(value);
  }
  return value;
}

/**
 * Applies the runtime configuration shared by the real server (`main.ts`) and
 * the e2e test harness. Keeping it in one place means tests exercise the exact
 * same pipes, interceptor, CORS policy and static-asset setup as production.
 */
export function configureApp(app: NestExpressApplication): void {
  // Honor X-Forwarded-For only when explicitly configured (TRUST_PROXY). Without
  // this, per-IP rate limiting behind a proxy would bucket every visitor together.
  const config = app.get(ConfigService);
  app.set('trust proxy', parseTrustProxy(config.get<string>('TRUST_PROXY')));

  // CORS is scoped to public routes only (bundle + config + submissions); admin routes
  // stay same-origin.
  const publicCors = cors({
    origin: true,
    methods: 'GET,POST,OPTIONS',
    allowedHeaders: 'Content-Type',
    maxAge: 86400,
  });
  app.use('/api/v1/public', publicCors);
  // Any /widget.vN.js bundle — the version is the file name under public/.
  app.use(/^\/widget\.v\d+\.js$/, publicCors);

  // Versioned bundles are static files (add widget.vN.js, old versions keep serving).
  // Served straight from the project's public/ dir, so adding a version needs no rebuild.
  app.useStaticAssets(join(process.cwd(), 'public'), {
    maxAge: '365d',
    immutable: true,
  });

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      transformOptions: { enableImplicitConversion: true },
      exceptionFactory: (errors: ValidationError[]) =>
        new BadRequestException({
          error: {
            code: 'VALIDATION_FAILED',
            message: errors
              .map((e) => Object.values(e.constraints ?? {}).join(', '))
              .join('; '),
          },
        }),
    }),
  );

  app.useGlobalInterceptors(new ClassSerializerInterceptor(app.get(Reflector)));
}
