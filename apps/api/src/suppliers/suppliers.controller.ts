import { Body, Controller, Get, Post, Put } from '@nestjs/common';
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
  @ApiOperation({ summary: 'Current supplier profile' })
  getMySupplier(@CurrentUser() user: AuthUser) {
    return this.suppliersService.getMySupplier(user);
  }

  @Put('me')
  @Roles('SUPPLIER_ADMIN')
  @ApiOperation({ summary: 'Update supplier profile (non-sensitive fields)' })
  updateMySupplier(@CurrentUser() user: AuthUser, @Body() body: unknown) {
    return this.suppliersService.updateMySupplier(user, body);
  }

  @Get('me/users')
  @Roles('SUPPLIER_ADMIN')
  @ApiOperation({ summary: 'List sub-users' })
  listUsers(@CurrentUser() user: AuthUser) {
    return this.suppliersService.listUsers(user);
  }

  @Post('me/users')
  @Roles('SUPPLIER_ADMIN')
  @ApiOperation({ summary: 'Invite sub-user' })
  inviteUser(@CurrentUser() user: AuthUser, @Body() body: unknown) {
    return this.suppliersService.inviteUser(user, body);
  }
}
