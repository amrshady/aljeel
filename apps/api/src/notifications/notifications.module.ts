import { Module } from '@nestjs/common';
import { EmailService } from './email.service';
import { InvoiceSubmitNotificationService } from './invoice-submit-notification.service';
import { SignatureNotificationService } from './signature-notification.service';

@Module({
  providers: [EmailService, InvoiceSubmitNotificationService, SignatureNotificationService],
  exports: [EmailService, InvoiceSubmitNotificationService, SignatureNotificationService],
})
export class NotificationsModule {}
