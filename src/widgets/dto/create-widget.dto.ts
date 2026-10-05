import { Type } from 'class-transformer';
import {
  IsArray,
  IsBoolean,
  IsIn,
  IsNotEmpty,
  IsObject,
  IsOptional,
  IsString,
  MaxLength,
  ValidateNested,
} from 'class-validator';
import type { WidgetType } from '../widget.entity';
import { WIDGET_TYPES } from '../widget.entity';

export class WidgetFieldDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  name!: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  label!: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(50)
  type!: string;

  @IsBoolean()
  required!: boolean;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  placeholder?: string;
}

export class CreateWidgetDto {
  @IsIn([...WIDGET_TYPES])
  type!: WidgetType;

  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  title!: string;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  description?: string;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => WidgetFieldDto)
  fields!: WidgetFieldDto[];

  @IsOptional()
  @IsString()
  @MaxLength(100)
  buttonText?: string;

  @IsOptional()
  @IsObject()
  displayOptions?: Record<string, unknown>;
}
