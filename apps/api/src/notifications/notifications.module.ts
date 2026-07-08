import { Module } from '@nestjs/common';
import { EmailService } from './email.service';
import { InvoiceSubmitNotificationService } from './invoice-submit-notification.service';

@Module({
  providers: [EmailService, InvoiceSubmitNotificationService],
  exports: [EmailService, InvoiceSubmitNotificationService],
})
export class NotificationsModule {}
