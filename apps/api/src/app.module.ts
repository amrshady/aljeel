import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { LoggerModule } from 'nestjs-pino';
import { APP_INTERCEPTOR } from '@nestjs/core';
import { HealthModule } from './health/health.module';
import { PrismaModule } from './prisma/prisma.module';
import { CommonModule } from './common/common.module';
import { AuditModule } from './audit/audit.module';
import { QueueModule } from './queue/queue.module';
import { ExampleWorkerService } from './queue/example-worker.service';
import { IdempotencyInterceptor } from './common/interceptors/idempotency.interceptor';
import { AuthModule } from './auth/auth.module';
import { SuppliersModule } from './suppliers/suppliers.module';
import { InvoicesModule } from './invoices/invoices.module';
import { StorageModule } from './storage/storage.module';
import { DocumentsModule } from './documents/documents.module';
import { ApModule } from './ap/ap.module';
import { ErpModule } from './erp/erp.module';
import { PurchaseOrdersModule } from './purchase-orders/purchase-orders.module';
import { RootModule } from './root.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    LoggerModule.forRoot({
      pinoHttp: {
        transport:
          process.env.NODE_ENV !== 'production'
            ? { target: 'pino-pretty', options: { singleLine: true } }
            : undefined,
        autoLogging: true,
        redact: ['req.headers.authorization', 'req.headers.cookie'],
      },
    }),
    CommonModule,
    PrismaModule,
    AuditModule,
    QueueModule,
    AuthModule,
    SuppliersModule,
    StorageModule,
    InvoicesModule,
    DocumentsModule,
    ApModule,
    ErpModule,
    PurchaseOrdersModule,
    HealthModule,
    RootModule,
  ],
  providers: [
    ExampleWorkerService,
    { provide: APP_INTERCEPTOR, useClass: IdempotencyInterceptor },
  ],
})
export class AppModule {}
