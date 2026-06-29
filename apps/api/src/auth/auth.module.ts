import { Global, Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { APP_GUARD } from '@nestjs/core';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { MockAuthProvider } from './mock-auth.provider';
import { JwtAuthGuard } from './guards/jwt-auth.guard';
import { RolesGuard } from './guards/roles.guard';
import { TenantGuard } from './guards/tenant.guard';

@Global()
@Module({
  imports: [
    JwtModule.register({
      secret: process.env.JWT_SECRET ?? 'dev-only-change-me',
      signOptions: { issuer: 'aljeel-ap-portal' },
    }),
  ],
  controllers: [AuthController],
  providers: [
    MockAuthProvider,
    AuthService,
    JwtAuthGuard,
    RolesGuard,
    TenantGuard,
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    { provide: APP_GUARD, useClass: RolesGuard },
    { provide: APP_GUARD, useClass: TenantGuard },
  ],
  exports: [MockAuthProvider, AuthService, JwtAuthGuard],
})
export class AuthModule {}
