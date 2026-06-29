import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import { Response } from 'express';
import { v4 as uuidv4 } from 'uuid';

interface ErrorBody {
  error: {
    code: string;
    message: string;
    details?: Record<string, unknown>;
    traceId: string;
  };
}

@Catch()
export class HttpExceptionFilter implements ExceptionFilter {
  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<{ traceId?: string }>();
    const traceId = request.traceId ?? uuidv4();

    let status = HttpStatus.INTERNAL_SERVER_ERROR;
    let code = 'INTERNAL_ERROR';
    let message = 'An unexpected error occurred.';
    let details: Record<string, unknown> | undefined;

    if (exception instanceof HttpException) {
      status = exception.getStatus();
      const body = exception.getResponse();
      if (typeof body === 'string') {
        message = body;
        code = HttpStatus[status] ?? 'HTTP_ERROR';
      } else if (typeof body === 'object' && body !== null) {
        const obj = body as Record<string, unknown>;
        message = (obj.message as string) ?? message;
        code = (obj.code as string) ?? (HttpStatus[status] ?? 'HTTP_ERROR');
        details = obj.details as Record<string, unknown> | undefined;
        if (Array.isArray(obj.message)) {
          message = obj.message.join(', ');
          details = { fields: obj.message };
        }
      }
    }

    const errorBody: ErrorBody = {
      error: { code, message, details, traceId },
    };

    response.status(status).json(errorBody);
  }
}
