import { Module } from '@nestjs/common';
import { KbStorageService } from './kb-storage.service';

@Module({
  providers: [KbStorageService],
  exports: [KbStorageService],
})
export class KbModule {}
