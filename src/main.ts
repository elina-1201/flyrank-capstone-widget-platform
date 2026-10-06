import {
  BadRequestException,
  ClassSerializerInterceptor,
  ValidationError,
  ValidationPipe,
} from '@nestjs/common';
import { NestFactory, Reflector } from '@nestjs/core';
import { NestExpressApplication } from '@nestjs/platform-express';
import cors from 'cors';
import { join } from 'path';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule);

  // CORS is scoped to public routes only (bundle + config + future submissions); admin routes
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

  await app.listen(process.env.PORT ?? 3000);
}
bootstrap();
