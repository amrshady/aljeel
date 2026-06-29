import { Inject, Injectable, OnModuleInit } from '@nestjs/common';
import { QUEUE_NAMES, type QueueConsumer, type QueueMessage, type QueuePublisher } from '@aljeel/shared-types';
import { QUEUE_CONSUMER, QUEUE_PUBLISHER } from './queue.module';

export const EXAMPLE_JOB_TYPE = 'example.ping';

@Injectable()
export class ExampleWorkerService implements OnModuleInit {
  constructor(
    @Inject(QUEUE_PUBLISHER) private readonly publisher: QueuePublisher,
    @Inject(QUEUE_CONSUMER) private readonly consumer: QueueConsumer,
  ) {}

  async onModuleInit(): Promise<void> {
    await this.consumer.subscribe<{ message: string }>(
      QUEUE_NAMES.NOTIFICATIONS,
      async (job: QueueMessage<{ message: string }>) => {
        if (job.type !== EXAMPLE_JOB_TYPE) return;
        // No-op worker — proves round-trip in tests
      },
    );
  }

  async enqueueExample(message: string): Promise<string> {
    return this.publisher.publish(QUEUE_NAMES.NOTIFICATIONS, EXAMPLE_JOB_TYPE, { message });
  }
}
