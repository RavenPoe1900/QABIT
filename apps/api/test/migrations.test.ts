import { copyFileSync, mkdtempSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import Database from 'better-sqlite3';
import { afterEach, beforeEach, describe, expect, it, inject } from 'vitest';

const migrationsDir = resolve(__dirname, '../prisma/migrations');
const INSERT = 'INSERT INTO tasks (title, assignee, status, updated_at) VALUES (?, ?, ?, ?)';
const NOW = '2026-01-01T00:00:00.000Z';

describe('migraciones aplicadas con `prisma migrate deploy` (no con SQL a mano)', () => {
  let dir: string;
  let db: Database.Database;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'tasks-test-'));
    const file = join(dir, 'check.db');
    copyFileSync(inject('templateDb'), file);
    db = new Database(file);
  });
  afterEach(() => {
    db.close();
    rmSync(dir, { recursive: true, force: true });
  });

  it('el motor de migraciones registró cada migración de la carpeta', () => {
    const onDisk = readdirSync(migrationsDir, { withFileTypes: true })
      .filter((entry) => entry.isDirectory())
      .map((entry) => entry.name)
      .sort();
    const applied = db
      .prepare('SELECT migration_name AS name FROM _prisma_migrations WHERE finished_at IS NOT NULL ORDER BY migration_name')
      .all() as { name: string }[];

    expect(onDisk.length).toBeGreaterThan(0);
    expect(applied.map((row) => row.name)).toEqual(onDisk);
  });

  it('acepta datos válidos y aplica el estado por defecto «pending»', () => {
    db.prepare('INSERT INTO tasks (title, assignee, updated_at) VALUES (?, ?, ?)').run('T', 'A', NOW);
    const row = db.prepare('SELECT status FROM tasks').get() as { status: string };
    expect(row.status).toBe('pending');
    expect(() => db.prepare(INSERT).run('x'.repeat(120), 'y'.repeat(60), 'done', NOW)).not.toThrow();
  });

  it.each([
    ['estado fuera del contrato', ['T', 'A', 'foo', NOW], 'tasks_status_check'],
    ['título vacío', ['', 'A', 'pending', NOW], 'tasks_title_check'],
    ['título solo con espacios', ['   ', 'A', 'pending', NOW], 'tasks_title_check'],
    ['título de 121 caracteres', ['x'.repeat(121), 'A', 'pending', NOW], 'tasks_title_check'],
    ['responsable vacío', ['T', '', 'pending', NOW], 'tasks_assignee_check'],
    ['responsable de 61 caracteres', ['T', 'y'.repeat(61), 'pending', NOW], 'tasks_assignee_check'],
  ])('la base rechaza: %s', (_name, values, constraint) => {
    expect(() => db.prepare(INSERT).run(...values)).toThrow(constraint);
  });
});
