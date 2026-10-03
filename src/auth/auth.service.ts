import { Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { scrypt as _scrypt, randomBytes, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';
import { RegisterOwnerDto } from '../owner/dto/register-owner.dto';
import { Owner } from '../owner/owner.entity';
import { OwnerService } from '../owner/owner.service';
import { LoginOwnerDto } from './dto/login-owner.dto';

const scrypt = promisify(_scrypt);

@Injectable()
export class AuthService {
    constructor(
        private readonly owners: OwnerService,
        private readonly jwt: JwtService,
    ) { }

    async register(dto: RegisterOwnerDto): Promise<{ status: string }> {
        // Hash always runs — the same work happens whether the email is new or
        // already registered, so timing does not leak account existence.
        await this.owners.create({
            name: dto.name,
            email: dto.email,
            passwordHash: await this.hashPassword(dto.password),
        });
        return { status: 'created' };
    }

    async login(dto: LoginOwnerDto): Promise<{ token: string }> {
        const owner = await this.owners.findByEmail(dto.email.toLowerCase());
        const valid = owner && (await this.verifyPassword(dto.password, owner.passwordHash));
        if (!valid) {
            throw new UnauthorizedException({
                error: { code: 'INVALID_CREDENTIALS', message: 'invalid email or password' },
            });
        }
        return { token: await this.signToken(owner) };
    }

    private async verifyPassword(password: string, stored: string): Promise<boolean> {
        const [scheme, salt, expectedHex] = stored.split(':');
        if (scheme !== 'scrypt' || !salt || !expectedHex) {
            return false;
        }
        const derived = (await scrypt(password, salt, 64)) as Buffer;
        const expected = Buffer.from(expectedHex, 'hex');
        return derived.length === expected.length && timingSafeEqual(derived, expected);
    }

    private signToken(owner: Owner): Promise<string> {
        return this.jwt.signAsync({ sub: owner.id });
    }

    private async hashPassword(password: string): Promise<string> {
        const salt = randomBytes(16).toString('hex');
        const derived = (await scrypt(password, salt, 64)) as Buffer;
        return `scrypt:${salt}:${derived.toString('hex')}`;
    }
}
