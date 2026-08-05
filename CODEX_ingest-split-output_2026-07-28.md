```diff
diff --git a/apps/api/src/ap/jawal-integration.service.ts b/apps/api/src/ap/jawal-integration.service.ts
index d083f0c..5b4fc88 100644
--- a/apps/api/src/ap/jawal-integration.service.ts
+++ b/apps/api/src/ap/jawal-integration.service.ts
@@ -410,13 +410,23 @@ export class JawalIntegrationService implements OnModuleInit, OnModuleDestroy {
       `jawal-${invoice.invoiceNumber}`,
       'output',
     );
+    const expectedSplit = join(
+      outputDir,
+      `Spreadsheet-${invoice.invoiceNumber}-FILLED-v30-SPLIT.xlsx`,
+    );
+    if (await this.exists(expectedSplit)) {
+      return expectedSplit;
+    }
     const expected = join(outputDir, `Spreadsheet-${invoice.invoiceNumber}-FILLED-v30.xlsx`);
     if (await this.exists(expected)) {
       return expected;
     }
     const files = await readdir(outputDir).catch(() => [] as string[]);
     const xlsx = files.filter((file) => file.toLowerCase().endsWith('.xlsx'));
-    const found = xlsx.find((file) => /filled/i.test(file)) ?? xlsx[0];
+    const found =
+      xlsx.find((file) => /-split/i.test(file)) ??
+      xlsx.find((file) => /filled/i.test(file)) ??
+      xlsx[0];
     if (!found) {
       throw new Error('Jawal resolved output file was not found on disk.');
     }
```
