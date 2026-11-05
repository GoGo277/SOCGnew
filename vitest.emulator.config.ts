import { defineConfig } from 'vitest/config';

/** Suites that need the Firebase Emulator Suite (run via `firebase emulators:exec`). */
export default defineConfig({
  test: {
    environment: 'node',
    include: ['tests/rules/**/*.test.ts', 'tests/functions/**/*.test.ts'],
    testTimeout: 30000,
    hookTimeout: 60000,
    fileParallelism: false,
    // Load the Firebase SDK through Vite so compat app and compat firestore share one instance.
    server: { deps: { inline: [/node_modules\/firebase\//, /node_modules\/@firebase\//] } },
  },
});
