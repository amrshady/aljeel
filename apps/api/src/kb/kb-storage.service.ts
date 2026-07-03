import { Injectable } from '@nestjs/common';
import {
  DeleteObjectCommand,
  GetObjectCommand,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import {
  DEFAULT_KB_TENANT,
  getKbTenantConfig,
  invoiceDocumentKey,
  toFullObjectKey,
} from '@aljeel/kb-upload/dist/server';
import type { Readable } from 'node:stream';

export interface KbPresignedPut {
  url: string;
  storageKey: string;
  expiresIn: number;
  headers: Record<string, string>;
}

@Injectable()
export class KbStorageService {
  private readonly tenant: string;
  private readonly client: S3Client | null;
  private readonly bucket: string;
  private readonly prefix: string;
  private readonly enabled: boolean;

  constructor() {
    this.tenant = process.env.KB_TENANT ?? DEFAULT_KB_TENANT;
    const accessKeyId = process.env.SPACES_ACCESS_KEY_ID;
    const secretAccessKey = process.env.SPACES_SECRET_ACCESS_KEY;
    const endpoint = process.env.SPACES_ENDPOINT;
    const region = process.env.SPACES_REGION;

    this.enabled = Boolean(accessKeyId && secretAccessKey && endpoint && region);

    if (this.enabled) {
      const tenantCfg = getKbTenantConfig(this.tenant);
      this.bucket = process.env.SPACES_BUCKET ?? tenantCfg.bucket;
      this.prefix = process.env.SPACES_PREFIX ?? tenantCfg.prefix;
      const useSsl = process.env.SPACES_USE_SSL !== 'false';
      const protocol = useSsl ? 'https' : 'http';
      this.client = new S3Client({
        region,
        endpoint: `${protocol}://${endpoint}`,
        credentials: { accessKeyId: accessKeyId!, secretAccessKey: secretAccessKey! },
        forcePathStyle: process.env.SPACES_FORCE_PATH_STYLE === 'true',
      });
    } else {
      this.bucket = '';
      this.prefix = '';
      this.client = null;
    }
  }

  isEnabled(): boolean {
    return this.enabled;
  }

  buildStorageKey(invoiceId: string, fileName: string): string {
    return invoiceDocumentKey(invoiceId, fileName);
  }

  async createUploadUrl(
    invoiceId: string,
    fileName: string,
    expiresIn = 3600,
  ): Promise<KbPresignedPut> {
    this.assertEnabled();
    const storageKey = this.buildStorageKey(invoiceId, fileName);
    const objectKey = toFullObjectKey(this.prefix, storageKey);
    const command = new PutObjectCommand({ Bucket: this.bucket, Key: objectKey });
    const url = await getSignedUrl(this.client!, command, { expiresIn });
    return { url, storageKey, expiresIn, headers: {} };
  }

  async createDownloadUrl(storageKey: string, expiresIn = 600): Promise<string> {
    this.assertEnabled();
    const objectKey = toFullObjectKey(this.prefix, storageKey);
    const command = new GetObjectCommand({ Bucket: this.bucket, Key: objectKey });
    return getSignedUrl(this.client!, command, { expiresIn });
  }

  async createReadStream(storageKey: string): Promise<Readable> {
    this.assertEnabled();
    const objectKey = toFullObjectKey(this.prefix, storageKey);
    const command = new GetObjectCommand({ Bucket: this.bucket, Key: objectKey });
    const response = await this.client!.send(command);
    if (!response.Body || !('pipe' in response.Body)) {
      throw new Error('KB object response is not streamable.');
    }
    return response.Body as Readable;
  }

  async deleteObject(storageKey: string): Promise<void> {
    this.assertEnabled();
    const objectKey = toFullObjectKey(this.prefix, storageKey);
    await this.client!.send(
      new DeleteObjectCommand({ Bucket: this.bucket, Key: objectKey }),
    );
  }

  private assertEnabled(): void {
    if (!this.enabled || !this.client) {
      throw new Error(
        'KB upload is not configured. Set SPACES_ACCESS_KEY_ID, SPACES_SECRET_ACCESS_KEY, SPACES_ENDPOINT, and SPACES_REGION.',
      );
    }
  }
}
