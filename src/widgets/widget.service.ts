import { Injectable, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { nanoid } from 'nanoid';
import { Repository } from 'typeorm';
import { CreateWidgetDto } from './dto/create-widget.dto';
import { UpdateWidgetDto } from './dto/update-widget.dto';
import { Widget } from './widget.entity';

@Injectable()
export class WidgetService {
  constructor(
    @InjectRepository(Widget)
    private readonly widgetRepo: Repository<Widget>,
    private readonly config: ConfigService,
  ) {}

  async create(ownerId: string, dto: CreateWidgetDto) {
    const widget = this.widgetRepo.create({
      ownerId,
      publicId: nanoid(12),
      type: dto.type,
      title: dto.title,
      description: dto.description ?? null,
      fields: dto.fields,
      buttonText: dto.buttonText ?? 'Submit',
      displayOptions: dto.displayOptions ?? {},
    });
    const savedWidget = await this.widgetRepo.save(widget);
    return { widget: savedWidget, snippet: this.snippet(savedWidget.publicId) };
  }

  async list(ownerId: string) {
    const widgets = await this.widgetRepo.find({
      where: { ownerId },
      order: { createdAt: 'DESC' },
    });
    return widgets.map(({ id, publicId, type, title, createdAt }) => ({
      id,
      publicId,
      type,
      title,
      createdAt,
    }));
  }

  async findOne(ownerId: string, id: string) {
    return { widget: await this.getOwned(ownerId, id) };
  }

  async update(ownerId: string, id: string, dto: UpdateWidgetDto) {
    const widget = await this.getOwned(ownerId, id);
    // merge copies only keys present on the DTO (PATCH contract) and never touches id/ownerId/publicId; it relies on whitelist not emitting undefined for absent keys.
    this.widgetRepo.merge(widget, dto);
    return { widget: await this.widgetRepo.save(widget) };
  }

  async remove(ownerId: string, id: string): Promise<void> {
    const widget = await this.getOwned(ownerId, id);
    await this.widgetRepo.remove(widget);
  }

  async findByPublicId(publicId: string): Promise<Widget> {
    const widget = await this.widgetRepo.findOne({ where: { publicId } });
    if (!widget) {
      throw new NotFoundException({
        error: { code: 'WIDGET_NOT_FOUND', message: 'widget not found' },
      });
    }
    return widget;
  }

  private async getOwned(ownerId: string, id: string): Promise<Widget> {
    const widget = await this.widgetRepo.findOne({ where: { id, ownerId } });
    if (!widget) {
      throw new NotFoundException({
        error: { code: 'WIDGET_NOT_FOUND', message: 'widget not found' },
      });
    }
    return widget;
  }

  private snippet(publicId: string): string {
    // PUBLIC_BASE_URL = the origin this API is served from, e.g. https://widgets.example.com.
    // PASTE the production origin into .env before shipping; without it the snippet src is
    // relative and will not load on customer pages.
    const base =
      this.config.get<string>('PUBLIC_BASE_URL')?.replace(/\/+$/, '') ?? '';
    // WIDGET_BUNDLE_VERSION points at the bundle file under public/ (e.g. v1 → widget.v1.js).
    // Bump it when adding a new bundle file; old versions keep serving.
    const version = this.config.get<string>('WIDGET_BUNDLE_VERSION') ?? 'v1';
    return `<script src="${base}/widget.${version}.js?id=${publicId}"></script>`;
  }
}
