import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { Response } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { ZodError } from 'zod';

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
    } else if (exception instanceof ZodError) {
      status = HttpStatus.UNPROCESSABLE_ENTITY;
      code = 'VALIDATION_FAILED';
      message = 'Request validation failed.';
      details = {
        fields: exception.issues.map((issue) => ({
          path: issue.path.join('.'),
          message: issue.message,
        })),
      };
    } else if (exception instanceof Prisma.PrismaClientKnownRequestError) {
      if (exception.code === 'P2002') {
        status = HttpStatus.CONFLICT;
        code = 'DUPLICATE_RECORD';
        message = 'A record with this value already exists.';
        const target = exception.meta?.target;
        if (Array.isArray(target)) {
          details = { fields: target };
          if (target.includes('invoiceNumber')) {
            code = 'INVOICE_NUMBER_TAKEN';
            message = 'An invoice with this number already exists.';
          }
        }
      }
    }

    const errorBody: ErrorBody = {
      error: { code, message, details, traceId },
    };

    response.status(status).json(errorBody);
  }
}
