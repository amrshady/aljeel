import type { AuthIdentity } from '@aljeel/shared-types';

export type AuthUser = AuthIdentity & { id: string };
