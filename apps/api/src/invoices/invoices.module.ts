import { Module } from '@nestjs/common';
import { KbModule } from '../kb/kb.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { StorageModule } from '../storage/storage.module';
import { AsateelInvoiceManifestService } from './asateel-invoice-manifest.service';
import { InvoicesController } from './invoices.controller';
import { InvoicesService } from './invoices.service';

@Module({
  imports: [StorageModule, KbModule, NotificationsModule],
  controllers: [InvoicesController],
  providers: [InvoicesService, AsateelInvoiceManifestService],
  exports: [InvoicesService],
})
export class InvoicesModule {}
