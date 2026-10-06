import {
    BadRequestException,
    Injectable,
    PayloadTooLargeException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { z } from 'zod';
import { WidgetService } from '../widgets/widget.service';
import { CreateSubmissionDto } from './dto/create-submission.dto';
import { GeoService } from './geo.service';
import { RateLimitService } from './rate-limit.service';
import { Submission } from './submission.entity';

const MAX_PAYLOAD_BYTES = 10 * 1024;

@Injectable()
export class SubmissionsService {
    constructor(
        @InjectRepository(Submission)
        private readonly submissionRepo: Repository<Submission>,
        private readonly widgetService: WidgetService,
        private readonly rateLimitService: RateLimitService,
        private readonly geoService: GeoService,
    ) { }

    async submit(
        dto: CreateSubmissionDto,
        ip: string,
        userAgent: string | undefined,
    ): Promise<{ id: string; status: string }> {
        this.assertPayloadSize(dto.payload);

        const widget = await this.widgetService.findById(dto.widgetId);

        // Honeypot filled → drop before insert, but keep the 201 shape (no row).
        if (dto.honeypot?.trim()) {
            return { id: dto.idempotencyKey, status: 'stored' };
        }

        const payload = this.validatePayload(widget.fields, dto.payload);
        const clientIp = this.normalizeIp(ip);

        this.rateLimitService.check(clientIp, widget.id);

        if (this.looksLikeSpam(payload, userAgent)) {
            return { id: dto.idempotencyKey, status: 'stored' };
        }

        const geo = await this.geoService.enrich(clientIp);

        const submission = this.submissionRepo.create({
            widgetId: widget.id,
            idempotencyKey: dto.idempotencyKey,
            payload,
            ipAddress: clientIp,
            userAgent: userAgent ?? null,
            countryCode: geo?.countryCode ?? null,
            region: geo?.region ?? null,
            city: geo?.city ?? null,
            geoProvider: geo?.geoProvider ?? null,
        });

        try {
            const saved = await this.submissionRepo.save(submission);
            return { id: saved.id, status: 'stored' };
        } catch (error) {
            if (isUniqueViolation(error)) {
                // Retried action happens once: return the row that owns this key.
                const existing = await this.submissionRepo.findOne({
                    where: { idempotencyKey: dto.idempotencyKey },
                });
                if (existing) {
                    return { id: existing.id, status: 'stored' };
                }
            }
            throw error;
        }
    }

    private assertPayloadSize(payload: Record<string, unknown>): void {
        const bytes = Buffer.byteLength(JSON.stringify(payload), 'utf8');
        if (bytes > MAX_PAYLOAD_BYTES) {
            throw new PayloadTooLargeException({
                error: { code: 'PAYLOAD_TOO_LARGE', message: 'payload too large' },
            });
        }
    }

    private validatePayload(
        fields: { name: string; required: boolean }[],
        payload: Record<string, unknown>,
    ): Record<string, unknown> {
        const shape: Record<string, z.ZodType> = {};
        for (const field of fields) {
            shape[field.name] = field.required
                ? z.string().min(1)
                : z.string().optional();
        }

        const parsed = z.object(shape).safeParse(payload);
        if (!parsed.success) {
            const message = parsed.error.issues
                .map((issue) => {
                    const field = issue.path.join('.') || 'payload';
                    const missing =
                        issue.code === 'too_small' ||
                        (issue.code === 'invalid_type' &&
                            (issue.input === undefined || issue.input === null));
                    return missing
                        ? `${field} is required`
                        : `${field}: ${issue.message}`;
                })
                .join('; ');
            throw new BadRequestException({
                error: { code: 'VALIDATION_FAILED', message },
            });
        }

        // z.object strips unknown keys by default (mode 'strip').
        return parsed.data;
    }

    private looksLikeSpam(
        payload: Record<string, unknown>,
        userAgent: string | undefined,
    ): boolean {
        const text =
            Object.values(payload)
                .filter((value): value is string => typeof value === 'string')
                .join(' ') +
            ' ' +
            (userAgent ?? '');
        // Humans rarely paste 3+ URLs into a lead form; bots do.
        return (text.match(/https?:\/\//gi)?.length ?? 0) >= 3;
    }

    private normalizeIp(ip: string): string {
        return ip.startsWith('::ffff:') ? ip.slice(7) : ip;
    }
}

function isUniqueViolation(error: unknown): boolean {
    const candidate = error as {
        code?: string;
        driverError?: { code?: string };
    };
    return candidate.code === '23505' || candidate.driverError?.code === '23505';
}
