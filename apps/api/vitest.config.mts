import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['test/**/*.test.ts', 'src/**/*.spec.ts'],
    // Procesos separados: más seguro con el módulo nativo better-sqlite3.
    pool: 'forks',
    testTimeout: 20_000,
    hookTimeout: 60_000,
  },
});
