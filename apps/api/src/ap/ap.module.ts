import { Module } from '@nestjs/common';
import { ApController } from './ap.controller';
import { ApService } from './ap.service';
import { AsateelIntegrationService } from './asateel-integration.service';
import { JawalIntegrationService } from './jawal-integration.service';
import { SolventumIntegrationService } from './solventum-integration.service';
import { SolventumPodExtractor } from './solventum-pod.types';
import { GeminiSolventumPodExtractor } from './gemini-solventum-pod.extractor';
import { KbModule } from '../kb/kb.module';

@Module({
  imports: [KbModule],
  controllers: [ApController],
  providers: [
    ApService,
    AsateelIntegrationService,
    JawalIntegrationService,
    SolventumIntegrationService,
    { provide: SolventumPodExtractor, useClass: GeminiSolventumPodExtractor },
  ],
})
export class ApModule {}
