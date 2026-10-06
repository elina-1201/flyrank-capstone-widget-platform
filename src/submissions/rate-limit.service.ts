import {
    HttpException,
    HttpStatus,
    Injectable,
    OnModuleDestroy,
} from '@nestjs/common';

const RATE_LIMIT_WINDOW_MS = 60_000;
const RATE_LIMIT_MAX_PER_IP = 10;
const RATE_LIMIT_MAX_PER_WIDGET = 100;

interface Bucket {
    count: number;
    resetAt: number;
}

@Injectable()
export class RateLimitService implements OnModuleDestroy {
    private readonly buckets = new Map<string, Bucket>();
    private readonly sweep: NodeJS.Timeout;

    constructor() {
        this.sweep = setInterval(
            () => this.pruneExpired(),
            RATE_LIMIT_WINDOW_MS,
        );
        this.sweep.unref?.();
    }

    onModuleDestroy(): void {
        clearInterval(this.sweep);
    }

    check(ip: string, widgetId: string): void {
        this.hit(`ip:${ip}`, RATE_LIMIT_MAX_PER_IP);
        this.hit(`widget:${widgetId}`, RATE_LIMIT_MAX_PER_WIDGET);
    }

    private hit(key: string, max: number): void {
        const now = Date.now();
        const bucket = this.buckets.get(key);

        if (!bucket || bucket.resetAt <= now) {
            this.buckets.set(key, {
                count: 1,
                resetAt: now + RATE_LIMIT_WINDOW_MS,
            });
            return;
        }

        bucket.count += 1;
        if (bucket.count > max) {
            throw new HttpException(
                {
                    error: {
                        code: 'RATE_LIMITED',
                        message: 'rate limit exceeded',
                    },
                },
                HttpStatus.TOO_MANY_REQUESTS,
            );
        }
    }

    private pruneExpired(): void {
        const now = Date.now();
        for (const [key, bucket] of this.buckets) {
            if (bucket.resetAt <= now) {
                this.buckets.delete(key);
            }
        }
    }
}
