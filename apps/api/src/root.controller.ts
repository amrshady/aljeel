import { Controller, Get, Redirect } from '@nestjs/common';
import { ApiExcludeController } from '@nestjs/swagger';
import { Public } from './auth/decorators/public.decorator';

@ApiExcludeController()
@Controller()
export class RootController {
  @Public()
  @Get()
  @Redirect('/api/docs')
  root() {
    return;
  }
}
