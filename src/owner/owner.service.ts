import { ConflictException, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { scrypt as _scrypt, randomBytes } from 'node:crypto';
import { promisify } from 'node:util';
import { Repository } from 'typeorm';
import { RegisterOwnerDto } from './dto/register-owner.dto';
import { Owner } from './owner.entity';

const scrypt = promisify(_scrypt);

@Injectable()
export class OwnerService {
    constructor(
        @InjectRepository(Owner)
        private readonly owners: Repository<Owner>,
    ) { }

    async register(dto: RegisterOwnerDto): Promise<Owner> {
        const email = dto.email.toLowerCase();
        const existing = await this.owners.findOne({ where: { email } });
        if (existing) {
            throw new ConflictException({
                error: { code: 'EMAIL_TAKEN', message: 'email already registered' },
            });
        }

        const owner = this.owners.create({
            name: dto.name,
            email,
            passwordHash: await this.hashPassword(dto.password),
        });
        return this.owners.save(owner);
    }

    async findById(id: string): Promise<Owner | null> {
        return this.owners.findOne({ where: { id } });
    }

    private async hashPassword(password: string): Promise<string> {
        const salt = randomBytes(16).toString('hex');
        const derived = (await scrypt(password, salt, 64)) as Buffer;
        return `scrypt:${salt}:${derived.toString('hex')}`;
    }
}
