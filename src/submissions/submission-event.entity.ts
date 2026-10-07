import {
    Column,
    CreateDateColumn,
    Entity,
    Index,
    JoinColumn,
    ManyToOne,
    PrimaryGeneratedColumn,
} from 'typeorm';
import { Submission } from './submission.entity';

export const SUBMISSION_EVENT_TYPES = [
    'confirmation_email',
    'owner_notification',
    'webhook',
] as const;
export type SubmissionEventType = (typeof SUBMISSION_EVENT_TYPES)[number];

export const SUBMISSION_EVENT_STATUSES = ['pending', 'sent', 'failed'] as const;
export type SubmissionEventStatus = (typeof SUBMISSION_EVENT_STATUSES)[number];

@Entity('submission_events')
@Index(['status', 'nextAttemptAt'])
export class SubmissionEvent {
    @PrimaryGeneratedColumn('identity', { type: 'bigint' })
    id!: string;

    @Index()
    @Column({ type: 'uuid', name: 'submission_id' })
    submissionId!: string;

    @ManyToOne(() => Submission, { onDelete: 'CASCADE' })
    @JoinColumn({ name: 'submission_id' })
    submission!: Submission;

    @Column({ type: 'text' })
    type!: SubmissionEventType;

    @Column({ type: 'text', default: 'pending' })
    status!: SubmissionEventStatus;

    @Column({ type: 'jsonb' })
    payload!: Record<string, unknown>;

    @Column({ type: 'int', default: 0 })
    attempts!: number;

    @Column({ type: 'timestamptz', name: 'next_attempt_at' })
    nextAttemptAt!: Date;

    @Column({ type: 'text', nullable: true, name: 'last_error' })
    lastError!: string | null;

    @CreateDateColumn({ type: 'timestamptz', name: 'created_at' })
    createdAt!: Date;
}
