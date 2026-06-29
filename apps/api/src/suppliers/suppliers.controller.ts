import { Controller, Get } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { SuppliersService } from './suppliers.service';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { SupplierScoped } from '../auth/guards/tenant.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import type { AuthUser } from '../auth/auth.types';

@ApiTags('suppliers')
@Controller('suppliers')
@SupplierScoped()
@ApiBearerAuth()
export class SuppliersController {
  constructor(private readonly suppliersService: SuppliersService) {}

  @Get('me')
  @Roles('SUPPLIER_ADMIN', 'SUPPLIER_USER')
  @ApiOperation({ summary: 'Current supplier company info' })
  getMySupplier(@CurrentUser() user: AuthUser) {
    return this.suppliersService.getMySupplier(user);
  }
}
