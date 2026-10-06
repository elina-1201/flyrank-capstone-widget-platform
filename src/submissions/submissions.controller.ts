import { Body, Controller, Headers, Ip, Post } from '@nestjs/common';
import { CreateSubmissionDto } from './dto/create-submission.dto';
import { SubmissionsService } from './submissions.service';

@Controller('api/v1/public/submissions')
export class SubmissionsController {
    constructor(private readonly submissionsService: SubmissionsService) {}

    @Post()
    create(
        @Body() dto: CreateSubmissionDto,
        @Ip() ip: string,
        @Headers('user-agent') userAgent: string | undefined,
    ) {
        return this.submissionsService.submit(dto, ip, userAgent);
    }
}
