import {
    Column,
    CreateDateColumn,
    Entity,
    Index,
    JoinColumn,
    ManyToOne,
    PrimaryGeneratedColumn,
} from 'typeorm';
import { Widget } from '../widgets/widget.entity';

@Entity('submissions')
@Index(['widgetId', 'submittedAt'])
export class Submission {
    @PrimaryGeneratedColumn('uuid')
    id!: string;

    @Column({ type: 'uuid', name: 'widget_id' })
    widgetId!: string;

    @ManyToOne(() => Widget, { onDelete: 'CASCADE' })
    @JoinColumn({ name: 'widget_id' })
    widget!: Widget;

    @Column({ type: 'uuid', unique: true, name: 'idempotency_key' })
    idempotencyKey!: string;

    @Column({ type: 'jsonb' })
    payload!: Record<string, unknown>;

    @Column({ type: 'inet', name: 'ip_address' })
    ipAddress!: string;

    @Column({ type: 'text', nullable: true, name: 'user_agent' })
    userAgent!: string | null;

    @Column({ type: 'char', length: 2, nullable: true, name: 'country_code' })
    countryCode!: string | null;

    @Column({ type: 'text', nullable: true })
    region!: string | null;

    @Column({ type: 'text', nullable: true })
    city!: string | null;

    @Column({ type: 'text', nullable: true, name: 'geo_provider' })
    geoProvider!: string | null;

    @CreateDateColumn({ type: 'timestamptz', name: 'submitted_at' })
    submittedAt!: Date;
}
