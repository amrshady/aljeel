import { Global, Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { CfAccessService } from './cf-access.service';
import { IdentityService } from './identity.service';
import { CfAccessGuard } from './guards/cf-access.guard';
import { RolesGuard } from './guards/roles.guard';
import { TenantGuard } from './guards/tenant.guard';

@Global()
@Module({
  controllers: [AuthController],
  providers: [
    AuthService,
    CfAccessService,
    IdentityService,
    CfAccessGuard,
    RolesGuard,
    TenantGuard,
    { provide: APP_GUARD, useClass: CfAccessGuard },
    { provide: APP_GUARD, useClass: RolesGuard },
    { provide: APP_GUARD, useClass: TenantGuard },
  ],
  exports: [AuthService, CfAccessService, IdentityService, CfAccessGuard],
})
export class AuthModule {}
