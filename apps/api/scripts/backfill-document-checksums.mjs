import { createHash } from 'node:crypto';
import { PrismaClient } from '@prisma/client';
import { KbStorageService } from '../src/kb/kb-storage.service.ts';
import { StorageService } from '../src/storage/storage.service.ts';

const prisma = new PrismaClient();
const kbStorage = new KbStorageService();
const localStorage = new StorageService();

async function checksumObject(storageKey) {
  const stream = kbStorage.isEnabled()
    ? await kbStorage.createReadStream(storageKey)
    : localStorage.createReadStream(storageKey.replace(/^local:/, ''));
  const hash = createHash('sha256');
  for await (const chunk of stream) hash.update(chunk);
  return hash.digest('hex');
}

async function main() {
  const documents = await prisma.document.findMany({
    where: { checksumSha256: null },
    select: { id: true, storageKey: true },
    orderBy: { createdAt: 'asc' },
  });

  console.log(`Found ${documents.length} document(s) without a checksum.`);
  for (const document of documents) {
    try {
      const checksumSha256 = await checksumObject(document.storageKey);
      const result = await prisma.document.updateMany({
        where: { id: document.id, checksumSha256: null },
        data: { checksumSha256 },
      });
      console.log(
        result.count === 1
          ? `Backfilled ${document.id}.`
          : `Skipped ${document.id}; it was already backfilled.`,
      );
    } catch (error) {
      console.error(`Skipped ${document.id}; object could not be read.`, error);
    }
  }
}

try {
  await main();
} finally {
  await prisma.$disconnect();
}
