import { Controller, Get, Param, Query, UseGuards } from '@nestjs/common';
import { CurrentOwner } from '../auth/current-owner.decorator';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { Owner } from '../owner/owner.entity';
import { DashboardService } from './dashboard.service';
import { ListSubmissionsQueryDto } from './dto/list-submissions-query.dto';

@Controller('api/v1')
@UseGuards(JwtAuthGuard)
export class DashboardController {
    constructor(private readonly dashboardService: DashboardService) { }

    @Get('widgets/:id/submissions')
    listSubmissions(
        @CurrentOwner() owner: Owner,
        @Param('id') id: string,
        @Query() query: ListSubmissionsQueryDto,
    ) {
        return this.dashboardService.listSubmissions(owner.id, id, query);
    }

    @Get('dashboard/summary')
    summary(@CurrentOwner() owner: Owner) {
        return this.dashboardService.summary(owner.id);
    }
}
