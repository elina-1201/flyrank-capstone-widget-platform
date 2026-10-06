import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { WidgetModule } from '../widgets/widget.module';
import { GeoService } from './geo.service';
import { RateLimitService } from './rate-limit.service';
import { Submission } from './submission.entity';
import { SubmissionsController } from './submissions.controller';
import { SubmissionsService } from './submissions.service';

@Module({
    imports: [TypeOrmModule.forFeature([Submission]), WidgetModule],
    controllers: [SubmissionsController],
    providers: [SubmissionsService, RateLimitService, GeoService],
    exports: [TypeOrmModule, SubmissionsService],
})
export class SubmissionsModule { }
