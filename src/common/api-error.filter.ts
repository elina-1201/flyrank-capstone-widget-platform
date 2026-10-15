import { ArgumentsHost, Catch, HttpException } from '@nestjs/common';
import { BaseExceptionFilter } from '@nestjs/core';
import type { Response } from 'express';

/**
 * DESIGN.md requires every non-2xx response to be { error: { code, message } }. 
 * This filter delegates enveloped exceptions to Nest's default handling and
 * reshapes everything else, so the contract holds for every failure path.
 */
@Catch()
export class ApiErrorFilter extends BaseExceptionFilter {
    catch(exception: unknown, host: ArgumentsHost): void {
        if (exception instanceof HttpException && !hasErrorEnvelope(exception)) {
            const status = exception.getStatus();
            const response = host.switchToHttp().getResponse<Response>();
            response.status(status).json({
                error: {
                    code: codeForStatus(status),
                    message: messageFor(exception.getResponse()),
                },
            });
            return;
        }

        super.catch(exception, host);
    }
}

function hasErrorEnvelope(exception: HttpException): boolean {
    const body = exception.getResponse() as { error?: { code?: unknown } };
    return (
        typeof body === 'object' &&
        body !== null &&
        typeof body.error === 'object' &&
        body.error !== null &&
        typeof body.error.code === 'string'
    );
}

function messageFor(body: unknown): string {
    if (typeof body === 'string') {
        return body;
    }
    const message = (body as { message?: unknown } | null)?.message;
    if (Array.isArray(message)) {
        return message.join('; ');
    }
    if (typeof message === 'string') {
        return message;
    }
    return 'request failed';
}

function codeForStatus(status: number): string {
    switch (status) {
        case 400:
            return 'BAD_REQUEST';
        case 401:
            return 'UNAUTHORIZED';
        case 403:
            return 'FORBIDDEN';
        case 404:
            return 'NOT_FOUND';
        case 405:
            return 'METHOD_NOT_ALLOWED';
        case 413:
            return 'PAYLOAD_TOO_LARGE';
        case 429:
            return 'RATE_LIMITED';
        default:
            return 'INTERNAL_ERROR';
    }
}
