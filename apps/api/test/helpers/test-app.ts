import { copyFileSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { inject } from 'vitest';
import { AppModule } from '../../src/app.module';
import { APP_OPTIONS, initApp } from '../../src/app.setup';
import { DB_URL, PrismaService } from '../../src/infrastructure/prisma/prisma.service';
import type { TaskRepository } from '../../src/modules/tasks/application/ports/task-repository.port';
import { TASK_REPOSITORY } from '../../src/modules/tasks/application/ports/task-repository.port';
import { PrismaTaskRepository } from '../../src/modules/tasks/infrastructure/persistence/prisma-task.repository';
import { CLOCK, type Clock } from '../../src/shared-kernel/clock';

export interface TestAppOptions {
  clock?: Clock;
  /** Sustituye el repositorio (para forzar errores internos). Por defecto se usa Prisma real. */
  repository?: TaskRepository;
  /** Envuelve el repositorio Prisma REAL (p. ej. con GatedRepository para pruebas de concurrencia). */
  wrapRepository?: (real: TaskRepository) => TaskRepository;
  /** Reutiliza un archivo de base ya existente (para probar la persistencia). */
  dbPath?: string;
}

export interface TestApp {
  app: NestExpressApplication;
  dbPath: string;
  http: () => ReturnType<typeof request>;
  /** Cierra la app. Borra la carpeta temporal solo si la creó este helper. */
  close: () => Promise<void>;
}

/**
 * Monta la API real (módulos, filtros, parser) sin abrir ningún puerto, sobre una base SQLite
 * propia: una copia de la plantilla creada con `prisma migrate deploy`.
 */
export async function createTestApp(options: TestAppOptions = {}): Promise<TestApp> {
  let dir: string | undefined;
  let dbPath = options.dbPath;
  if (!dbPath) {
    // Carpeta temporal propia de este test (prefijo autorizado para borrado automático).
    dir = mkdtempSync(join(tmpdir(), 'tasks-test-'));
    dbPath = join(dir, 'test.db');
    copyFileSync(inject('templateDb'), dbPath);
  }

  let builder = Test.createTestingModule({ imports: [AppModule] })
    .overrideProvider(DB_URL)
    .useValue(`file:${dbPath}`);
  if (options.clock) builder = builder.overrideProvider(CLOCK).useValue(options.clock);
  if (options.repository) builder = builder.overrideProvider(TASK_REPOSITORY).useValue(options.repository);
  if (options.wrapRepository) {
    const wrap = options.wrapRepository;
    builder = builder.overrideProvider(TASK_REPOSITORY).useFactory({
      inject: [PrismaService],
      factory: (prisma: PrismaService) => wrap(new PrismaTaskRepository(prisma)),
    });
  }

  const moduleRef = await builder.compile();
  const app = moduleRef.createNestApplication<NestExpressApplication>(APP_OPTIONS);
  app.useLogger(false); // sin ruido de logs en la salida de los tests
  await initApp(app);

  return {
    app,
    dbPath,
    http: () => request(app.getHttpServer()),
    close: async () => {
      await app.close();
      if (dir) rmSync(dir, { recursive: true, force: true });
    },
  };
}
