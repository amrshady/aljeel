import {
  BadRequestException,
  Body,
  Controller,
  Get,
  HttpCode,
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
import { SolventumChargebackJobService } from './solventum-chargeback-job.service';
import { SolventumUploadInterceptor } from './solventum-upload.interceptor';
import { SupplierReconciliationService } from './supplier-reconciliation.service';

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
    private readonly solventumJobs: SolventumChargebackJobService,
    private readonly supplierRecon: SupplierReconciliationService,
  ) {}

  private solventumFiles(files: UploadedFile[] | undefined) {
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
    return { workbook: workbooks[0]!, pods };
  }

  @Post('solventum/chargeback')
  @Roles('AP_CLERK')
  @UseInterceptors(SolventumUploadInterceptor)
  @ApiOperation({
    summary:
      'Generate Solventum chargeback: filename TRX → sales rows; POD scan overrides Quantity',
  })
  async generateSolventumChargeback(
    @UploadedFiles() files: UploadedFile[] | undefined,
    @Res() response: Response,
  ) {
    const { workbook, pods } = this.solventumFiles(files);
    const output = await this.solventum.generateChargeback(
      workbook.buffer,
      pods.map((file) => ({ originalname: file.originalname, buffer: file.buffer })),
    );
    response.set({
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': `attachment; filename="${SOLVENTUM_OUTPUT_FILE_NAME}"`,
      'Content-Length': String(output.length),
    });
    response.send(output);
  }

  @Post('solventum/chargeback/jobs')
  @HttpCode(202)
  @Roles('AP_CLERK')
  @UseInterceptors(SolventumUploadInterceptor)
  @ApiOperation({ summary: 'Queue a Solventum chargeback workbook for background generation' })
  createSolventumChargebackJob(@UploadedFiles() files: UploadedFile[] | undefined) {
    const { workbook, pods } = this.solventumFiles(files);
    return this.solventumJobs.create(
      workbook.buffer,
      pods.map((file) => ({ originalname: file.originalname, buffer: file.buffer })),
    );
  }

  @Get('solventum/chargeback/jobs/:jobId')
  @Roles('AP_CLERK')
  @ApiOperation({ summary: 'Get Solventum chargeback generation status' })
  getSolventumChargebackJob(@Param('jobId') jobId: string) {
    return this.solventumJobs.get(jobId);
  }

  @Get('solventum/chargeback/jobs/:jobId/result')
  @Roles('AP_CLERK')
  @ApiOperation({ summary: 'Download a completed Solventum chargeback workbook' })
  async getSolventumChargebackResult(@Param('jobId') jobId: string, @Res() response: Response) {
    const output = await this.solventumJobs.result(jobId);
    response.set({
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': `attachment; filename="${SOLVENTUM_OUTPUT_FILE_NAME}"`,
      'Content-Length': String(output.length),
    });
    response.send(output);
  }

  @Post('supplier-reconciliation')
  @Roles('AP_CLERK')
  @UseInterceptors(FilesInterceptor('files', 2, { limits: { fileSize: 10 * 1024 * 1024 } }))
  @ApiOperation({
    summary:
      'Match Aljeel Oracle unpaid invoices to a supplier statement and download payment + recon sheets',
  })
  async reconcileSupplierStatement(
    @UploadedFiles() files: UploadedFile[] | undefined,
    @Res() response: Response,
  ) {
    const workbooks = (files ?? []).filter((file) => /\.xlsx?$/i.test(file.originalname));
    if (
      workbooks.length < 1 ||
      workbooks.length > 2 ||
      workbooks.length !== files?.length
    ) {
      throw new BadRequestException({
        code: 'SUPPLIER_RECON_FILES_INVALID',
        message:
          'Upload one Excel workbook that contains both ledgers, or two workbooks (Aljeel export + supplier statement).',
      });
    }
    const { output, fileName } = await this.supplierRecon.reconcileWorkbooks(
      workbooks.map((file) => ({ originalname: file.originalname, buffer: file.buffer })),
    );
    response.set({
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': `attachment; filename="${fileName}"`,
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
