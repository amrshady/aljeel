import { QUEUE_NAMES, type QueueConsumer, type QueueMessage, type QueuePublisher } from '@aljeel/shared-types';
import { v4 as uuidv4 } from 'uuid';

const MAX_RETRIES = 3;

interface InMemoryJob {
  message: QueueMessage;
  queue: string;
}

/**
 * In-memory queue for local dev and tests. Swap for RabbitMQ adapter in production.
 */
export class InMemoryQueue implements QueuePublisher, QueueConsumer {
  private readonly queues = new Map<string, InMemoryJob[]>();
  private readonly handlers = new Map<string, (message: QueueMessage) => Promise<void>>();
  private processing = false;

  async publish<T>(queue: string, type: string, payload: T): Promise<string> {
    const id = uuidv4();
    const message: QueueMessage<T> = {
      id,
      type,
      payload,
      attempts: 0,
      createdAt: new Date().toISOString(),
    };

    const jobs = this.queues.get(queue) ?? [];
    jobs.push({ message: message as QueueMessage, queue });
    this.queues.set(queue, jobs);
    void this.process();
    return id;
  }

  async subscribe<T>(
    queue: string,
    handler: (message: QueueMessage<T>) => Promise<void>,
  ): Promise<void> {
    this.handlers.set(queue, handler as (message: QueueMessage) => Promise<void>);
    void this.process();
  }

  async close(): Promise<void> {
    this.handlers.clear();
    this.queues.clear();
  }

  private async process(): Promise<void> {
    if (this.processing) return;
    this.processing = true;

    try {
      for (const [queue, jobs] of this.queues.entries()) {
        const handler = this.handlers.get(queue);
        if (!handler || jobs.length === 0) continue;

        while (jobs.length > 0) {
          const job = jobs.shift();
          if (!job) break;

          try {
            await handler(job.message);
          } catch {
            job.message.attempts += 1;
            if (job.message.attempts >= MAX_RETRIES) {
              const dlq = this.queues.get(QUEUE_NAMES.DEAD_LETTER) ?? [];
              dlq.push(job);
              this.queues.set(QUEUE_NAMES.DEAD_LETTER, dlq);
            } else {
              jobs.push(job);
            }
          }
        }
      }
    } finally {
      this.processing = false;
    }
  }
}
