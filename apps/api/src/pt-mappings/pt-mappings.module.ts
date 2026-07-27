import { Module } from '@nestjs/common';
import { PtMappingsController } from './pt-mappings.controller';
import { PtMappingsService } from './pt-mappings.service';

@Module({ controllers: [PtMappingsController], providers: [PtMappingsService] })
export class PtMappingsModule {}
