import { defineConfig } from 'vitest/config';

/**
 * Benchmarks run on demand (`npm run bench`), never in the normal suite or in
 * CI: on a 10 000-element dossier they take minutes by design.
 */
export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/**/__benchmarks__/*.bench.ts'],
    testTimeout: 30 * 60 * 1000,
    // One file at a time: parallel runs would compete for CPU and skew timings.
    fileParallelism: false,
  },
});
