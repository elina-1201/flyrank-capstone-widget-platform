import {
    CanActivate,
    ExecutionContext,
    Injectable,
    UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Request } from 'express';
import { Owner } from '../owner/owner.entity';
import { OwnerService } from '../owner/owner.service';

interface JwtPayload {
    sub?: string;
}

@Injectable()
export class JwtAuthGuard implements CanActivate {
    constructor(
        private readonly jwt: JwtService,
        private readonly owners: OwnerService,
    ) { }

    async canActivate(context: ExecutionContext): Promise<boolean> {
        const request = context.switchToHttp().getRequest<Request & { user?: Owner }>();
        const token = this.extractToken(request);
        if (!token) {
            throw this.unauthorized();
        }

        let payload: JwtPayload;
        try {
            payload = await this.jwt.verifyAsync<JwtPayload>(token);
        } catch {
            throw this.unauthorized();
        }

        const owner = payload.sub ? await this.owners.findById(payload.sub) : null;
        if (!owner) {
            throw this.unauthorized();
        }

        request.user = owner;
        return true;
    }

    private extractToken(request: Request): string | undefined {
        const [type, token] = request.headers.authorization?.split(' ') ?? [];
        return type === 'Bearer' ? token : undefined;
    }

    private unauthorized(): UnauthorizedException {
        return new UnauthorizedException({
            error: { code: 'UNAUTHORIZED', message: 'missing or invalid token' },
        });
    }
}
