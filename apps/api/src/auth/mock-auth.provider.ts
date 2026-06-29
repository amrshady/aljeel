import { Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { UserRole, type AuthTokens, type JwtPayload, type LoginRequest } from '@aljeel/shared-types';
import { v4 as uuidv4 } from 'uuid';

interface DevUser {
  id: string;
  email: string;
  password: string;
  fullName: string;
  role: UserRole;
  supplierId: string | null;
  mfaEnabled: boolean;
}

interface MfaChallenge {
  userId: string;
  expiresAt: Date;
}

/**
 * Dev/mock auth provider — replace with Keycloak OIDC adapter (P0-E4-T1).
 * Never use in production.
 */
@Injectable()
export class MockAuthProvider {
  private readonly challenges = new Map<string, MfaChallenge>();

  private readonly users: DevUser[] = [
    {
      id: 'user_supplier_admin',
      email: 'admin@supplier-a.test',
      password: 'Password1!',
      fullName: 'Supplier A Admin',
      role: 'SUPPLIER_ADMIN',
      supplierId: 'supplier_a',
      mfaEnabled: true,
    },
    {
      id: 'user_supplier_b',
      email: 'admin@supplier-b.test',
      password: 'Password1!',
      fullName: 'Supplier B Admin',
      role: 'SUPPLIER_ADMIN',
      supplierId: 'supplier_b',
      mfaEnabled: true,
    },
    {
      id: 'user_ap_clerk',
      email: 'clerk@aljeel.test',
      password: 'Password1!',
      fullName: 'AP Clerk',
      role: 'AP_CLERK',
      supplierId: null,
      mfaEnabled: true,
    },
  ];

  constructor(private readonly jwt: JwtService) {}

  login(dto: LoginRequest): { challengeId: string; mfaRequired: true } {
    const user = this.users.find((u) => u.email === dto.email && u.password === dto.password);
    if (!user) {
      throw new UnauthorizedException({ code: 'INVALID_CREDENTIALS', message: 'Invalid email or password.' });
    }

    const challengeId = uuidv4();
    this.challenges.set(challengeId, {
      userId: user.id,
      expiresAt: new Date(Date.now() + 5 * 60 * 1000),
    });

    return { challengeId, mfaRequired: true as const };
  }

  verifyMfa(challengeId: string, code: string): AuthTokens {
    const challenge = this.challenges.get(challengeId);
    if (!challenge || challenge.expiresAt < new Date()) {
      throw new UnauthorizedException({ code: 'MFA_EXPIRED', message: 'MFA challenge expired.' });
    }

    if (code !== '000000') {
      throw new UnauthorizedException({ code: 'MFA_INVALID', message: 'Invalid MFA code.' });
    }

    this.challenges.delete(challengeId);
    const user = this.users.find((u) => u.id === challenge.userId);
    if (!user) {
      throw new UnauthorizedException();
    }

    return this.issueTokens(user);
  }

  refresh(refreshToken: string): AuthTokens {
    try {
      const payload = this.jwt.verify<JwtPayload & { type: string }>(refreshToken);
      if (payload.type !== 'refresh') {
        throw new UnauthorizedException();
      }
      const user = this.users.find((u) => u.id === payload.sub);
      if (!user) {
        throw new UnauthorizedException();
      }
      return this.issueTokens(user);
    } catch {
      throw new UnauthorizedException({ code: 'INVALID_TOKEN', message: 'Invalid refresh token.' });
    }
  }

  validateAccessToken(token: string): JwtPayload {
    try {
      const payload = this.jwt.verify<JwtPayload & { type?: string }>(token);
      if (payload.type === 'refresh') {
        throw new UnauthorizedException();
      }
      if (!payload.mfaVerified) {
        throw new UnauthorizedException({ code: 'MFA_REQUIRED', message: 'MFA verification required.' });
      }
      return payload;
    } catch {
      throw new UnauthorizedException({ code: 'INVALID_TOKEN', message: 'Invalid or expired token.' });
    }
  }

  getUserById(id: string): DevUser | undefined {
    return this.users.find((u) => u.id === id);
  }

  private issueTokens(user: DevUser): AuthTokens {
    const payload: JwtPayload = {
      sub: user.id,
      email: user.email,
      role: user.role,
      supplierId: user.supplierId,
      mfaVerified: true,
    };

    const accessToken = this.jwt.sign({ ...payload, type: 'access' }, { expiresIn: '1h' });
    const refreshToken = this.jwt.sign(
      { sub: user.id, email: user.email, role: user.role, supplierId: user.supplierId, mfaVerified: true, type: 'refresh' },
      { expiresIn: '7d' },
    );

    return { accessToken, refreshToken, expiresIn: 3600 };
  }
}
