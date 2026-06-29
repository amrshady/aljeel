import { Body, Controller, Get, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import {
  LoginRequestSchema,
  MfaVerifyRequestSchema,
  type AuthTokens,
  type LoginChallengeResponse,
} from '@aljeel/shared-types';
import { AuthService } from './auth.service';
import { CurrentUser } from './decorators/current-user.decorator';
import { Public } from './decorators/public.decorator';
import type { AuthUser } from './auth.types';

@ApiTags('auth')
@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Public()
  @Post('login')
  @ApiOperation({ summary: 'Start login (returns MFA challenge)' })
  login(@Body() body: unknown): LoginChallengeResponse {
    const dto = LoginRequestSchema.parse(body);
    return this.authService.login(dto);
  }

  @Public()
  @Post('mfa')
  @ApiOperation({ summary: 'Verify MFA and receive tokens' })
  verifyMfa(@Body() body: unknown): AuthTokens {
    const dto = MfaVerifyRequestSchema.parse(body);
    return this.authService.verifyMfa(dto.challengeId, dto.code);
  }

  @Public()
  @Post('refresh')
  @ApiOperation({ summary: 'Refresh access token' })
  refresh(@Body() body: { refreshToken: string }): AuthTokens {
    return this.authService.refresh(body.refreshToken);
  }

  @Public()
  @Post('logout')
  @ApiOperation({ summary: 'Logout (client discards tokens)' })
  logout(): { success: true } {
    return { success: true };
  }

  @Get('me')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Current user profile' })
  me(@CurrentUser() user: AuthUser) {
    return this.authService.me(user.sub);
  }
}
