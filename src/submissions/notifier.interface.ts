import { SubmissionEvent } from './submission-event.entity';

// The OutboxWorker dispatches through this so the transport (email, webhook)
// can be swapped without touching the worker.
export interface Notifier {
  notify(event: SubmissionEvent): Promise<void>;
}

export const NOTIFIER = Symbol('NOTIFIER');
