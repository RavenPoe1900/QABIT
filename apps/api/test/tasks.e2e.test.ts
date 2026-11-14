import { taskListSchema, taskSchema, apiErrorSchema } from '@task-manager/shared';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { TaskRepository } from '../src/modules/tasks/application/ports/task-repository.port';
import { FakeClock } from './helpers/fake-clock';
import { CreateTaskUseCase } from '../src/modules/tasks/application/create-task.use-case';
import { TaskValidationError } from '../src/modules/tasks/domain/task-errors';
import { taskErrorToHttp } from '../src/modules/tasks/infrastructure/http/task-errors.filter';
import { GatedRepository } from './helpers/gated-repository';
import { createTestApp, type TestApp } from './helpers/test-app';

const INTERNAL_ERROR_BODY = {
  error: { code: 'INTERNAL_ERROR', message: 'Error interno del servidor' },
};

let t: TestApp;

async function createTask(title = 'Preparar demo', assignee = 'Ana') {
  const res = await t.http().post('/api/tasks').send({ title, assignee });
  expect(res.status).toBe(201);
  return taskSchema.parse(res.body);
}

async function expectNoTasks() {
  const res = await t.http().get('/api/tasks');
  expect(res.status).toBe(200);
  expect(res.body).toEqual([]);
}

describe('API de tareas (base SQLite aislada por test)', () => {
  beforeEach(async () => {
    t = await createTestApp();
  });
  afterEach(async () => {
    await t.close();
  });

  describe('obligatorio 1: crear una tarea válida', () => {
    it('devuelve 201, cumple el contrato y se puede recuperar', async () => {
      const res = await t.http().post('/api/tasks').send({ title: 'Preparar demo', assignee: 'Ana' });

      expect(res.status).toBe(201);
      const task = taskSchema.parse(res.body); // el cuerpo cumple el esquema compartido
      expect(task).toMatchObject({ title: 'Preparar demo', assignee: 'Ana', status: 'pending' });
      expect(task.createdAt).toBe(task.updatedAt);

      const all = await t.http().get('/api/tasks');
      expect(all.status).toBe(200);
      expect(taskListSchema.parse(all.body)).toEqual([task]);

      const pending = await t.http().get('/api/tasks?status=pending');
      expect(pending.body).toEqual([task]);
      const done = await t.http().get('/api/tasks?status=done');
      expect(done.body).toEqual([]);
      const emptyFilter = await t.http().get('/api/tasks?status=');
      expect(emptyFilter.body).toEqual([task]);
    });

    it('recorta los espacios del título y del responsable', async () => {
      const task = await createTask('  Con espacios  ', ' Luis ');
      expect(task).toMatchObject({ title: 'Con espacios', assignee: 'Luis' });
    });
  });

  describe('obligatorio 2: datos inválidos devuelven 400', () => {
    it.each([
      ['título vacío', { title: '', assignee: 'Ana' }, 'title'],
      ['título solo con espacios', { title: '   ', assignee: 'Ana' }, 'title'],
      ['título de 121 caracteres', { title: 'x'.repeat(121), assignee: 'Ana' }, 'title'],
      ['responsable vacío', { title: 'Tarea', assignee: '' }, 'assignee'],
      ['responsable de 61 caracteres', { title: 'Tarea', assignee: 'y'.repeat(61) }, 'assignee'],
      ['título que no es texto', { title: 123, assignee: 'Ana' }, 'title'],
      ['falta el responsable', { title: 'Tarea' }, 'assignee'],
      ['status en la creación', { title: 'Tarea', assignee: 'Ana', status: 'done' }, '(body)'],
      ['campo extra', { title: 'Tarea', assignee: 'Ana', extra: true }, '(body)'],
    ])('rechaza: %s', async (_name, body, path) => {
      const res = await t.http().post('/api/tasks').send(body);

      expect(res.status).toBe(400);
      const parsed = apiErrorSchema.parse(res.body);
      expect(parsed.error.code).toBe('VALIDATION_ERROR');
      expect(parsed.error.details?.map((d) => d.path)).toContain(path);
      await expectNoTasks(); // un rechazo del contrato garantiza que no se guardó nada
    });

    it('rechaza una petición sin cuerpo', async () => {
      const res = await t.http().post('/api/tasks');
      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('VALIDATION_ERROR');
    });

    it('acepta justo en el límite (120 y 60 caracteres)', async () => {
      const res = await t
        .http()
        .post('/api/tasks')
        .send({ title: 'x'.repeat(120), assignee: 'y'.repeat(60) });
      expect(res.status).toBe(201);
    });
  });

  describe('JSON mal formado y cuerpos demasiado grandes', () => {
    it('JSON mal formado devuelve 400 INVALID_JSON sin filtrar detalles del parser', async () => {
      const res = await t
        .http()
        .post('/api/tasks')
        .set('Content-Type', 'application/json')
        .send('{"title": "x", "assignee": ');

      expect(res.status).toBe(400);
      expect(res.body).toEqual({
        error: { code: 'INVALID_JSON', message: 'El cuerpo no es JSON válido' },
      });
      expect(JSON.stringify(res.body)).not.toMatch(/Unexpected|position|token/i);
      await expectNoTasks();
    });

    it('un cuerpo de más de 100 KB devuelve 413 PAYLOAD_TOO_LARGE', async () => {
      const res = await t
        .http()
        .post('/api/tasks')
        .send({ title: 'x'.repeat(200_000), assignee: 'Ana' });

      expect(res.status).toBe(413);
      expect(apiErrorSchema.parse(res.body).error.code).toBe('PAYLOAD_TOO_LARGE');
      await expectNoTasks();
    });

    it.each([
      ['empieza por NUL', '\u0000abc'],
      ['contiene un salto de línea', 'a\nb'],
    ])('un título que %s se rechaza con 400 (no con un 500 por el CHECK de SQLite)', async (_name, title) => {
      const res = await t.http().post('/api/tasks').send({ title, assignee: 'Ana' });

      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('VALIDATION_ERROR');
      expect(res.body.error.details).toEqual([
        { path: 'title', message: 'El título no puede contener caracteres de control' },
      ]);
      await expectNoTasks();
    });

    it('120 emojis caben como título (la longitud cuenta puntos de código, como en SQLite)', async () => {
      const res = await t.http().post('/api/tasks').send({ title: '😀'.repeat(120), assignee: 'Ana' });
      expect(res.status).toBe(201);
      expect((await t.http().get('/api/tasks')).body[0].title).toBe('😀'.repeat(120));
    });

    it('un cuerpo enviado como text/plain se rechaza con 400 y un mensaje en español', async () => {
      const res = await t
        .http()
        .post('/api/tasks')
        .set('Content-Type', 'text/plain')
        .send('{"title":"x","assignee":"y"}');

      expect(res.status).toBe(400);
      expect(res.body).toEqual({
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Datos inválidos',
          details: [{ path: '(body)', message: 'Se esperaba un objeto JSON' }],
        },
      });
      await expectNoTasks();
    });

    it('un juego de caracteres no admitido devuelve 415 UNSUPPORTED_MEDIA_TYPE', async () => {
      const res = await t
        .http()
        .post('/api/tasks')
        .set('Content-Type', 'application/json; charset=latin1')
        .send('{"title":"x","assignee":"y"}');

      expect(res.status).toBe(415);
      expect(res.body).toEqual({
        error: { code: 'UNSUPPORTED_MEDIA_TYPE', message: 'Codificación del cuerpo no admitida' },
      });
      await expectNoTasks();
    });
  });

  describe('listar y filtrar', () => {
    it('sin tareas devuelve un array vacío', async () => {
      await expectNoTasks();
    });

    it.each([
      ['estado desconocido', '?status=foo', 'status', 'Estado no válido'],
      ['parámetro repetido', '?status=done&status=pending', 'status', 'Estado no válido'],
      ['parámetro desconocido', '?other=1', '(query)', 'Campos no permitidos: other'],
    ])('rechaza con 400 y un detalle útil en español: %s', async (_name, query, path, message) => {
      const res = await t.http().get(`/api/tasks${query}`);
      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('VALIDATION_ERROR');
      expect(res.body.error.details).toEqual([{ path, message }]);
    });

    it('filtra por cada estado', async () => {
      const a = await createTask('A');
      const b = await createTask('B');
      await t.http().patch(`/api/tasks/${b.id}/status`).send({ status: 'in_progress' });

      const inProgress = await t.http().get('/api/tasks?status=in_progress');
      expect(inProgress.body.map((x: { id: number }) => x.id)).toEqual([b.id]);
      const pending = await t.http().get('/api/tasks?status=pending');
      expect(pending.body.map((x: { id: number }) => x.id)).toEqual([a.id]);
    });

    it('ordena por createdAt descendente y, en empate, por id descendente', async () => {
      const clock = new FakeClock(new Date('2026-01-01T00:00:00.000Z'));
      await t.close();
      t = await createTestApp({ clock });

      const first = await createTask('Primera');
      clock.set(new Date('2026-01-01T00:01:00.000Z'));
      const second = await createTask('Segunda');
      const third = await createTask('Tercera (misma hora que la segunda)');

      const res = await t.http().get('/api/tasks');
      expect(res.body.map((x: { id: number }) => x.id)).toEqual([third.id, second.id, first.id]);
    });
  });

  describe('cambiar el estado', () => {
    it('cambia a cualquier otro estado válido y devuelve la tarea actualizada', async () => {
      const task = await createTask();
      for (const status of ['done', 'pending', 'in_progress'] as const) {
        const res = await t.http().patch(`/api/tasks/${task.id}/status`).send({ status });
        expect(res.status).toBe(200);
        expect(taskSchema.parse(res.body)).toMatchObject({ id: task.id, status });
      }
    });

    it.each([
      ['id no numérico', 'abc', { status: 'done' }, 400, 'VALIDATION_ERROR'],
      ['id cero', '0', { status: 'done' }, 400, 'VALIDATION_ERROR'],
      ['id con ceros a la izquierda', '01', { status: 'done' }, 400, 'VALIDATION_ERROR'],
      ['id mayor que el máximo', '2147483648', { status: 'done' }, 400, 'VALIDATION_ERROR'],
      ['estado desconocido', '1', { status: 'archived' }, 400, 'VALIDATION_ERROR'],
      ['campo extra', '1', { status: 'done', title: 'x' }, 400, 'VALIDATION_ERROR'],
      ['tarea inexistente', '999', { status: 'done' }, 404, 'TASK_NOT_FOUND'],
    ])('%s', async (_name, id, body, status, code) => {
      const res = await t.http().patch(`/api/tasks/${id}/status`).send(body);
      expect(res.status).toBe(status);
      expect(apiErrorSchema.parse(res.body).error.code).toBe(code);
    });
  });

  describe('ubicación del error en `details.path`', () => {
    it('un id mal formado de la URL se señala como `id`, no como `(body)`', async () => {
      const res = await t.http().patch('/api/tasks/abc/status').send({ status: 'done' });
      expect(res.status).toBe(400);
      expect(res.body.error.details).toEqual([{ path: 'id', message: 'Identificador no válido' }]);
    });

    it('un campo no permitido en el cuerpo se señala como `(body)`', async () => {
      const res = await t.http().patch('/api/tasks/1/status').send({ status: 'done', title: 'x' });
      expect(res.body.error.details).toEqual([
        { path: '(body)', message: 'Campos no permitidos: title' },
      ]);
    });
  });

  describe('rutas inexistentes', () => {
    it.each([
      ['GET', '/api/nope'],
      ['GET', '/nope'],
      ['PUT', '/api/tasks'],
      ['DELETE', '/api/tasks/1'],
    ])('%s %s devuelve 404 ROUTE_NOT_FOUND', async (method, path) => {
      const res = await t.http()[method.toLowerCase() as 'get' | 'put' | 'delete'](path);
      expect(res.status).toBe(404);
      expect(res.body).toEqual({
        error: { code: 'ROUTE_NOT_FOUND', message: 'Ruta no encontrada' },
      });
    });
  });

  describe('cabeceras', () => {
    it('no expone X-Powered-By', async () => {
      const res = await t.http().get('/api/tasks');
      expect(res.headers['x-powered-by']).toBeUndefined();
    });
  });
});

describe('fechas con reloj controlado (no dependen del reloj real)', () => {
  it('createdAt/updatedAt en ISO UTC con milisegundos; updatedAt solo cambia si cambia el estado', async () => {
    const clock = new FakeClock(new Date('2026-01-01T00:00:00.123Z'));
    t = await createTestApp({ clock });
    try {
      const created = await createTask();
      expect(created.createdAt).toBe('2026-01-01T00:00:00.123Z'); // sin perder milisegundos
      expect(created.updatedAt).toBe('2026-01-01T00:00:00.123Z');

      clock.set(new Date('2026-01-01T00:05:00.456Z'));
      const changed = await t.http().patch(`/api/tasks/${created.id}/status`).send({ status: 'in_progress' });
      expect(changed.status).toBe(200);
      expect(changed.body.createdAt).toBe('2026-01-01T00:00:00.123Z');
      expect(changed.body.updatedAt).toBe('2026-01-01T00:05:00.456Z');

      // Mismo estado: se devuelve la tarea sin modificarla (updatedAt no se mueve).
      clock.set(new Date('2026-01-01T00:10:00.000Z'));
      const same = await t.http().patch(`/api/tasks/${created.id}/status`).send({ status: 'in_progress' });
      expect(same.status).toBe(200);
      expect(same.body).toEqual(changed.body);

      // Un cambio real vuelve a actualizar updatedAt.
      const done = await t.http().patch(`/api/tasks/${created.id}/status`).send({ status: 'done' });
      expect(done.body.updatedAt).toBe('2026-01-01T00:10:00.000Z');

      const list = await t.http().get('/api/tasks');
      expect(list.body[0]).toEqual(done.body);
    } finally {
      await t.close();
    }
  });
});

describe('errores internos', () => {
  const failingWith = (error: Error): TaskRepository => ({
    list: async () => {
      throw error;
    },
    findById: async () => {
      throw error;
    },
    create: async () => {
      throw error;
    },
    updateStatusIfUnchanged: async () => {
      throw error;
    },
  });

  it('un error inesperado devuelve 500 genérico, sin rutas, trazas ni detalles de SQLite', async () => {
    t = await createTestApp({
      repository: failingWith(new Error('SQLITE_IOERR: disk I/O error at /home/secreto/tasks.db')),
    });
    try {
      const res = await t.http().post('/api/tasks').send({ title: 'Tarea', assignee: 'Ana' });
      expect(res.status).toBe(500);
      expect(res.body).toEqual(INTERNAL_ERROR_BODY);
      expect(res.text).not.toMatch(/SQLITE|secreto|\/home|stack|at /i);
    } finally {
      await t.close();
    }
  });

  it('un SyntaxError INTERNO no se confunde con un JSON mal formado: es un 500', async () => {
    t = await createTestApp({
      repository: failingWith(new SyntaxError('Unexpected token } in JSON at position 5')),
    });
    try {
      const res = await t.http().get('/api/tasks');
      expect(res.status).toBe(500);
      expect(res.body).toEqual(INTERNAL_ERROR_BODY); // no INVALID_JSON
    } finally {
      await t.close();
    }
  });
});

describe('cambio de estado concurrente (SQLite real, peticiones HTTP reales)', () => {
  /**
   * La petición B se congela justo después de LEER la tarea; mientras, A se ejecuta entera; luego
   * se suelta B. Con la escritura condicional, el resultado equivale a ejecutarlas una detrás de
   * otra, y nunca se decide sobre un estado obsoleto.
   */
  async function race(statusA: string, statusB: string) {
    let gated!: GatedRepository;
    t = await createTestApp({ wrapRepository: (real) => (gated = new GatedRepository(real)) });
    const created = await t.http().post('/api/tasks').send({ title: 'T', assignee: 'A' });
    const id = created.body.id as number;

    const gate = gated.arm();
    const b = t.http().patch(`/api/tasks/${id}/status`).send({ status: statusB }).then((r) => r);
    await gate.reached; // B ya leyó «pending»

    const a = await t.http().patch(`/api/tasks/${id}/status`).send({ status: statusA });
    await new Promise((resolve) => setTimeout(resolve, 15)); // B tendrá otra hora en su reloj
    gate.release();
    const bRes = await b;

    const final = (await t.http().get('/api/tasks')).body[0];
    return { a, b: bRes, final };
  }

  afterEach(async () => {
    await t.close();
  });

  it('A y B piden «done»: B detecta que ya está hecha y NO reescribe updatedAt (regla acordada)', async () => {
    const { a, b, final } = await race('done', 'done');

    expect(a.status).toBe(200);
    expect(b.status).toBe(200);
    expect(final.status).toBe('done');
    expect(final.updatedAt).toBe(a.body.updatedAt); // antes del arreglo, B lo sobrescribía
    expect(b.body).toEqual(final); // B devuelve el estado REAL, no uno obsoleto
  });

  it('A pone «done» y B pide «in_progress»: B decide sobre el estado nuevo y gana como si llegara después', async () => {
    const { a, b, final } = await race('done', 'in_progress');

    expect(a.body.status).toBe('done');
    expect(b.status).toBe(200);
    expect(final.status).toBe('in_progress');
    expect(b.body).toEqual(final);
  });

  it('A pone «done» y B pide «pending» (lo que leyó): B no escribe; equivale a «B y después A»', async () => {
    const { a, b, final } = await race('done', 'pending');

    // B pidió el estado que ya tenía al leer: no hay nada que escribir y responde con lo leído.
    // Es un orden serie válido (B ocurrió antes que A), no un error: ninguna regla se incumple.
    expect(b.status).toBe(200);
    expect(b.body.status).toBe('pending');
    expect(b.body.updatedAt).toBe(b.body.createdAt); // B no tocó updatedAt
    expect(final.status).toBe('done');
    expect(final.updatedAt).toBe(a.body.updatedAt); // el cambio de A se conserva
  });

  it('si la tarea no deja de cambiar, responde 409 CONCURRENT_UPDATE sin aplicar el cambio', async () => {
    const task = { id: 1, title: 'T', assignee: 'A', status: 'pending' as const, createdAt: new Date(0), updatedAt: new Date(0) };
    t = await createTestApp({
      repository: {
        list: async () => [task],
        create: async () => task,
        findById: async () => task, // siempre lee «pending»…
        updateStatusIfUnchanged: async () => null, // …y la escritura condicional siempre llega tarde
      },
    });

    const res = await t.http().patch('/api/tasks/1/status').send({ status: 'done' });

    expect(res.status).toBe(409);
    expect(res.body).toEqual({
      error: {
        code: 'CONCURRENT_UPDATE',
        message: 'La tarea cambió mientras se actualizaba. Vuelve a cargarla e inténtalo de nuevo.',
      },
    });
  });
});

describe('las invariantes las aplica el DOMINIO aunque el adaptador HTTP no valide', () => {
  it('un TaskValidationError del dominio se traduce a 400 VALIDATION_ERROR con details por campo', async () => {
    t = await createTestApp();
    try {
      const useCase = t.app.get(CreateTaskUseCase);
      const error = await useCase.execute({ title: ' ', assignee: 'Ana' }).catch((e: unknown) => e);
      expect(error).toBeInstanceOf(TaskValidationError);
      expect(taskErrorToHttp(error as TaskValidationError)).toEqual({
        status: 400,
        body: {
          error: {
            code: 'VALIDATION_ERROR',
            message: 'Datos inválidos',
            details: [{ path: 'title', message: 'El título es obligatorio' }],
          },
        },
      });
      await expectNoTasks();
    } finally {
      await t.close();
    }
  });
});
