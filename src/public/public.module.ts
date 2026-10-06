import { Module } from '@nestjs/common';
import { WidgetModule } from '../widgets/widget.module';
import { PublicController } from './public.controller';

@Module({
  imports: [WidgetModule],
  controllers: [PublicController],
})
export class PublicModule {}
