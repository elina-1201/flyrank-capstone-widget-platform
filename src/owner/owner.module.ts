import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { OwnerController } from './owner.controller';
import { Owner } from './owner.entity';
import { OwnerService } from './owner.service';

@Module({
    imports: [TypeOrmModule.forFeature([Owner])],
    controllers: [OwnerController],
    providers: [OwnerService],
    exports: [OwnerService],
})
export class OwnerModule { }
