import { Controller, Get, Param, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { PurchaseOrdersService } from './purchase-orders.service';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { SupplierScoped } from '../auth/guards/tenant.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import type { AuthUser } from '../auth/auth.types';

@ApiTags('purchase-orders')
@Controller('purchase-orders')
@SupplierScoped()
@ApiBearerAuth()
export class PurchaseOrdersController {
  constructor(private readonly purchaseOrdersService: PurchaseOrdersService) {}

  @Get()
  @Roles('SUPPLIER_ADMIN', 'SUPPLIER_USER')
  @ApiOperation({ summary: "List supplier's purchase orders (ERP-synced)" })
  list(@CurrentUser() user: AuthUser, @Query() query: Record<string, string | undefined>) {
    return this.purchaseOrdersService.list(user, query);
  }

  @Get(':id')
  @Roles('SUPPLIER_ADMIN', 'SUPPLIER_USER')
  @ApiOperation({ summary: 'Purchase order detail with lines and receipts' })
  getById(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.purchaseOrdersService.getById(user, id);
  }
}
