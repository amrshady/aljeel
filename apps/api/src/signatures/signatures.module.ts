import { Module } from '@nestjs/common';
import { NotificationsModule } from '../notifications/notifications.module';
import { SignaturesController } from './signatures.controller';
import { SignaturesService } from './signatures.service';

@Module({
  imports: [NotificationsModule],
  controllers: [SignaturesController],
  providers: [SignaturesService],
})
export class SignaturesModule {}
