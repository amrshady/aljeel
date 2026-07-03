import { Controller, Get, Post } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { AuthService } from './auth.service';
import { CurrentUser } from './decorators/current-user.decorator';
import { Public } from './decorators/public.decorator';
import type { AuthUser } from './auth.types';

@ApiTags('auth')
@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Public()
  @Post('logout')
  @ApiOperation({ summary: 'Cloudflare Access logout URL' })
  logout(): { logoutUrl: string } {
    return { logoutUrl: '/cdn-cgi/access/logout' };
  }

  @Get('me')
  @ApiOperation({ summary: 'Current user profile' })
  me(@CurrentUser() user: AuthUser) {
    return this.authService.me(user);
  }
}
