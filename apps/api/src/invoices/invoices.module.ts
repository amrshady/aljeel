import { Module } from '@nestjs/common';
import { KbModule } from '../kb/kb.module';
import { StorageModule } from '../storage/storage.module';
import { AsateelInvoiceManifestService } from './asateel-invoice-manifest.service';
import { InvoicesController } from './invoices.controller';
import { InvoicesService } from './invoices.service';

@Module({
  imports: [StorageModule, KbModule],
  controllers: [InvoicesController],
  providers: [InvoicesService, AsateelInvoiceManifestService],
  exports: [InvoicesService],
})
export class InvoicesModule {}
