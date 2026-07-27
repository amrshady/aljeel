import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import type { AuthUser } from '../auth/auth.types';
import { PtMappingsService, type PtUploadedFile } from './pt-mappings.service';

@ApiTags('P&T PROJECTS mappings')
@ApiBearerAuth()
@Roles('AP_CLERK')
@Controller('ap/pt-mappings')
export class PtMappingsController {
  constructor(private readonly service: PtMappingsService) {}
  @Get() list() {
    return this.service.list();
  }
  @Get('audit') audit() {
    return this.service.auditHistory();
  }
  @Post('validate') validate() {
    return this.service.validate();
  }
  @Post('regenerate') regenerate(@CurrentUser() user: AuthUser) {
    return this.service.regenerate(user);
  }
  @Post('resolve') resolve(@Body() body: unknown) {
    return this.service.resolve(body);
  }
  @Post('agencies') createAgency(@CurrentUser() user: AuthUser, @Body() body: unknown) {
    return this.service.createAgency(user, body);
  }
  @Patch('agencies/:id') updateAgency(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() body: unknown,
  ) {
    return this.service.updateAgency(user, id, body);
  }
  @Delete('agencies/:id') deleteAgency(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.service.deleteAgency(user, id);
  }
  @Post('agencies/:agencyId/salesmen') createSalesman(
    @CurrentUser() user: AuthUser,
    @Param('agencyId') agencyId: string,
    @Body() body: unknown,
  ) {
    return this.service.createSalesman(user, agencyId, body);
  }
  @Patch('salesmen/:id') updateSalesman(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() body: unknown,
  ) {
    return this.service.updateSalesman(user, id, body);
  }
  @Delete('salesmen/:id') deleteSalesman(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.service.deleteSalesman(user, id);
  }
  @Patch('agencies/:agencyId/line-heads/:empNo') updateLineHead(
    @CurrentUser() user: AuthUser,
    @Param('agencyId') agencyId: string,
    @Param('empNo') empNo: string,
    @Body() body: unknown,
  ) {
    return this.service.updateLineHead(user, agencyId, empNo, body);
  }
  @Delete('agencies/:agencyId/line-heads/:empNo') deleteLineHead(
    @CurrentUser() user: AuthUser,
    @Param('agencyId') agencyId: string,
    @Param('empNo') empNo: string,
  ) {
    return this.service.deleteLineHead(user, agencyId, empNo);
  }
  @Post('import/preview')
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: 10 * 1024 * 1024 } }))
  preview(@UploadedFile() file?: PtUploadedFile) {
    return this.service.previewImport(file);
  }
  @Post('import/apply')
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: 10 * 1024 * 1024 } }))
  apply(@CurrentUser() user: AuthUser, @UploadedFile() file?: PtUploadedFile) {
    return this.service.applyImport(user, file);
  }
}
