import { readFileSync, readdirSync } from 'node:fs';
import { dirname, join, relative, resolve, sep } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * Regla de dependencias de la arquitectura hexagonal, comprobada leyendo los imports reales.
 *
 *   domain          → solo domain y shared-kernel (nada de frameworks, ni del contrato HTTP)
 *   application     → domain, sus puertos y shared-kernel
 *   infrastructure  → puede usar todo lo anterior, pero un ADAPTADOR no importa a otro
 *   shared-kernel   → no depende de nada del proyecto ni de frameworks
 *   infraestructura global (src/infrastructure) → no conoce ningún módulo de dominio
 */
const SRC = resolve(__dirname, '../src');
const TASKS = join(SRC, 'modules/tasks');

function sourceFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) return sourceFiles(path);
    return entry.name.endsWith('.ts') && !entry.name.endsWith('.spec.ts') ? [path] : [];
  });
}

interface Import {
  file: string;
  /** Lo que aparece entre comillas. */
  spec: string;
  /** Ruta absoluta (sin extensión) si es un import relativo; si no, el propio paquete. */
  target: string;
}

function importsOf(file: string): Import[] {
  const source = readFileSync(file, 'utf8');
  const specs = [
    ...source.matchAll(/(?:import|export)\s[^'"]*?from\s+['"]([^'"]+)['"]/g),
    ...source.matchAll(/import\(\s*['"]([^'"]+)['"]\s*\)/g),
    ...source.matchAll(/require\(\s*['"]([^'"]+)['"]\s*\)/g),
  ].map((m) => m[1]);
  return specs.map((spec) => ({
    file: relative(SRC, file),
    spec,
    target: spec.startsWith('.') ? resolve(dirname(file), spec) : spec,
  }));
}

const isInside = (target: string, dir: string) => target === dir || target.startsWith(dir + sep);
const describeImport = (i: Import) => `${i.file} importa '${i.spec}'`;

const FRAMEWORKS = [/^@nestjs\//, /^@prisma\//, /^express/, /^better-sqlite3/, /^zod/, /^@task-manager\/shared/];
const isFramework = (i: Import) => !i.spec.startsWith('.') && FRAMEWORKS.some((rule) => rule.test(i.spec));

describe('arquitectura hexagonal: regla de dependencias', () => {
  it.each(['domain', 'application'])(
    '%s no importa frameworks, la base de datos ni el contrato HTTP (@task-manager/shared)',
    (layer) => {
      const files = sourceFiles(join(TASKS, layer));
      expect(files.length).toBeGreaterThan(0);
      for (const i of files.flatMap(importsOf)) {
        expect(isFramework(i), describeImport(i)).toBe(false);
        expect(i.target.includes('generated'), describeImport(i)).toBe(false);
      }
    },
  );

  it('domain solo depende de domain y de shared-kernel', () => {
    for (const i of sourceFiles(join(TASKS, 'domain')).flatMap(importsOf)) {
      const ok = isInside(i.target, join(TASKS, 'domain')) || isInside(i.target, join(SRC, 'shared-kernel'));
      expect(ok, describeImport(i)).toBe(true);
    }
  });

  it('application solo depende de domain, de application y de shared-kernel', () => {
    for (const i of sourceFiles(join(TASKS, 'application')).flatMap(importsOf)) {
      const ok =
        isInside(i.target, join(TASKS, 'domain')) ||
        isInside(i.target, join(TASKS, 'application')) ||
        isInside(i.target, join(SRC, 'shared-kernel'));
      expect(ok, describeImport(i)).toBe(true);
    }
  });

  it('un adaptador no importa a otro: http no conoce la persistencia ni Prisma, y al revés', () => {
    const http = join(TASKS, 'infrastructure/http');
    const persistence = join(TASKS, 'infrastructure/persistence');
    for (const i of sourceFiles(http).flatMap(importsOf)) {
      const touchesPersistence =
        isInside(i.target, persistence) ||
        isInside(i.target, join(SRC, 'infrastructure/prisma')) ||
        /^@prisma\//.test(i.spec) ||
        i.target.includes('generated');
      expect(touchesPersistence, describeImport(i)).toBe(false);
    }
    for (const i of sourceFiles(persistence).flatMap(importsOf)) {
      const touchesHttp =
        isInside(i.target, http) || isInside(i.target, join(SRC, 'infrastructure/http')) || /^@nestjs\/swagger/.test(i.spec);
      expect(touchesHttp, describeImport(i)).toBe(false);
    }
  });

  it('el adaptador de persistencia no depende del contrato HTTP', () => {
    for (const i of sourceFiles(join(TASKS, 'infrastructure/persistence')).flatMap(importsOf)) {
      expect(/^@task-manager\/shared/.test(i.spec), describeImport(i)).toBe(false);
    }
  });

  it('shared-kernel no depende de nada del proyecto ni de frameworks', () => {
    for (const i of sourceFiles(join(SRC, 'shared-kernel')).flatMap(importsOf)) {
      const ok = isInside(i.target, join(SRC, 'shared-kernel'));
      expect(ok && !isFramework(i), describeImport(i)).toBe(true);
    }
  });

  it('la infraestructura global (src/infrastructure) no conoce ningún módulo de dominio', () => {
    for (const i of sourceFiles(join(SRC, 'infrastructure')).flatMap(importsOf)) {
      expect(isInside(i.target, join(SRC, 'modules')), describeImport(i)).toBe(false);
    }
  });

  it('la composición (unir puertos con adaptadores) solo ocurre en el módulo', () => {
    // Nadie fuera de tasks.module.ts y de los tests crea el adaptador de persistencia.
    const users = sourceFiles(SRC)
      .filter((file) => readFileSync(file, 'utf8').includes('PrismaTaskRepository'))
      .map((file) => relative(SRC, file));
    expect(users.sort()).toEqual(
      ['modules/tasks/infrastructure/persistence/prisma-task.repository.ts', 'modules/tasks/tasks.module.ts'].sort(),
    );
  });
});
