import { Module } from '@nestjs/common';
import { DocumentsController } from './documents.controller';
import { DocumentsService } from './documents.service';
import { EmailPreviewService } from './email-preview.service';
import { KbModule } from '../kb/kb.module';

@Module({
  imports: [KbModule],
  controllers: [DocumentsController],
  providers: [DocumentsService, EmailPreviewService],
  exports: [DocumentsService],
})
export class DocumentsModule {}
