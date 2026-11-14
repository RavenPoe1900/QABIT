import { rmSync } from 'node:fs';
import { dirname } from 'node:path';
import { taskSchema } from '@task-manager/shared';
import { describe, expect, it } from 'vitest';
import { createTestApp } from './helpers/test-app';

describe('persistencia', () => {
  it('los datos siguen ahí al «reiniciar» la app sobre el mismo archivo SQLite', async () => {
    const first = await createTestApp();
    try {
      const created = await first.http().post('/api/tasks').send({ title: 'Persistente', assignee: 'Ana' });
      expect(created.status).toBe(201);
      const task = taskSchema.parse(created.body);
      await first.app.close(); // se cierra la conexión, pero se conserva el archivo

      const second = await createTestApp({ dbPath: first.dbPath });
      try {
        const res = await second.http().get('/api/tasks');
        expect(res.body).toEqual([task]);
      } finally {
        await second.app.close();
      }
    } finally {
      // Solo la carpeta temporal que creó este test (tasks-test-…).
      rmSync(dirname(first.dbPath), { recursive: true, force: true });
    }
  });
});
