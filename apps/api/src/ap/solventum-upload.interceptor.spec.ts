import { CallHandler, ExecutionContext } from '@nestjs/common';
import { EventEmitter } from 'node:events';
import { describe, expect, it, vi } from 'vitest';
import {
  SOLVENTUM_MAX_FILES,
  SOLVENTUM_UPLOAD_LIMITS,
  SolventumUploadInterceptor,
} from './solventum-upload.interceptor';

class RequestStub extends EventEmitter {
  complete = false;
  readableEnded = false;
  destroyed = false;
  resume = vi.fn();
}

function context(request: RequestStub) {
  return {
    switchToHttp: () => ({ getRequest: () => request }),
  } as ExecutionContext;
}

describe('SolventumUploadInterceptor', () => {
  it('accepts one workbook plus 500 POD file parts and no text fields', () => {
    expect(SOLVENTUM_MAX_FILES).toBe(501);
    expect(SOLVENTUM_UPLOAD_LIMITS).toMatchObject({ files: 501, fields: 0, parts: 502 });
  });

  it('waits for the request body to drain before returning a structured upload error', async () => {
    const request = new RequestStub();
    const interceptor = new SolventumUploadInterceptor();
    vi.spyOn(Object.getPrototypeOf(SolventumUploadInterceptor.prototype), 'intercept').mockRejectedValue(
      new Error('Too many files'),
    );

    let settled = false;
    const result = interceptor
      .intercept(context(request), {} as CallHandler)
      .catch((error) => error)
      .finally(() => {
        settled = true;
      });
    await Promise.resolve();
    expect(request.resume).toHaveBeenCalled();
    expect(settled).toBe(false);

    request.complete = true;
    request.emit('end');
    const error = await result;
    expect(error.getStatus()).toBe(400);
    expect(error.getResponse()).toMatchObject({
      code: 'SOLVENTUM_UPLOAD_LIMIT',
      details: { maxFiles: 501, maxPods: 500 },
    });
  });
});
