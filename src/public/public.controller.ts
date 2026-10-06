import { Controller, Get, Header, Param } from '@nestjs/common';
import { WidgetService } from '../widgets/widget.service';

@Controller()
export class PublicController {
  constructor(private readonly widgetService: WidgetService) {}

  @Get('api/v1/public/widgets/:publicId/config')
  @Header('Cache-Control', 'public, max-age=60')
  async config(@Param('publicId') publicId: string) {
    const widget = await this.widgetService.findByPublicId(publicId);
    return {
      id: widget.id,
      type: widget.type,
      title: widget.title,
      fields: widget.fields,
      buttonText: widget.buttonText,
      displayOptions: widget.displayOptions,
    };
  }
}
