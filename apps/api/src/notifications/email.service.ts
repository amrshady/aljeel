import { Injectable, Logger } from '@nestjs/common';
import nodemailer from 'nodemailer';
import type { Transporter } from 'nodemailer';

export interface SendEmailInput {
  to: string[];
  subject: string;
  text: string;
  html: string;
}

@Injectable()
export class EmailService {
  private readonly logger = new Logger(EmailService.name);
  private transporter: Transporter | null = null;

  isConfigured(): boolean {
    return Boolean(process.env.SMTP_HOST?.trim() && process.env.SMTP_FROM?.trim());
  }

  async sendMail(input: SendEmailInput): Promise<void> {
    const recipients = [...new Set(input.to.map((email) => email.trim().toLowerCase()).filter(Boolean))];
    if (recipients.length === 0) {
      return;
    }

    if (!this.isConfigured()) {
      this.logger.warn(
        { recipients, subject: input.subject },
        'SMTP is not configured; skipping email notification',
      );
      return;
    }

    const transporter = this.getTransporter();
    await transporter.sendMail({
      from: process.env.SMTP_FROM,
      to: recipients.join(', '),
      subject: input.subject,
      text: input.text,
      html: input.html,
    });
  }

  private getTransporter(): Transporter {
    if (this.transporter) {
      return this.transporter;
    }

    const host = process.env.SMTP_HOST!.trim();
    const port = Number(process.env.SMTP_PORT ?? 587);
    const secure = process.env.SMTP_SECURE === 'true' || port === 465;
    const user = process.env.SMTP_USER?.trim();
    const pass = process.env.SMTP_PASSWORD;

    this.transporter = nodemailer.createTransport({
      host,
      port,
      secure,
      auth: user ? { user, pass } : undefined,
    });

    return this.transporter;
  }
}
