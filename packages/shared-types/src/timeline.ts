import { z } from 'zod';
import { InvoiceSchema } from './invoice';

export const InvoiceTimelineEventSchema = z.object({
  id: z.string(),
  action: z.string(),
  actorId: z.string().nullable(),
  before: z.record(z.unknown()).nullable(),
  after: z.record(z.unknown()).nullable(),
  createdAt: z.string(),
});
export type InvoiceTimelineEvent = z.infer<typeof InvoiceTimelineEventSchema>;

export const InvoiceDetailSchema = InvoiceSchema.extend({
  timeline: z.array(InvoiceTimelineEventSchema),
});
export type InvoiceDetail = z.infer<typeof InvoiceDetailSchema>;
