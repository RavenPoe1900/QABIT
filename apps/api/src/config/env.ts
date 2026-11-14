import { existsSync, mkdirSync } from 'node:fs';
import { dirname, isAbsolute, join, resolve } from 'node:path';

/**
 * Sube desde `start` hasta encontrar el package.json de apps/api.
 * No depende de la profundidad de __dirname: funciona igual desde src/ (Nest en
 * modo watch, Prisma CLI) y desde dist/ (API compilada).
 */
export function findApiRoot(start: string = __dirname): string {
  let dir = start;
  while (!existsSync(join(dir, 'package.json'))) {
    const parent = dirname(dir);
    if (parent === dir) {
      throw new Error('No se encontró el package.json de apps/api');
    }
    dir = parent;
  }
  return dir;
}

/**
 * Carga apps/api/.env (si existe) en process.env. Lo usan tanto la aplicación
 * Nest como prisma.config.ts, para que ambas lean exactamente las mismas variables.
 * Node no sobrescribe variables que ya existan en el entorno.
 */
export function loadApiEnv(): void {
  const file = join(findApiRoot(), '.env');
  if (existsSync(file)) {
    process.loadEnvFile(file);
  }
}

/**
 * Ruta efectiva del archivo SQLite.
 * - Sin DB_PATH: apps/api/data/tasks.db
 * - DB_PATH relativo: se resuelve desde apps/api/ (nunca desde el directorio actual)
 * - DB_PATH absoluto: se usa tal cual
 */
export function resolveDbPath(env: NodeJS.ProcessEnv = process.env): string {
  const raw = env.DB_PATH?.trim() || 'data/tasks.db';
  return isAbsolute(raw) ? raw : resolve(findApiRoot(), raw);
}

export const DEFAULT_HOST = '127.0.0.1';

/** Dirección en la que escucha la API. Sin `HOST` (o vacío) solo acepta conexiones locales. */
export function resolveHost(env: NodeJS.ProcessEnv = process.env): string {
  return env.HOST?.trim() || DEFAULT_HOST;
}

export const DEFAULT_PORT = 3001;

/**
 * Puerto de la API. Sin `PORT` (o vacío) usa 3001. Un valor que no sea un entero entre 1 y 65535 es un
 * ERROR: arrancar en otro puerto sin avisar dejaría a la web apuntando a una API que no existe.
 */
export function resolvePort(env: NodeJS.ProcessEnv = process.env): number {
  const raw = env.PORT?.trim();
  if (!raw) return DEFAULT_PORT;
  const port = Number(raw);
  if (!/^\d+$/.test(raw) || port < 1 || port > 65535) {
    throw new Error(`PORT no válido: «${raw}». Debe ser un entero entre 1 y 65535.`);
  }
  return port;
}

/** Crea la carpeta padre de la ruta efectiva (no solo `data/`). */
export function ensureDbDir(dbPath: string): void {
  mkdirSync(dirname(dbPath), { recursive: true });
}
