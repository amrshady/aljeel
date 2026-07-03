import { z } from 'zod';
import { UserRoleSchema } from './index';

export const AuthIdentitySchema = z.object({
  sub: z.string(),
  email: z.string().email(),
  fullName: z.string(),
  role: UserRoleSchema,
  supplierId: z.string().nullable(),
});
export type AuthIdentity = z.infer<typeof AuthIdentitySchema>;
