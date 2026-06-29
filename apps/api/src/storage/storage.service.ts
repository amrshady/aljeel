import { Injectable } from '@nestjs/common';
import { createReadStream, type ReadStream } from 'node:fs';
import { mkdir, rm, stat, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';

/**
 * Local-disk object storage for dev. The interface mirrors what an S3/MinIO
 * adapter would expose, so it can be swapped in production without touching
 * callers (see ARCHITECTURE.md §6).
 */
@Injectable()
export class StorageService {
  private readonly root = resolve(
    process.env.STORAGE_DIR ?? join(process.cwd(), 'storage'),
  );

  private absolutePath(key: string): string {
    const target = resolve(this.root, key);
    if (target !== this.root && !target.startsWith(this.root + '/')) {
      throw new Error('Invalid storage key (path traversal blocked).');
    }
    return target;
  }

  async save(key: string, data: Buffer): Promise<void> {
    const path = this.absolutePath(key);
    await mkdir(dirname(path), { recursive: true });
    await writeFile(path, data);
  }

  createReadStream(key: string): ReadStream {
    return createReadStream(this.absolutePath(key));
  }

  async exists(key: string): Promise<boolean> {
    try {
      await stat(this.absolutePath(key));
      return true;
    } catch {
      return false;
    }
  }

  async delete(key: string): Promise<void> {
    await rm(this.absolutePath(key), { force: true });
  }
}
