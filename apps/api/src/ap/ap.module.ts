import { Module } from '@nestjs/common';
import { ApController } from './ap.controller';
import { ApService } from './ap.service';
import { AsateelIntegrationService } from './asateel-integration.service';
import { JawalIntegrationService } from './jawal-integration.service';
import { SolventumIntegrationService } from './solventum-integration.service';
import { SolventumPodExtractor } from './solventum-pod.types';
import { GeminiSolventumPodExtractor } from './gemini-solventum-pod.extractor';
import { LocalSolventumPodExtractor } from './local-solventum-pod.extractor';
import { CompositeSolventumPodExtractor } from './composite-solventum-pod.extractor';
import { KbModule } from '../kb/kb.module';
import { SolventumChargebackJobService } from './solventum-chargeback-job.service';
import { SupplierReconciliationService } from './supplier-reconciliation.service';

@Module({
  imports: [KbModule],
  controllers: [ApController],
  providers: [
    ApService,
    AsateelIntegrationService,
    JawalIntegrationService,
    SolventumIntegrationService,
    SolventumChargebackJobService,
    SupplierReconciliationService,
    LocalSolventumPodExtractor,
    GeminiSolventumPodExtractor,
    { provide: SolventumPodExtractor, useClass: CompositeSolventumPodExtractor },
  ],
})
export class ApModule {}
