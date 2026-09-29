import { Body, Controller, Post } from '@nestjs/common';
import { RegisterOwnerDto } from './dto/register-owner.dto';
import { OwnerService } from './owner.service';

@Controller('api/v1/auth')
export class OwnerController {
    constructor(private readonly ownerService: OwnerService) { }

    @Post('register')
    async register(@Body() dto: RegisterOwnerDto) {
        const owner = await this.ownerService.register(dto);
        // TODO: issue a JWT and return `token` per DESIGN.md's
        // `POST /api/v1/auth/register` contract.
        return { owner };
    }
}
