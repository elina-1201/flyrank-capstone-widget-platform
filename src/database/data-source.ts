import 'dotenv/config';
import { join } from 'path';
import 'reflect-metadata';
import { DataSource } from 'typeorm';
import { Owner } from '../owner/owner.entity';
import { SubmissionEvent } from '../submissions/submission-event.entity';
import { Submission } from '../submissions/submission.entity';
import { Widget } from '../widgets/widget.entity';

// Runs outside Nest (TypeORM CLI), so it loads .env itself via dotenv.
export default new DataSource({
  type: 'postgres',
  url: process.env.DATABASE_URL,
  entities: [Owner, Widget, Submission, SubmissionEvent],
  migrations: [join(__dirname, 'migrations', '*{.ts,.js}')],
  synchronize: false,
});
