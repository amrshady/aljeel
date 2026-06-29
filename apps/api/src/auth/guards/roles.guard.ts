import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { UserRole } from '@aljeel/shared-types';
import { ROLES_KEY } from '../decorators/roles.decorator';
import type { AuthUser } from '../auth.types';

@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const required = this.reflector.getAllAndOverride<UserRole[]>(ROLES_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    if (!required?.length) {
      return true;
    }

    const request = context.switchToHttp().getRequest<{ user?: AuthUser }>();
    const user = request.user;
    if (!user || !required.includes(user.role)) {
      throw new ForbiddenException({ code: 'FORBIDDEN', message: 'Insufficient permissions.' });
    }

    return true;
  }
}
