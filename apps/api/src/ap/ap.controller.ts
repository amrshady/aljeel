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
  @ApiOperation({ summary: 'List AP review queue or processed invoices via ?view=' })
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

  @Get('invoices/:id/reconciliation')
  @Roles('AP_CLERK', 'AP_APPROVER')
  @ApiOperation({ summary: 'Get AP-only vendor reconciliation status for an invoice' })
  getReconciliation(@Param('id') id: string) {
    return this.apService.getReconciliationStatus(id);
  }

  @Post('invoices/:id/reconciliation/rerun')
  @Roles('AP_CLERK', 'AP_APPROVER')
  @ApiOperation({ summary: 'Re-run AP-only vendor reconciliation for an approved invoice' })
  rerunReconciliation(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.apService.rerunReconciliation(user, id);
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
