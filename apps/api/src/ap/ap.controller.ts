import { Body, Controller, Get, Param, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { ApService } from './ap.service';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import type { AuthUser } from '../auth/auth.types';

@ApiTags('ap')
@Controller('ap')
@ApiBearerAuth()
export class ApController {
  constructor(private readonly apService: ApService) {}

  @Get('exceptions')
  @Roles('AP_CLERK', 'AP_APPROVER')
  @ApiOperation({ summary: 'Queue of invoices needing AP review' })
  listExceptions(@Query() query: Record<string, string | undefined>) {
    return this.apService.listExceptions(query);
  }

  @Get('invoices/:id')
  @Roles('AP_CLERK', 'AP_APPROVER')
  @ApiOperation({ summary: 'Full invoice detail for AP processing' })
  getInvoice(@Param('id') id: string) {
    return this.apService.getInvoice(id);
  }

  @Post('invoices/:id/approve')
  @Roles('AP_CLERK', 'AP_APPROVER')
  @ApiOperation({ summary: 'Approve an invoice under review' })
  approve(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.apService.approve(user, id);
  }

  @Post('invoices/:id/reject')
  @Roles('AP_CLERK', 'AP_APPROVER')
  @ApiOperation({ summary: 'Reject an invoice with a reason' })
  reject(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() body: unknown,
  ) {
    return this.apService.reject(user, id, body);
  }

  @Post('invoices/:id/hold')
  @Roles('AP_CLERK', 'AP_APPROVER')
  @ApiOperation({ summary: 'Put an invoice on hold' })
  hold(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() body: unknown,
  ) {
    return this.apService.hold(user, id, body);
  }

  @Post('invoices/:id/resume')
  @Roles('AP_CLERK', 'AP_APPROVER')
  @ApiOperation({ summary: 'Resume review for an invoice on hold' })
  resume(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.apService.resume(user, id);
  }
}
