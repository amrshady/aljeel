import { Injectable } from '@nestjs/common';
import type { AuthMeResponse } from '@aljeel/shared-types';
import type { AuthUser } from './auth.types';
import { IdentityService } from './identity.service';

@Injectable()
export class AuthService {
  constructor(private readonly identity: IdentityService) {}

  me(user: AuthUser): AuthMeResponse {
    return this.identity.toAuthMe(user);
  }
}
