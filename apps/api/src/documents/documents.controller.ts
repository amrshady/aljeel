import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Res,
  StreamableFile,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import {
  ApiBearerAuth,
  ApiBody,
  ApiConsumes,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { MAX_DOCUMENT_SIZE_BYTES } from '@aljeel/shared-types';
import { DocumentsService } from './documents.service';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { SupplierScoped } from '../auth/guards/tenant.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import type { Response } from 'express';

import type { AuthUser } from '../auth/auth.types';

interface UploadedMulterFile {
  originalname: string;
  mimetype: string;
  size: number;
  buffer: Buffer;
}

@ApiTags('documents')
@Controller()
@SupplierScoped()
@ApiBearerAuth()
export class DocumentsController {
  constructor(private readonly documentsService: DocumentsService) {}

  @Post('invoices/:id/documents/upload-url')
  @Roles('SUPPLIER_ADMIN', 'SUPPLIER_USER')
  @ApiOperation({ summary: 'Get a presigned URL for direct upload to KB storage (Spaces/MinIO)' })
  createUploadUrl(
    @CurrentUser() user: AuthUser,
    @Param('id') invoiceId: string,
    @Body() body: unknown,
  ) {
    return this.documentsService.createUploadUrl(user, invoiceId, body);
  }

  @Post('invoices/:id/documents/complete')
  @Roles('SUPPLIER_ADMIN', 'SUPPLIER_USER')
  @ApiOperation({ summary: 'Register a document after KB storage upload completes' })
  completeUpload(
    @CurrentUser() user: AuthUser,
    @Param('id') invoiceId: string,
    @Body() body: unknown,
  ) {
    return this.documentsService.completeUpload(user, invoiceId, body);
  }

  @Post('invoices/:id/documents')
  @Roles('SUPPLIER_ADMIN', 'SUPPLIER_USER')
  @ApiOperation({ summary: 'Upload a document via multipart (local dev fallback only)' })
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        file: { type: 'string', format: 'binary' },
        type: {
          type: 'string',
          enum: ['INVOICE', 'DELIVERY_NOTE', 'GRN_COPY', 'CONTRACT', 'TIMESHEET', 'OTHER'],
        },
        relativePath: { type: 'string' },
      },
    },
  })
  @UseInterceptors(
    FileInterceptor('file', { limits: { fileSize: MAX_DOCUMENT_SIZE_BYTES } }),
  )
  upload(
    @CurrentUser() user: AuthUser,
    @Param('id') invoiceId: string,
    @UploadedFile() file: UploadedMulterFile | undefined,
    @Body() body: { type?: string; relativePath?: string },
  ) {
    return this.documentsService.upload(user, invoiceId, file, body);
  }

  @Get('invoices/:id/documents')
  @Roles('SUPPLIER_ADMIN', 'SUPPLIER_USER', 'AP_CLERK', 'AP_APPROVER')
  @ApiOperation({ summary: 'List documents attached to an invoice' })
  list(@CurrentUser() user: AuthUser, @Param('id') invoiceId: string) {
    return this.documentsService.list(user, invoiceId);
  }

  @Get('documents/:id/download')
  @Roles('SUPPLIER_ADMIN', 'SUPPLIER_USER', 'AP_CLERK', 'AP_APPROVER')
  @ApiOperation({ summary: 'Download a document (redirects to presigned URL when using KB storage)' })
  async download(
    @CurrentUser() user: AuthUser,
    @Param('id') documentId: string,
    @Res({ passthrough: true }) res: Response,
  ): Promise<StreamableFile | void> {
    const result = await this.documentsService.getForDownload(user, documentId);
    if ('redirectUrl' in result) {
      res.redirect(result.redirectUrl);
      return;
    }
    const { document, stream } = result;
    return new StreamableFile(stream, {
      type: document.mimeType,
      length: document.sizeBytes,
      disposition: `attachment; filename="${encodeURIComponent(document.fileName)}"`,
    });
  }

  @Get('documents/:id/content')
  @Roles('SUPPLIER_ADMIN', 'SUPPLIER_USER', 'AP_CLERK', 'AP_APPROVER')
  @ApiOperation({ summary: 'Preview URL or inline stream (never forces download)' })
  async content(
    @CurrentUser() user: AuthUser,
    @Param('id') documentId: string,
    @Res() res: Response,
  ): Promise<void> {
    const result = await this.documentsService.getForView(user, documentId);
    if ('viewUrl' in result && result.viewUrl) {
      res.json({
        url: result.viewUrl,
        mimeType: result.document.mimeType,
        fileName: result.document.fileName,
      });
      return;
    }
    const { document, stream } = result as {
      document: { mimeType: string; fileName: string };
      stream: NodeJS.ReadableStream;
    };
    res.set({
      'Content-Type': document.mimeType,
      'Content-Disposition': `inline; filename="${encodeURIComponent(document.fileName)}"`,
    });
    stream.pipe(res);
  }

  @Delete('documents/:id')
  @Roles('SUPPLIER_ADMIN', 'SUPPLIER_USER')
  @ApiOperation({ summary: 'Delete a document from an editable invoice' })
  remove(@CurrentUser() user: AuthUser, @Param('id') documentId: string) {
    return this.documentsService.remove(user, documentId);
  }
}
