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
// Hard ceiling on one dispatch. The notifier has its own (shorter) SMTP
// timeouts; this is a backstop so a transport that hangs for any other reason
// still fails fast instead of stalling the loop.
const DISPATCH_TIMEOUT_MS = 15_000;

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
        // Claim in a SHORT transaction, then dispatch OUTSIDE it. Holding the
        // transaction across the network call would leave the connection
        // `idle in transaction` for as long as the transport hangs, pinning a
        // lock on the claimed rows and blocking every later poll.
        const claimed = await this.claimDue();
        for (const event of claimed) {
            await this.dispatch(event);
        }
    }

    private async claimDue(): Promise<SubmissionEvent[]> {
        return this.eventRepo.manager.transaction(async (manager) => {
            const events = await manager.getRepository(SubmissionEvent).find({
                where: {
                    status: 'pending',
                    nextAttemptAt: LessThanOrEqual(new Date()),
                },
                order: { nextAttemptAt: 'ASC' },
                take: BATCH_SIZE,
                lock: { mode: 'pessimistic_write', onLocked: 'skip_locked' },
            });

            // Bump `next_attempt_at` as a claim marker so another poll (or
            // instance) does not pick the same rows up while we dispatch them.
            // The finalize step below resets it on success or to the backoff.
            const claimUntil = new Date(Date.now() + DISPATCH_TIMEOUT_MS);
            for (const event of events) {
                event.nextAttemptAt = claimUntil;
            }
            if (events.length > 0) {
                await manager.save(events);
            }
            return events;
        });
    }

    private async dispatch(event: SubmissionEvent): Promise<void> {
        try {
            await this.withTimeout(this.notifier.notify(event));
            await this.finalize(event.id, (fresh) => {
                fresh.status = 'sent';
                fresh.lastError = null;
            });
        } catch (error) {
            await this.finalize(event.id, (fresh) => this.applyFailure(fresh, error));
        }
    }

    private async finalize(
        id: string,
        mutate: (event: SubmissionEvent) => void,
    ): Promise<void> {
        try {
            await this.eventRepo.manager.transaction(async (manager) => {
                const fresh = await manager.findOne(SubmissionEvent, {
                    where: { id },
                    lock: { mode: 'pessimistic_write' },
                });
                if (!fresh) {
                    return;
                }
                mutate(fresh);
                await manager.save(fresh);
            });
        } catch (error) {
            // Log only — a failed finalize must not abort the rest of the batch.
            this.logger.error(
                `failed to finalize submission event ${id}: ${message(error)}`,
            );
        }
    }

    private withTimeout<T>(promise: Promise<T>): Promise<T> {
        return new Promise<T>((resolve, reject) => {
            const timer = setTimeout(
                () =>
                    reject(
                        new Error(`dispatch timed out after ${DISPATCH_TIMEOUT_MS}ms`),
                    ),
                DISPATCH_TIMEOUT_MS,
            );
            promise.then(
                (value) => {
                    clearTimeout(timer);
                    resolve(value);
                },
                (error: unknown) => {
                    clearTimeout(timer);
                    reject(error instanceof Error ? error : new Error(String(error)));
                },
            );
        });
    }

    private applyFailure(event: SubmissionEvent, error: unknown): void {
        const attempts = event.attempts + 1;
        const errorMessage = message(error);

        if (attempts >= MAX_ATTEMPTS) {
            event.attempts = attempts;
            event.lastError = errorMessage;
            event.status = 'failed';
            this.logger.error(
                `submission event ${event.id} failed after ${attempts} attempts: ${errorMessage}`,
            );
            return;
        }

        const backoffMs = Math.min(
            BASE_BACKOFF_MS * 2 ** (attempts - 1),
            MAX_BACKOFF_MS,
        );
        event.attempts = attempts;
        event.lastError = errorMessage;
        event.nextAttemptAt = new Date(Date.now() + backoffMs);
        this.logger.warn(
            `submission event ${event.id} attempt ${attempts} failed, retrying in ${backoffMs}ms: ${errorMessage}`,
        );
    }
}

function message(error: unknown): string {
    return error instanceof Error ? error.message : String(error);
}
