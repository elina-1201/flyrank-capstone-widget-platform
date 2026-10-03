import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtModule, JwtSignOptions } from '@nestjs/jwt';
import { OwnerModule } from '../owner/owner.module';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { JwtAuthGuard } from './jwt-auth.guard';

@Module({
    imports: [
        OwnerModule,
        JwtModule.registerAsync({
            inject: [ConfigService],
            useFactory: (config: ConfigService) => {
                const secret = config.get<string>('JWT_SECRET');
                if (!secret) {
                    throw new Error(
                        'Missing required environment variable "JWT_SECRET". ' +
                        'Add it to .env (see .env.example).',
                    );
                }
                const expiresIn = (config.get<string>('JWT_EXPIRES_IN') || '7d') as JwtSignOptions['expiresIn'];
                return {
                    secret,
                    signOptions: { expiresIn },
                };
            },
        }),
    ],
    controllers: [AuthController],
    providers: [AuthService, JwtAuthGuard],
    exports: [AuthService, JwtAuthGuard, JwtModule, OwnerModule],
})
export class AuthModule { }
