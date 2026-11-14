import { defineConfig } from 'prisma/config';
import { ensureDbDir, loadApiEnv, resolveDbPath } from './src/config/env';

// Misma carga de variables y misma resolución de ruta que la aplicación Nest.
loadApiEnv();
const dbPath = resolveDbPath();
ensureDbDir(dbPath);

export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: { path: 'prisma/migrations' },
  datasource: { url: `file:${dbPath}` },
});
