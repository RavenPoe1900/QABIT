import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import type { TestProject } from 'vitest/node';

/**
 * Crea UNA base plantilla aplicando las migraciones reales con `prisma migrate deploy`
 * (no ejecutando el SQL a mano), de modo que los tests usan el mismo esquema que la app y
 * el mismo motor de migraciones. Cada test copia esta plantilla a su propio archivo.
 */
export default function setup(project: TestProject): () => void {
  const dir = mkdtempSync(join(tmpdir(), 'tasks-test-template-'));
  const templateDb = join(dir, 'template.db');

  execFileSync('npx', ['prisma', 'migrate', 'deploy'], {
    cwd: resolve(__dirname, '..'),
    env: { ...process.env, DB_PATH: templateDb },
    stdio: 'pipe',
  });

  project.provide('templateDb', templateDb);

  // Solo se borra la carpeta temporal que creó esta función (prefijo tasks-test-).
  return () => rmSync(dir, { recursive: true, force: true });
}
