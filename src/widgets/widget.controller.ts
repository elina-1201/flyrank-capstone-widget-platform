import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import { CurrentOwner } from '../auth/current-owner.decorator';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { Owner } from '../owner/owner.entity';
import { CreateWidgetDto } from './dto/create-widget.dto';
import { UpdateWidgetDto } from './dto/update-widget.dto';
import { WidgetService } from './widget.service';

@Controller('api/v1/widgets')
@UseGuards(JwtAuthGuard)
export class WidgetController {
  constructor(private readonly widgetService: WidgetService) {}

  @Post()
  create(@CurrentOwner() owner: Owner, @Body() dto: CreateWidgetDto) {
    return this.widgetService.create(owner.id, dto);
  }

  @Get()
  findAll(@CurrentOwner() owner: Owner) {
    return this.widgetService.list(owner.id);
  }

  @Get(':id')
  findOne(@CurrentOwner() owner: Owner, @Param('id') id: string) {
    return this.widgetService.findOne(owner.id, id);
  }

  @Patch(':id')
  update(
    @CurrentOwner() owner: Owner,
    @Param('id') id: string,
    @Body() dto: UpdateWidgetDto,
  ) {
    return this.widgetService.update(owner.id, id, dto);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  remove(@CurrentOwner() owner: Owner, @Param('id') id: string) {
    return this.widgetService.remove(owner.id, id);
  }
}
