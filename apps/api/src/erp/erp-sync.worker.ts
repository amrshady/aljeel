import { Inject, Injectable, OnModuleInit } from '@nestjs/common';
import {
  ErpSyncJobPayloadSchema,
  QUEUE_NAMES,
  type ErpSyncJobPayload,
  type QueueConsumer,
  type QueueMessage,
  type QueuePublisher,
} from '@aljeel/shared-types';
import { QUEUE_CONSUMER, QUEUE_PUBLISHER } from '../queue/queue.module';
import { ErpSyncService } from './erp-sync.service';
import { ERP_SYNC_JOB } from './erp.constants';

const DEV_SUPPLIER_IDS = ['supplier_a', 'supplier_b'];

@Injectable()
export class ErpSyncWorker implements OnModuleInit {
  constructor(
    private readonly erpSync: ErpSyncService,
    @Inject(QUEUE_PUBLISHER) private readonly publisher: QueuePublisher,
    @Inject(QUEUE_CONSUMER) private readonly consumer: QueueConsumer,
  ) {}

  async onModuleInit(): Promise<void> {
    await this.consumer.subscribe<ErpSyncJobPayload>(
      QUEUE_NAMES.ERP_SYNC,
      async (job: QueueMessage<ErpSyncJobPayload>) => {
        if (job.type !== ERP_SYNC_JOB) return;
        const payload = ErpSyncJobPayloadSchema.parse(job.payload);
        await this.erpSync.syncSupplier(payload.supplierId, 'system_erp_sync');
      },
    );

    if (process.env.ERP_SYNC_ON_STARTUP !== 'false') {
      for (const supplierId of DEV_SUPPLIER_IDS) {
        await this.publisher.publish(QUEUE_NAMES.ERP_SYNC, ERP_SYNC_JOB, { supplierId });
      }
    }
  }

  enqueueSupplierSync(supplierId: string): Promise<string> {
    return this.publisher.publish(QUEUE_NAMES.ERP_SYNC, ERP_SYNC_JOB, { supplierId });
  }
}
