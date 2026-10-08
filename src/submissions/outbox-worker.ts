import { Inject, Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { InjectRepository } from '@nestjs/typeorm';
import { LessThanOrEqual, Repository } from 'typeorm';
import type { Notifier } from './notifier.interface';
import { NOTIFIER } from './notifier.interface';
import { SubmissionEvent } from './submission-event.entity';

const MAX_ATTEMPTS = 5;
const BASE_BACKOFF_MS = 10_000;
const MAX_BACKOFF_MS = 5 * 60_000;
const BATCH_SIZE = 20;

@Injectable()
export class OutboxWorker {
    private readonly logger = new Logger(OutboxWorker.name);

    constructor(
        @InjectRepository(SubmissionEvent)
        private readonly eventRepo: Repository<SubmissionEvent>,
        @Inject(NOTIFIER)
        private readonly notifier: Notifier,
    ) { }

    @Cron(CronExpression.EVERY_10_SECONDS)
    async processOutbox(): Promise<void> {
        // Claim + dispatch + finalize in one transaction so FOR UPDATE SKIP
        // LOCKED actually excludes rows another instance is working on.
        await this.eventRepo.manager.transaction(async (manager) => {
            const events = await manager.getRepository(SubmissionEvent).find({
                where: {
                    status: 'pending',
                    nextAttemptAt: LessThanOrEqual(new Date()),
                },
                order: { nextAttemptAt: 'ASC' },
                take: BATCH_SIZE,
                lock: { mode: 'pessimistic_write', onLocked: 'skip_locked' },
            });

            for (const event of events) {
                try {
                    await this.notifier.notify(event);
                    event.status = 'sent';
                    event.lastError = null;
                } catch (error) {
                    this.applyFailure(event, error);
                }
                await manager.save(event);
            }
        });
    }

    private applyFailure(event: SubmissionEvent, error: unknown): void {
        const attempts = event.attempts + 1;
        const message = error instanceof Error ? error.message : String(error);

        if (attempts >= MAX_ATTEMPTS) {
            event.attempts = attempts;
            event.lastError = message;
            event.status = 'failed';
            this.logger.error(
                `submission event ${event.id} failed after ${attempts} attempts: ${message}`,
            );
            return;
        }

        const backoffMs = Math.min(
            BASE_BACKOFF_MS * 2 ** (attempts - 1),
            MAX_BACKOFF_MS,
        );
        event.attempts = attempts;
        event.lastError = message;
        event.nextAttemptAt = new Date(Date.now() + backoffMs);
        this.logger.warn(
            `submission event ${event.id} attempt ${attempts} failed, retrying in ${backoffMs}ms: ${message}`,
        );
    }
}
