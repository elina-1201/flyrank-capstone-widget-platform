import { NestExpressApplication } from '@nestjs/platform-express';
import { Test, TestingModuleBuilder } from '@nestjs/testing';
import { DataSource } from 'typeorm';
import { AppModule } from '../../src/app.module';
import { configureApp } from '../../src/configure-app';
import { OutboxWorker } from '../../src/submissions/outbox-worker';

export interface TestApp {
  app: NestExpressApplication;
  dataSource: DataSource;
  close(): Promise<void>;
}

export interface TestAppOptions {
  /**
   * Keep the real `@Cron` worker instead of the no-op stub. Use this when a
   * test needs to drive `processOutbox()` itself (e.g. notifier failure).
   */
  realOutboxWorker?: boolean;
  /** Extra provider overrides applied on top of the default wiring. */
  configure?: (builder: TestingModuleBuilder) => TestingModuleBuilder;
}

/**
 * Boots the real AppModule with the same runtime configuration as `main.ts`
 * (global pipes, interceptor, CORS, static assets) so e2e tests exercise the
 * production wiring.
 *
 * By default the `@Cron` outbox worker is replaced with a no-op: its 10s timer
 * would race the assertions. The worker's own behaviour is covered by
 * `outbox.worker.spec.ts`; pass `realOutboxWorker: true` to drive it manually.
 */
export async function createTestApp(
  options: TestAppOptions = {},
): Promise<TestApp> {
  let builder = Test.createTestingModule({ imports: [AppModule] });

  if (!options.realOutboxWorker) {
    builder = builder
      .overrideProvider(OutboxWorker)
      .useValue({ processOutbox: async () => undefined });
  }
  if (options.configure) {
    builder = options.configure(builder);
  }

  const moduleRef = await builder.compile();

  const app = moduleRef.createNestApplication<NestExpressApplication>();
  configureApp(app);
  await app.init();

  const dataSource = app.get(DataSource);
  return {
    app,
    dataSource,
    close: () => app.close(),
  };
}

/** Wipes all domain tables between tests, resetting identity sequences. */
export async function truncateAll(dataSource: DataSource): Promise<void> {
  await dataSource.query(
    'TRUNCATE TABLE submission_events, submissions, widgets, owners RESTART IDENTITY CASCADE',
  );
}
