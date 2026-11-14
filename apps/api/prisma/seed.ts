import { PrismaBetterSqlite3 } from '@prisma/adapter-better-sqlite3';
import { PrismaClient } from '../src/generated/prisma/client';
import { ensureDbDir, loadApiEnv, resolveDbPath } from '../src/config/env';

/**
 * Datos de ejemplo para ver la tabla con contenido. Es idempotente: vacía `tasks`
 * y la vuelve a rellenar (solo para desarrollo; borra las tareas existentes).
 * Uso: npm run db:seed -w @task-manager/api
 */
const DAY = 24 * 60 * 60 * 1000;

const SAMPLE = [
  { title: 'Diseñar el esquema de la base de datos', assignee: 'Ana García', status: 'done', daysAgo: 12 },
  { title: 'Configurar el pipeline de CI', assignee: 'Luis Martín', status: 'done', daysAgo: 11 },
  { title: 'Implementar endpoint POST /tasks', assignee: 'Ana García', status: 'done', daysAgo: 9 },
  { title: 'Validar el body con Zod', assignee: 'Carlos Ruiz', status: 'done', daysAgo: 8 },
  { title: 'Maquetar la tabla de tareas', assignee: 'Marta López', status: 'in_progress', daysAgo: 6 },
  { title: 'Formulario de creación de tareas', assignee: 'Marta López', status: 'in_progress', daysAgo: 5 },
  { title: 'Tests e2e del flujo principal', assignee: 'Luis Martín', status: 'in_progress', daysAgo: 4 },
  { title: 'Documentar la API con Swagger', assignee: 'Carlos Ruiz', status: 'in_progress', daysAgo: 3 },
  { title: 'Filtrar tareas por estado', assignee: 'Ana García', status: 'pending', daysAgo: 2 },
  { title: 'Gestionar errores 409 por edición concurrente', assignee: 'Carlos Ruiz', status: 'pending', daysAgo: 2 },
  { title: 'Revisar accesibilidad del formulario', assignee: 'Marta López', status: 'pending', daysAgo: 1 },
  { title: 'Escribir el README con instrucciones de arranque', assignee: 'Luis Martín', status: 'pending', daysAgo: 0 },
] as const;

async function main(): Promise<void> {
  loadApiEnv();
  const dbPath = resolveDbPath();
  ensureDbDir(dbPath);

  const prisma = new PrismaClient({ adapter: new PrismaBetterSqlite3({ url: `file:${dbPath}` }) });
  try {
    const now = Date.now();
    await prisma.$transaction([
      prisma.task.deleteMany(),
      prisma.$executeRaw`DELETE FROM sqlite_sequence WHERE name = 'tasks'`,
      ...SAMPLE.map(({ daysAgo, ...t }) => {
        const createdAt = new Date(now - daysAgo * DAY);
        return prisma.task.create({ data: { ...t, createdAt, updatedAt: createdAt } });
      }),
    ]);
    console.log(`Seed completado: ${SAMPLE.length} tareas en ${dbPath}`);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
