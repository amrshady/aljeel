import { Injectable } from '@nestjs/common';
import { MockAuthProvider } from './mock-auth.provider';
import type { AuthMeResponse, AuthTokens, LoginRequest } from '@aljeel/shared-types';

@Injectable()
export class AuthService {
  constructor(private readonly provider: MockAuthProvider) {}

  login(dto: LoginRequest): AuthTokens {
    return this.provider.login(dto);
  }

  refresh(refreshToken: string): AuthTokens {
    return this.provider.refresh(refreshToken);
  }

  me(userId: string): AuthMeResponse {
    const user = this.provider.getUserById(userId);
    if (!user) {
      throw new Error('User not found');
    }
    return {
      id: user.id,
      email: user.email,
      fullName: user.fullName,
      role: user.role,
      supplierId: user.supplierId,
      mfaEnabled: user.mfaEnabled,
    };
  }
}
