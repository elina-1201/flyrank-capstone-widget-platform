import type { Notifier } from './notifier.interface';
import { OutboxWorker } from './outbox-worker';
import { SubmissionEvent } from './submission-event.entity';

// `@nestjs/schedule` ships as ESM, which the unit jest config (CommonJS) cannot
// load. The worker only uses the `@Cron` decorator and `CronExpression`, so a
// lightweight stub is enough to exercise the retry state machine.
jest.mock('@nestjs/schedule', () => ({
    Cron: () => () => undefined,
    CronExpression: { EVERY_10_SECONDS: '*/10 * * * * *' },
}));

/**
 * Unit tests for the outbox worker's claim → dispatch → finalize loop.
 * The repository/manager is faked so the test drives `processOutbox()` directly
 * and asserts the retry/backoff/failure state machine in isolation.
 */
function makeEvent(overrides: Partial<SubmissionEvent> = {}): SubmissionEvent {
    return {
        id: '1',
        submissionId: 'sub-1',
        type: 'confirmation_email',
        status: 'pending',
        payload: {},
        attempts: 0,
        nextAttemptAt: new Date(Date.now() - 1000),
        lastError: null,
        createdAt: new Date(),
        ...overrides,
    } as SubmissionEvent;
}

function makeWorker(events: SubmissionEvent[], notifier: Notifier) {
    const saved: SubmissionEvent[] = [];
    const manager = {
        getRepository: () => ({ find: async () => events }),
        findOne: async (_entity: unknown, options: { where: { id: string } }) =>
            events.find((event) => event.id === options.where.id) ?? null,
        save: async (event: SubmissionEvent | SubmissionEvent[]) => {
            if (Array.isArray(event)) {
                saved.push(...event);
            } else {
                saved.push(event);
            }
            return event;
        },
    };
    const eventRepo = {
        manager: {
            transaction: async (cb: (m: unknown) => unknown) => cb(manager),
        },
    };
    const worker = new OutboxWorker(eventRepo as never, notifier);
    return { worker, saved };
}

describe('OutboxWorker', () => {
    it('claims a due pending event and marks it sent', async () => {
        const event = makeEvent();
        const notifier: Notifier = {
            notify: jest.fn().mockResolvedValue(undefined),
        };
        const { worker, saved } = makeWorker([event], notifier);

        await worker.processOutbox();

        expect(notifier.notify).toHaveBeenCalledWith(event);
        expect(event.status).toBe('sent');
        expect(event.lastError).toBeNull();
        expect(saved).toContain(event);
    });

    it('on throw → attempts++, backoff, stays pending', async () => {
        const event = makeEvent({ attempts: 0 });
        const notifier: Notifier = {
            notify: jest.fn().mockRejectedValue(new Error('smtp down')),
        };
        const { worker } = makeWorker([event], notifier);

        const before = Date.now();
        await worker.processOutbox();

        expect(event.attempts).toBe(1);
        expect(event.status).toBe('pending');
        expect(event.lastError).toBe('smtp down');
        // First backoff is 10s into the future.
        expect(event.nextAttemptAt.getTime()).toBeGreaterThan(before + 9_000);
    });

    it('marks failed after MAX_ATTEMPTS (5)', async () => {
        const event = makeEvent({ attempts: 4 });
        const notifier: Notifier = {
            notify: jest.fn().mockRejectedValue(new Error('smtp down')),
        };
        const { worker } = makeWorker([event], notifier);

        await worker.processOutbox();

        expect(event.attempts).toBe(5);
        expect(event.status).toBe('failed');
        expect(event.lastError).toBe('smtp down');
    });

    it('a notifier that never settles still fails fast (does not hang the loop)', async () => {
        jest.useFakeTimers();
        try {
            const event = makeEvent({ attempts: 0 });
            // A transport that hangs instead of rejecting — the real-world case
            // when the SMTP host is unreachable and no timeout is set.
            const notifier: Notifier = {
                notify: jest.fn().mockReturnValue(new Promise(() => undefined)),
            };
            const { worker } = makeWorker([event], notifier);

            const run = worker.processOutbox();
            // Advance past the dispatch ceiling so the guard fires.
            await jest.advanceTimersByTimeAsync(20_000);
            await run;

            expect(event.attempts).toBe(1);
            expect(event.status).toBe('pending');
            expect(event.lastError).toContain('timed out');
        } finally {
            jest.useRealTimers();
        }
    });
});
