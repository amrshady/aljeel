import { Global, Injectable, Module, OnModuleDestroy } from '@nestjs/common';
import type { QueueConsumer, QueuePublisher } from '@aljeel/shared-types';
import { InMemoryQueue } from './in-memory.queue';

export const QUEUE_PUBLISHER = Symbol('QUEUE_PUBLISHER');
export const QUEUE_CONSUMER = Symbol('QUEUE_CONSUMER');

@Injectable()
export class QueueService implements OnModuleDestroy {
  private readonly queue = new InMemoryQueue();

  get publisher(): QueuePublisher {
    return this.queue;
  }

  get consumer(): QueueConsumer {
    return this.queue;
  }

  async onModuleDestroy(): Promise<void> {
    await this.queue.close();
  }
}

@Global()
@Module({
  providers: [
    QueueService,
    { provide: QUEUE_PUBLISHER, useFactory: (qs: QueueService) => qs.publisher, inject: [QueueService] },
    { provide: QUEUE_CONSUMER, useFactory: (qs: QueueService) => qs.consumer, inject: [QueueService] },
  ],
  exports: [QueueService, QUEUE_PUBLISHER, QUEUE_CONSUMER],
})
export class QueueModule {}
