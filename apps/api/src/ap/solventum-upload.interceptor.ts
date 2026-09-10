import {
  BadRequestException,
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
  PayloadTooLargeException,
  Type,
} from '@nestjs/common';
import { FilesInterceptor } from '@nestjs/platform-express';
import type { Request } from 'express';
import { catchError, from, mergeMap, type Observable, throwError } from 'rxjs';

export const SOLVENTUM_MAX_FILES = 501; // one workbook plus up to 500 PODs

export const SOLVENTUM_UPLOAD_LIMITS = {
  fileSize: 95 * 1024 * 1024,
  files: SOLVENTUM_MAX_FILES,
  fields: 0,
  // Busboy counts every file and text field as a part. It emits partsLimit when
  // the count reaches the configured value, so use one past the accepted max.
  parts: SOLVENTUM_MAX_FILES + 1,
  fieldNameSize: 100,
  fieldSize: 1024,
  headerPairs: 100,
} as const;

const NestFilesInterceptor = FilesInterceptor('files', SOLVENTUM_MAX_FILES, {
  limits: SOLVENTUM_UPLOAD_LIMITS,
});

function waitForRequestBody(request: Request): Promise<void> {
  if (request.complete || request.readableEnded || request.destroyed) return Promise.resolve();

  return new Promise((resolve) => {
    const done = () => {
      request.off('end', done);
      request.off('close', done);
      request.off('error', done);
      resolve();
    };
    request.once('end', done);
    request.once('close', done);
    request.once('error', done);
    request.resume();
  });
}

function uploadException(error: unknown) {
  const message = error instanceof Error ? error.message : 'Invalid multipart upload.';
  if (error instanceof PayloadTooLargeException || message === 'File too large') {
    return new PayloadTooLargeException({
      code: 'SOLVENTUM_FILE_TOO_LARGE',
      message: 'Each uploaded file must be 95 MB or smaller.',
    });
  }
  return new BadRequestException({
    code: 'SOLVENTUM_UPLOAD_LIMIT',
    message: `Invalid Solventum upload: ${message}`,
    details: {
      maxFiles: SOLVENTUM_MAX_FILES,
      maxPods: SOLVENTUM_MAX_FILES - 1,
    },
  });
}

@Injectable()
export class SolventumUploadInterceptor
  extends (NestFilesInterceptor as Type<NestInterceptor>)
  implements NestInterceptor
{
  override async intercept(
    context: ExecutionContext,
    next: CallHandler,
  ): Promise<Observable<unknown>> {
    try {
      const request = context.switchToHttp().getRequest<Request>();
      const stream = await super.intercept(context, next);
      return stream.pipe(
        catchError((error: unknown) =>
          from(waitForRequestBody(request)).pipe(mergeMap(() => throwError(() => error))),
        ),
      );
    } catch (error) {
      await waitForRequestBody(context.switchToHttp().getRequest<Request>());
      throw uploadException(error);
    }
  }
}
