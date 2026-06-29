import { Global, Module } from '@nestjs/common';
import { APP_FILTER, APP_INTERCEPTOR } from '@nestjs/core';
import { HttpExceptionFilter } from '../common/filters/http-exception.filter';
import { TraceIdInterceptor } from '../common/interceptors/trace-id.interceptor';

@Global()
@Module({
  providers: [
    { provide: APP_FILTER, useClass: HttpExceptionFilter },
    { provide: APP_INTERCEPTOR, useClass: TraceIdInterceptor },
  ],
})
export class CommonModule {}
