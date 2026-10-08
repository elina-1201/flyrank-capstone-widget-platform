import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { WidgetModule } from '../widgets/widget.module';
import { GeoService } from './geo.service';
import { MailpitNotifier } from './mailpit-notifier';
import { NOTIFIER } from './notifier.interface';
import { OutboxWorker } from './outbox-worker';
import { RateLimitService } from './rate-limit.service';
import { SubmissionEvent } from './submission-event.entity';
import { Submission } from './submission.entity';
import { SubmissionsController } from './submissions.controller';
import { SubmissionsService } from './submissions.service';

@Module({
    imports: [TypeOrmModule.forFeature([Submission, SubmissionEvent]), WidgetModule],
    controllers: [SubmissionsController],
    providers: [
        SubmissionsService,
        RateLimitService,
        GeoService,
        OutboxWorker,
        { provide: NOTIFIER, useClass: MailpitNotifier },
    ],
    exports: [TypeOrmModule, SubmissionsService],
})
export class SubmissionsModule { }
