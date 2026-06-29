import { describe, expect, it } from 'vitest';
import { InMemoryQueue } from './in-memory.queue';
import { QUEUE_NAMES } from '@aljeel/shared-types';

describe('InMemoryQueue', () => {
  it('round-trips a job through publish and subscribe', async () => {
    const queue = new InMemoryQueue();
    const received: string[] = [];

    await queue.subscribe<{ message: string }>(
      QUEUE_NAMES.NOTIFICATIONS,
      async (job) => {
        received.push(job.payload.message);
      },
    );

    await queue.publish(QUEUE_NAMES.NOTIFICATIONS, 'example.ping', { message: 'hello' });

    await new Promise((r) => setTimeout(r, 10));
    expect(received).toEqual(['hello']);
    await queue.close();
  });
});
