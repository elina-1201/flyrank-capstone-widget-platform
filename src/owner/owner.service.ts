import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Owner } from './owner.entity';

@Injectable()
export class OwnerService {
    constructor(
        @InjectRepository(Owner)
        private readonly owners: Repository<Owner>,
    ) { }

    async create(input: { name: string; email: string; passwordHash: string }): Promise<Owner | null> {
        const email = input.email.toLowerCase();
        const existing = await this.owners.findOne({ where: { email } });
        if (existing) {
            // Silent no-op — never reveal that this email is already registered.
            return null;
        }

        const owner = this.owners.create({
            name: input.name,
            email,
            passwordHash: input.passwordHash,
        });
        return this.owners.save(owner);
    }

    async findById(id: string): Promise<Owner | null> {
        return this.owners.findOne({ where: { id } });
    }

    async findByEmail(email: string): Promise<Owner | null> {
        return this.owners.findOne({ where: { email } });
    }
}
