import { Module } from '@nestjs/common';
import { ApController } from './ap.controller';
import { ApService } from './ap.service';
import { AsateelIntegrationService } from './asateel-integration.service';
import { JawalIntegrationService } from './jawal-integration.service';
import { KbModule } from '../kb/kb.module';

@Module({
  imports: [KbModule],
  controllers: [ApController],
  providers: [ApService, AsateelIntegrationService, JawalIntegrationService],
})
export class ApModule {}
