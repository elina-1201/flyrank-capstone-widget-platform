import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuthModule } from '../auth/auth.module';
import { WidgetController } from './widget.controller';
import { Widget } from './widget.entity';
import { WidgetService } from './widget.service';

@Module({
  imports: [TypeOrmModule.forFeature([Widget]), AuthModule],
  controllers: [WidgetController],
  providers: [WidgetService],
  exports: [TypeOrmModule, WidgetService],
})
export class WidgetModule {}
