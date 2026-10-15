import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Transporter } from 'nodemailer';
import nodemailer from 'nodemailer';
import { Notifier } from './notifier.interface';
import { SubmissionEvent } from './submission-event.entity';

// Nodemailer's defaults wait on the OS TCP timeouts (minutes) when the SMTP host
// is unreachable. The outbox worker bounds each dispatch, so a hang here would
// stall the whole retry loop — these bounds turn "host is down" into a fast,
// recordable failure instead.
const SMTP_CONNECTION_TIMEOUT_MS = 5_000;
const SMTP_GREETING_TIMEOUT_MS = 5_000;
const SMTP_SOCKET_TIMEOUT_MS = 10_000;

@Injectable()
export class MailpitNotifier implements Notifier {
  private readonly logger = new Logger(MailpitNotifier.name);
  private readonly from: string;
  private transporter: Transporter | null;

  constructor(config: ConfigService) {
    const host = config.get<string>('SMTP_HOST');
    const rawPort = config.get<string>('SMTP_PORT');
    const port = rawPort ? Number(rawPort) : undefined;
    this.from = config.get<string>('SMTP_FROM') ?? 'no-reply@example.com';

    if (!host || !port) {
      this.transporter = null;
      this.logger.warn(
        'SMTP_HOST/SMTP_PORT missing — email notifications are disabled',
      );
      return;
    }

    // Mailpit speaks plain SMTP, so TLS is off.
    this.transporter = nodemailer.createTransport({
      host,
      port,
      secure: false,
      connectionTimeout: SMTP_CONNECTION_TIMEOUT_MS,
      greetingTimeout: SMTP_GREETING_TIMEOUT_MS,
      socketTimeout: SMTP_SOCKET_TIMEOUT_MS,
    });
  }

  async notify(event: SubmissionEvent): Promise<void> {
    if (!this.transporter) {
      throw new Error('SMTP not configured (SMTP_HOST/SMTP_PORT missing)');
    }

    const { to, subject, body } = event.payload as {
      to?: string;
      subject?: string;
      body?: string;
    };
    if (!to) {
      throw new Error(`submission event ${event.id} has no recipient`);
    }

    await this.transporter.sendMail({
      from: this.from,
      to,
      subject,
      text: body,
    });
  }
}
