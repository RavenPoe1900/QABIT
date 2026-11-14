import { existsSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, isAbsolute, join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { DEFAULT_HOST, DEFAULT_PORT, ensureDbDir, findApiRoot, resolveDbPath, resolveHost, resolvePort } from '../src/config/env';

const apiRoot = resolve(__dirname, '..');

describe('configuración de la ruta de SQLite', () => {
  it('findApiRoot localiza apps/api desde src/ (la misma lógica sirve desde dist/)', () => {
    expect(findApiRoot()).toBe(apiRoot);
    expect(findApiRoot(join(apiRoot, 'src', 'config'))).toBe(apiRoot);
  });

  it('sin DB_PATH usa apps/api/data/tasks.db, sin depender del directorio actual', () => {
    expect(resolveDbPath({})).toBe(join(apiRoot, 'data', 'tasks.db'));
    expect(resolveDbPath({ DB_PATH: '   ' })).toBe(join(apiRoot, 'data', 'tasks.db'));
  });

  it('un DB_PATH relativo se resuelve desde apps/api/, no desde el directorio actual', () => {
    const resolved = resolveDbPath({ DB_PATH: 'tmp/otra/base.db' });
    expect(resolved).toBe(join(apiRoot, 'tmp', 'otra', 'base.db'));
    expect(resolved.startsWith(process.cwd()) && process.cwd() !== apiRoot).toBe(false);
  });

  it('un DB_PATH absoluto se usa tal cual', () => {
    const absolute = join(tmpdir(), 'cualquier', 'sitio', 'base.db');
    expect(isAbsolute(absolute)).toBe(true);
    expect(resolveDbPath({ DB_PATH: absolute })).toBe(absolute);
  });

  it('ensureDbDir crea la carpeta padre completa de la ruta efectiva, no solo data/', () => {
    const dir = mkdtempSync(join(tmpdir(), 'tasks-test-'));
    try {
      const dbPath = join(dir, 'a', 'b', 'c', 'tasks.db');
      expect(existsSync(dirname(dbPath))).toBe(false);
      ensureDbDir(dbPath);
      expect(existsSync(dirname(dbPath))).toBe(true);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

describe('puerto de la API (PORT)', () => {
  it('sin PORT, o vacío, usa 3001', () => {
    expect(DEFAULT_PORT).toBe(3001);
    expect(resolvePort({})).toBe(3001);
    expect(resolvePort({ PORT: '' })).toBe(3001);
    expect(resolvePort({ PORT: '   ' })).toBe(3001);
  });

  it.each([
    ['3101', 3101],
    [' 3101 ', 3101],
    ['1', 1],
    ['65535', 65535],
  ])('acepta %j', (raw, expected) => {
    expect(resolvePort({ PORT: raw })).toBe(expected);
  });

  it.each(['abc', '0', '65536', '70000', '-1', '30.5', '3001abc', '0x1F90', '1e3', 'NaN'])(
    'un PORT inválido (%j) es un ERROR claro, no se ignora en silencio',
    (raw) => {
      expect(() => resolvePort({ PORT: raw })).toThrow(/PORT no válido/);
    },
  );
});

describe('configuración de HOST', () => {
  it('sin HOST (o vacío) solo escucha en local', () => {
    expect(resolveHost({})).toBe(DEFAULT_HOST);
    expect(resolveHost({ HOST: '  ' })).toBe(DEFAULT_HOST);
  });

  it('usa HOST recortado si se indica', () => {
    expect(resolveHost({ HOST: ' 0.0.0.0 ' })).toBe('0.0.0.0');
  });
});
