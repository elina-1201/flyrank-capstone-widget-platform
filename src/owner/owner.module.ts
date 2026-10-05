import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Owner } from './owner.entity';
import { OwnerService } from './owner.service';

@Module({
  imports: [TypeOrmModule.forFeature([Owner])],
  providers: [OwnerService],
  exports: [OwnerService],
})
export class OwnerModule {}
