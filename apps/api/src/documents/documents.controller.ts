import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
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

  @Post('invoices/:id/documents')
  @Roles('SUPPLIER_ADMIN', 'SUPPLIER_USER')
  @ApiOperation({ summary: 'Upload a document (PDF/image/XML) for an invoice' })
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
    @Body() body: { type?: string },
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
  @ApiOperation({ summary: 'Download a document' })
  async download(
    @CurrentUser() user: AuthUser,
    @Param('id') documentId: string,
  ): Promise<StreamableFile> {
    const { document, stream } = await this.documentsService.getForDownload(user, documentId);
    return new StreamableFile(stream, {
      type: document.mimeType,
      length: document.sizeBytes,
      disposition: `attachment; filename="${encodeURIComponent(document.fileName)}"`,
    });
  }

  @Delete('documents/:id')
  @Roles('SUPPLIER_ADMIN', 'SUPPLIER_USER')
  @ApiOperation({ summary: 'Delete a document from an editable invoice' })
  remove(@CurrentUser() user: AuthUser, @Param('id') documentId: string) {
    return this.documentsService.remove(user, documentId);
  }
}
