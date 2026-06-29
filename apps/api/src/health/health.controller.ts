import { Controller, Get } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { HealthResponse } from '@aljeel/shared-types';
import { Public } from '../auth/decorators/public.decorator';

@ApiTags('health')
@Controller('health')
export class HealthController {
  @Public()
  @Get()
  @ApiOperation({ summary: 'Health check' })
  getHealth(): HealthResponse {
    return {
      status: 'ok',
      version: process.env.API_VERSION ?? '0.0.1',
      timestamp: new Date().toISOString(),
    };
  }
}
