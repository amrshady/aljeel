import type { JwtPayload } from '@aljeel/shared-types';

export type AuthUser = JwtPayload & { sub: string };
