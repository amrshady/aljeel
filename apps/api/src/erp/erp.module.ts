import { Module } from '@nestjs/common';
import { MockErpConnector } from './mock-erp.connector';
import { ErpSyncService } from './erp-sync.service';
import { ErpSyncWorker } from './erp-sync.worker';
import { ERP_CONNECTOR } from './erp.constants';

@Module({
  providers: [
    MockErpConnector,
    { provide: ERP_CONNECTOR, useExisting: MockErpConnector },
    ErpSyncService,
    ErpSyncWorker,
  ],
  exports: [ErpSyncService, ErpSyncWorker, ERP_CONNECTOR],
})
export class ErpModule {}
