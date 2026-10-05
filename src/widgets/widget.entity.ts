import {
  Check,
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { Owner } from '../owner/owner.entity';

export interface WidgetField {
  name: string;
  label: string;
  type: string;
  required: boolean;
  placeholder?: string;
}

export const WIDGET_TYPES = ['signup_form', 'cta', 'popover'] as const;
export type WidgetType = (typeof WIDGET_TYPES)[number];

@Entity('widgets')
@Check(`"type" IN ('signup_form', 'cta', 'popover')`)
export class Widget {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Index()
  @Column({ type: 'uuid', name: 'owner_id' })
  ownerId!: string;

  @ManyToOne(() => Owner, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'owner_id' })
  owner!: Owner;

  @Column({ type: 'varchar', length: 12, unique: true, name: 'public_id' })
  publicId!: string;

  @Column({ type: 'text' })
  type!: WidgetType;

  @Column({ type: 'text' })
  title!: string;

  @Column({ type: 'text', nullable: true })
  description!: string | null;

  @Column({ type: 'jsonb' })
  fields!: WidgetField[];

  @Column({ type: 'text', default: 'Submit', name: 'button_text' })
  buttonText!: string;

  @Column({
    type: 'jsonb',
    default: () => "'{}'",
    name: 'display_options',
  })
  displayOptions!: Record<string, unknown>;

  @CreateDateColumn({ type: 'timestamptz', name: 'created_at' })
  createdAt!: Date;

  @UpdateDateColumn({ type: 'timestamptz', name: 'updated_at' })
  updatedAt!: Date;
}
