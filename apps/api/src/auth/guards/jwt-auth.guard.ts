import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { IS_PUBLIC_KEY } from '../decorators/public.decorator';
import { MockAuthProvider } from '../mock-auth.provider';
import type { AuthUser } from '../auth.types';

@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(
    private readonly authProvider: MockAuthProvider,
    private readonly reflector: Reflector,
  ) {}

  canActivate(context: ExecutionContext): boolean {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) {
      return true;
    }

    const request = context.switchToHttp().getRequest<{
      headers: Record<string, string | undefined>;
      user?: AuthUser;
    }>();

    const header = request.headers.authorization;
    if (!header?.startsWith('Bearer ')) {
      throw new UnauthorizedException({ code: 'UNAUTHORIZED', message: 'Missing bearer token.' });
    }

    const token = header.slice(7);
    const payload = this.authProvider.validateAccessToken(token);
    request.user = { ...payload, sub: payload.sub };
    return true;
  }
}
