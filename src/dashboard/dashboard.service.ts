import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Submission } from '../submissions/submission.entity';
import { WidgetService } from '../widgets/widget.service';
import { ListSubmissionsQueryDto } from './dto/list-submissions-query.dto';

@Injectable()
export class DashboardService {
    constructor(
        @InjectRepository(Submission)
        private readonly submissionRepo: Repository<Submission>,
        private readonly widgetService: WidgetService,
    ) { }

    async listSubmissions(
        ownerId: string,
        widgetId: string,
        query: ListSubmissionsQueryDto,
    ) {
        // Ownership check first: a non-owned widget must 404, not leak its submissions.
        await this.widgetService.findOne(ownerId, widgetId);

        const { page, perPage } = query;
        const [rows, total] = await this.submissionRepo.findAndCount({
            where: { widgetId },
            order: { submittedAt: 'DESC' },
            skip: (page - 1) * perPage,
            take: perPage,
        });

        return {
            data: rows.map((row) => ({
                id: row.id,
                payload: row.payload,
                ip: row.ipAddress,
                countryCode: row.countryCode,
                city: row.city,
                geoProvider: row.geoProvider,
                submittedAt: row.submittedAt,
            })),
            page,
            perPage,
            total,
        };
    }

    async summary(ownerId: string) {
        const [totals, byWidget, byDay, byCountry] = await Promise.all([
            this.submissionRepo
                .createQueryBuilder('s')
                .innerJoin('s.widget', 'w')
                .where('w.owner_id = :ownerId', { ownerId })
                .getCount(),
            this.submissionRepo
                .createQueryBuilder('s')
                .innerJoin('s.widget', 'w')
                .select('w.id', 'widgetId')
                .addSelect('w.title', 'title')
                .addSelect('COUNT(*)::int', 'count')
                .where('w.owner_id = :ownerId', { ownerId })
                .groupBy('w.id')
                .addGroupBy('w.title')
                .orderBy('count', 'DESC')
                .getRawMany<{ widgetId: string; title: string; count: number }>(),
            this.submissionRepo
                .createQueryBuilder('s')
                .innerJoin('s.widget', 'w')
                .select("to_char(date_trunc('day', s.submitted_at), 'YYYY-MM-DD')", 'day')
                .addSelect('COUNT(*)::int', 'count')
                .where('w.owner_id = :ownerId', { ownerId })
                .groupBy('day')
                .orderBy('day', 'ASC')
                .getRawMany<{ day: string; count: number }>(),
            this.submissionRepo
                .createQueryBuilder('s')
                .innerJoin('s.widget', 'w')
                .select('s.country_code', 'countryCode')
                .addSelect('COUNT(*)::int', 'count')
                .where('w.owner_id = :ownerId', { ownerId })
                .groupBy('s.country_code')
                .orderBy('count', 'DESC')
                .getRawMany<{ countryCode: string | null; count: number }>(),
        ]);

        return {
            totals: { submissions: totals },
            byWidget,
            byDay,
            byCountry,
        };
    }
}
