Implemented the Jawal staging fix. No tests, builds, migrations, batch runs, or deployments were performed.

### Diff summary

File touched: [jawal-integration.service.ts](/home/clawdbot/.openclaw/workspace/aljeel-repo/apps/api/src/ap/jawal-integration.service.ts)

- Preserves and recreates sanitized relative directories beneath `src/`.
- Keeps the `doc.id-` deduplication prefix only on the final filename.
- Rejects absolute paths, Windows absolute paths, `.`/`..` traversal segments, and any resolved target outside `srcDir`.
- Creates each target’s parent directory recursively.
- Retains identical flat staging behavior for filenames without separators.
- Leaves the batch-root guard, `ORACLE_UPLOAD` filter, storage routing, stream pipeline, and `srcDir` return unchanged.
- Replaced `sanitizeFileName()` with per-component `sanitizePathSegment()`.

### Changed function body

[stageInvoiceDocuments(), lines 201–252](/home/clawdbot/.openclaw/workspace/aljeel-repo/apps/api/src/ap/jawal-integration.service.ts:201)

```ts
private async stageInvoiceDocuments(invoice: InvoiceWithIntegration): Promise<string> {
  const batchesRoot = resolve(process.env.JAWAL_BATCHES_ROOT ?? DEFAULT_BATCHES_ROOT);
  const batchDir = resolve(batchesRoot, `jawal-${invoice.invoiceNumber}`);
  if (batchDir !== batchesRoot && !batchDir.startsWith(batchesRoot + '/')) {
    throw new Error('Invalid Jawal batch path.');
  }
  const srcDir = join(batchDir, 'src');
  await mkdir(srcDir, { recursive: true });

  const documents = invoice.documents.filter((doc) => doc.type !== 'ORACLE_UPLOAD');
  if (documents.length === 0) {
    throw new Error('Invoice has no source documents to stage for Jawal.');
  }

  for (const doc of documents) {
    const hasPathSeparator = /[\\/]/.test(doc.fileName);
    const pathSegments = doc.fileName.split(/[\\/]/);
    if (
      /^[/\\]/.test(doc.fileName) ||
      /^[A-Za-z]:[\\/]/.test(doc.fileName) ||
      pathSegments.some((segment) => segment === '.' || segment === '..')
    ) {
      throw new Error(`Invalid Jawal document path for document ${doc.id}.`);
    }

    const sanitizedSegments = pathSegments.map((segment) =>
      this.sanitizePathSegment(segment),
    );
    const fileName = `${doc.id}-${sanitizedSegments.pop() ?? 'file'}`;
    // Preserve legacy flat staging while rebuilding supplier folders for nested paths.
    const relativeTarget = hasPathSeparator
      ? join(...sanitizedSegments, fileName)
      : fileName;
    const resolvedSrcDir = resolve(srcDir);
    const target = resolve(resolvedSrcDir, relativeTarget);
    if (target !== resolvedSrcDir && !target.startsWith(resolvedSrcDir + sep)) {
      throw new Error(`Invalid Jawal document path for document ${doc.id}.`);
    }
    await mkdir(dirname(target), { recursive: true });

    if (doc.storageKey.startsWith('invoices/')) {
      await pipeline(await this.kb.createReadStream(doc.storageKey), createWriteStream(target));
    } else {
      await pipeline(
        this.storage.createReadStream(doc.storageKey.replace(/^local:/, '')),
        createWriteStream(target),
      );
    }
  }

  return srcDir;
}
```

The segment sanitizer is now at [lines 506–508](/home/clawdbot/.openclaw/workspace/aljeel-repo/apps/api/src/ap/jawal-integration.service.ts:506).

### Deduplication and security decisions

The document ID prefix was retained because it prevents collisions between documents with the same filename. It is applied only to the final basename:

```text
01-07jul/01JUL/4860349359/<doc-id>-MR_FARHAN_ALANAZI-7MQ2RS.pdf
```

Thus ticket folder `4860349359` remains untouched for matching.

Traversal protection has two layers:

1. Reject absolute paths, Windows drive paths, and literal `.`/`..` segments before sanitization.
2. Resolve the final path and confirm it remains beneath the resolved `srcDir`.

Unsafe input fails staging explicitly.

### Operator verification for J26-1080

After the operator releases/restarts the API with this change:

1. Move the existing `jawal-J26-1080` batch directory to an operator-chosen backup location so stale flattened files cannot affect verification.
2. Open approved invoice `J26-1080` in AP and select **Rerun reconciliation**, or call:
   `POST /ap/invoices/<J26-1080-invoice-id>/reconciliation/rerun`
   using an authenticated `AP_CLERK` or `AP_APPROVER`.
3. The rerun call re-stages the documents before enqueueing the Jawal run.
4. Inspect `<JAWAL_BATCHES_ROOT>/jawal-J26-1080/src/` and confirm ticket directories exist, particularly `01-07jul/01JUL/4860349359/`.
5. Confirm filenames inside ticket directories retain the `doc.id-` prefix only on the basename.
6. Allow the queued Jawal reconciliation to finish.
7. Verify the pipeline no longer reports all rows as `NO_FOLDER` and that Distribution Combination is populated.
