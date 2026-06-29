import { Body, Controller, Get, Param, Post, Put, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { InvoicePipelineCountsSchema } from '@aljeel/shared-types';
import { InvoicesService } from './invoices.service';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { SupplierScoped, getSupplierScope } from '../auth/guards/tenant.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import type { AuthUser } from '../auth/auth.types';

@ApiTags('invoices')
@Controller('invoices')
@SupplierScoped()
@ApiBearerAuth()
export class InvoicesController {
  constructor(private readonly invoicesService: InvoicesService) {}

  @Post()
  @Roles('SUPPLIER_ADMIN', 'SUPPLIER_USER')
  @ApiOperation({ summary: 'Create draft invoice' })
  createDraft(@CurrentUser() user: AuthUser, @Body() body: unknown) {
    return this.invoicesService.createDraft(user, body);
  }

  @Get()
  @Roles('SUPPLIER_ADMIN', 'SUPPLIER_USER')
  @ApiOperation({ summary: 'List invoices with filters and pagination' })
  list(@CurrentUser() user: AuthUser, @Query() query: Record<string, string | undefined>) {
    return this.invoicesService.list(user, query);
  }

  @Get('summary')
  @Roles('SUPPLIER_ADMIN', 'SUPPLIER_USER')
  @ApiOperation({ summary: 'Invoice pipeline counts for dashboard' })
  async getSummary(@CurrentUser() user: AuthUser) {
    const supplierId = getSupplierScope(user) ?? user.supplierId;
    if (!supplierId) {
      return InvoicePipelineCountsSchema.parse({
        draft: 0,
        submitted: 0,
        underReview: 0,
        approved: 0,
        scheduled: 0,
        paid: 0,
        rejected: 0,
        onHold: 0,
      });
    }
    return InvoicePipelineCountsSchema.parse(
      await this.invoicesService.getSummary(supplierId),
    );
  }

  @Get(':id')
  @Roles('SUPPLIER_ADMIN', 'SUPPLIER_USER')
  @ApiOperation({ summary: 'Get invoice detail' })
  getById(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.invoicesService.getById(user, id);
  }

  @Put(':id')
  @Roles('SUPPLIER_ADMIN', 'SUPPLIER_USER')
  @ApiOperation({ summary: 'Update draft invoice' })
  updateDraft(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() body: unknown) {
    return this.invoicesService.updateDraft(user, id, body);
  }

  @Post(':id/submit')
  @Roles('SUPPLIER_ADMIN', 'SUPPLIER_USER')
  @ApiOperation({ summary: 'Submit invoice for review' })
  submit(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.invoicesService.submit(user, id);
  }
}
