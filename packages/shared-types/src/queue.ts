export interface QueueMessage<T = unknown> {
  id: string;
  type: string;
  payload: T;
  attempts: number;
  createdAt: string;
}

export interface QueuePublisher {
  publish<T>(queue: string, type: string, payload: T): Promise<string>;
}

export interface QueueConsumer {
  subscribe<T>(
    queue: string,
    handler: (message: QueueMessage<T>) => Promise<void>,
  ): Promise<void>;
  close(): Promise<void>;
}

export const QUEUE_NAMES = {
  OCR: 'aljeel.ocr',
  MATCHING: 'aljeel.matching',
  ERP_SYNC: 'aljeel.erp-sync',
  NOTIFICATIONS: 'aljeel.notifications',
  DEAD_LETTER: 'aljeel.dead-letter',
} as const;
