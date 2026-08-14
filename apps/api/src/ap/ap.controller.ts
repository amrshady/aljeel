import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Query,
  Res,
  UploadedFiles,
  UseInterceptors,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { FilesInterceptor } from '@nestjs/platform-express';
import type { Response } from 'express';
import { ApService } from './ap.service';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import type { AuthUser } from '../auth/auth.types';
import {
  SOLVENTUM_OUTPUT_FILE_NAME,
  SolventumIntegrationService,
} from './solventum-integration.service';

interface UploadedFile {
  originalname: string;
  mimetype: string;
  buffer: Buffer;
}

@ApiTags('ap')
@Controller('ap')
@ApiBearerAuth()
export class ApController {
  constructor(
    private readonly apService: ApService,
    private readonly solventum: SolventumIntegrationService,
  ) {}

  @Post('solventum/chargeback')
  @Roles('AP_CLERK')
  @UseInterceptors(FilesInterceptor('files', 101, { limits: { fileSize: 95 * 1024 * 1024 } }))
  @ApiOperation({ summary: 'Generate and download a POD-backed Solventum chargeback' })
  generateSolventumChargeback(
    @UploadedFiles() files: UploadedFile[] | undefined,
    @Res() response: Response,
  ) {
    const workbooks = (files ?? []).filter((file) => /\.xlsx?$/i.test(file.originalname));
    const pods = (files ?? []).filter(
      (file) => file.mimetype === 'application/pdf' || /\.pdf$/i.test(file.originalname),
    );
    if (
      workbooks.length !== 1 ||
      pods.length < 1 ||
      workbooks.length + pods.length !== files?.length
    ) {
      throw new BadRequestException({
        code: 'SOLVENTUM_FILES_INVALID',
        message: 'Upload exactly one Excel workbook and at least one POD PDF.',
      });
    }
    const output = this.solventum.generateChargeback(
      workbooks[0]!.buffer,
      pods.map((file) => file.originalname),
    );
    response.set({
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': `attachment; filename="${SOLVENTUM_OUTPUT_FILE_NAME}"`,
      'Content-Length': String(output.length),
    });
    response.send(output);
  }

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
  reject(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() body: unknown) {
    return this.apService.reject(user, id, body);
  }

  @Post('invoices/:id/hold')
  @Roles('AP_CLERK', 'AP_APPROVER')
  @ApiOperation({ summary: 'Put an invoice on hold' })
  hold(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() body: unknown) {
    return this.apService.hold(user, id, body);
  }

  @Post('invoices/:id/resume')
  @Roles('AP_CLERK', 'AP_APPROVER')
  @ApiOperation({ summary: 'Resume review for an invoice on hold' })
  resume(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.apService.resume(user, id);
  }

  @Patch('invoices/:id/folder-name')
  @Roles('AP_CLERK', 'AP_APPROVER')
  @ApiOperation({ summary: 'Rename an invoice folder (any status)' })
  renameInvoiceFolder(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() body: unknown,
  ) {
    return this.apService.renameInvoiceFolder(user, id, body);
  }
}
