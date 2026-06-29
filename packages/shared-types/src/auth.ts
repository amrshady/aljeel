import { z } from 'zod';
import { UserRoleSchema } from './index';

export const LoginRequestSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
});
export type LoginRequest = z.infer<typeof LoginRequestSchema>;

export const AuthTokensSchema = z.object({
  accessToken: z.string(),
  refreshToken: z.string(),
  expiresIn: z.number().int().positive(),
});
export type AuthTokens = z.infer<typeof AuthTokensSchema>;

export const JwtPayloadSchema = z.object({
  sub: z.string(),
  email: z.string().email(),
  role: UserRoleSchema,
  supplierId: z.string().nullable(),
  mfaVerified: z.boolean(),
});
export type JwtPayload = z.infer<typeof JwtPayloadSchema>;
