import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

const source = (path: string) => fileURLToPath(new URL(`../../packages/${path}`, import.meta.url));

export default defineConfig({
  resolve: {
    // Tests read workspace package source so a stale dist build cannot fail them.
    alias: [
      {
        find: /^@aljeel\/kb-upload\/(dist\/)?server$/,
        replacement: source('kb-upload/src/server.ts'),
      },
      { find: /^@aljeel\/kb-upload$/, replacement: source('kb-upload/src/index.ts') },
      { find: /^@aljeel\/shared-types$/, replacement: source('shared-types/src/index.ts') },
    ],
  },
  test: {
    globals: false,
    environment: 'node',
    include: ['src/**/*.spec.ts'],
  },
});
