import { IsObject, IsOptional, IsString, IsUUID } from 'class-validator';

export class CreateSubmissionDto {
    @IsUUID()
    widgetId!: string;

    @IsUUID()
    idempotencyKey!: string;

    @IsOptional()
    @IsString()
    honeypot?: string;

    @IsObject()
    payload!: Record<string, unknown>;
}
