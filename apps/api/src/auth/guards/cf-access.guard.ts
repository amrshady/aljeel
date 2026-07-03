import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { IS_PUBLIC_KEY } from '../decorators/public.decorator';
import { CfAccessService } from '../cf-access.service';
import { IdentityService } from '../identity.service';
import type { AuthUser } from '../auth.types';

@Injectable()
export class CfAccessGuard implements CanActivate {
  constructor(
    private readonly cfAccess: CfAccessService,
    private readonly identity: IdentityService,
    private readonly reflector: Reflector,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) {
      return true;
    }

    const request = context.switchToHttp().getRequest<{
      headers: Record<string, string | string[] | undefined>;
      user?: AuthUser;
    }>();

    const email = await this.cfAccess.resolveEmail(request.headers);
    request.user = await this.identity.resolveByEmail(email);
    return true;
  }
}
