import {
  CallHandler,
  ConflictException,
  ExecutionContext,
  Injectable,
  NestInterceptor,
} from '@nestjs/common';
import { Observable, of, tap } from 'rxjs';
import { PrismaService } from '../../prisma/prisma.module';

const IDEMPOTENCY_TTL_HOURS = 24;

@Injectable()
export class IdempotencyInterceptor implements NestInterceptor {
  constructor(private readonly prisma: PrismaService) {}

  async intercept(context: ExecutionContext, next: CallHandler): Promise<Observable<unknown>> {
    const request = context.switchToHttp().getRequest<{
      method: string;
      path: string;
      headers: Record<string, string | undefined>;
      traceId?: string;
    }>();
    const response = context.switchToHttp().getResponse<{ statusCode: number }>();

    const method = request.method.toUpperCase();
    if (!['POST', 'PUT', 'PATCH', 'DELETE'].includes(method)) {
      return next.handle();
    }

    const key = request.headers['idempotency-key'];
    if (!key) {
      return next.handle();
    }

    const existing = await this.prisma.idempotencyRecord.findUnique({
      where: { key },
    });

    if (existing) {
      if (existing.expiresAt < new Date()) {
        await this.prisma.idempotencyRecord.delete({ where: { key } });
      } else {
        response.statusCode = existing.status;
        return of(existing.body);
      }
    }

    return next.handle().pipe(
      tap(async (body) => {
        const expiresAt = new Date();
        expiresAt.setHours(expiresAt.getHours() + IDEMPOTENCY_TTL_HOURS);

        try {
          await this.prisma.idempotencyRecord.create({
            data: {
              key,
              path: request.path,
              method,
              status: response.statusCode || 200,
              body: body as object,
              expiresAt,
            },
          });
        } catch {
          const race = await this.prisma.idempotencyRecord.findUnique({
            where: { key },
          });
          if (race) {
            throw new ConflictException({
              code: 'IDEMPOTENCY_CONFLICT',
              message: 'Duplicate idempotency key with different payload.',
            });
          }
        }
      }),
    );
  }
}
