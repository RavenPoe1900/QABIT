import { describe, expect, it } from 'vitest';
import {
  ASSIGNEE_MAX,
  ERROR_CODES,
  ID_MAX,
  TASK_STATUSES,
  TITLE_MAX,
  apiErrorSchema,
  createTaskSchema,
  isoUtcMillisSchema,
  issuesToDetails,
  listTasksQuerySchema,
  taskIdParamSchema,
  taskListSchema,
  taskSchema,
  updateTaskStatusSchema,
} from '../src/index';

const validTask = {
  id: 1,
  title: 'Preparar demo',
  assignee: 'Ana',
  status: 'pending',
  createdAt: '2026-11-13T20:40:00.123Z',
  updatedAt: '2026-11-13T20:40:00.123Z',
};

describe('estados', () => {
  it('son exactamente los tres del contrato', () => {
    expect([...TASK_STATUSES]).toEqual(['pending', 'in_progress', 'done']);
  });
});

describe('createTaskSchema', () => {
  it('acepta una tarea válida y recorta los espacios', () => {
    const r = createTaskSchema.safeParse({ title: '  Preparar demo  ', assignee: ' Ana ' });
    expect(r.success).toBe(true);
    if (r.success) expect(r.data).toEqual({ title: 'Preparar demo', assignee: 'Ana' });
  });

  it.each([
    ['título vacío', { title: '', assignee: 'Ana' }, 'title'],
    ['título solo con espacios', { title: '   ', assignee: 'Ana' }, 'title'],
    ['título de 121 caracteres', { title: 'x'.repeat(TITLE_MAX + 1), assignee: 'Ana' }, 'title'],
    ['responsable vacío', { title: 'Tarea', assignee: '' }, 'assignee'],
    ['responsable de 61 caracteres', { title: 'Tarea', assignee: 'x'.repeat(ASSIGNEE_MAX + 1) }, 'assignee'],
    ['título que no es texto', { title: 123, assignee: 'Ana' }, 'title'],
    ['falta el responsable', { title: 'Tarea' }, 'assignee'],
    ['título que empieza por NUL (rompería el CHECK de SQLite)', { title: '\u0000abc', assignee: 'Ana' }, 'title'],
    ['título con un salto de línea', { title: 'a\nb', assignee: 'Ana' }, 'title'],
    ['responsable con un tabulador', { title: 'Tarea', assignee: 'A\tna' }, 'assignee'],
    ['título de 121 emojis (121 puntos de código)', { title: '😀'.repeat(121), assignee: 'Ana' }, 'title'],
  ])('rechaza: %s', (_name, body, path) => {
    const r = createTaskSchema.safeParse(body);
    expect(r.success).toBe(false);
    if (!r.success) expect(issuesToDetails(r.error.issues).map((d) => d.path)).toContain(path);
  });

  it('la longitud se cuenta en PUNTOS DE CÓDIGO: 120 emojis caben (240 unidades UTF-16)', () => {
    expect(createTaskSchema.safeParse({ title: '😀'.repeat(120), assignee: 'Ana' }).success).toBe(true);
  });

  it('acepta justo en el límite', () => {
    const r = createTaskSchema.safeParse({
      title: 'x'.repeat(TITLE_MAX),
      assignee: 'y'.repeat(ASSIGNEE_MAX),
    });
    expect(r.success).toBe(true);
  });

  it.each([
    ['ausente', undefined],
    ['null', null],
    ['un array', []],
    ['un texto', '{"title":"x"}'],
    ['un número', 3],
  ])('un cuerpo %s se rechaza con un mensaje en español', (_name, body) => {
    const r = createTaskSchema.safeParse(body);
    expect(r.success).toBe(false);
    if (!r.success) {
      expect(issuesToDetails(r.error.issues)).toEqual([{ path: '(body)', message: 'Se esperaba un objeto JSON' }]);
    }
    const u = updateTaskStatusSchema.safeParse(body);
    expect(u.success).toBe(false);
    if (!u.success) expect(u.error.issues[0].message).toBe('Se esperaba un objeto JSON');
  });

  it('rechaza cualquier campo extra, incluido status', () => {
    const r = createTaskSchema.safeParse({ title: 'Tarea', assignee: 'Ana', status: 'done' });
    expect(r.success).toBe(false);
    if (!r.success) {
      const details = issuesToDetails(r.error.issues);
      expect(details[0].path).toBe('(body)');
      expect(details[0].message).toContain('status');
    }
  });
});

describe('updateTaskStatusSchema', () => {
  it('acepta cada estado válido', () => {
    for (const status of TASK_STATUSES) {
      expect(updateTaskStatusSchema.safeParse({ status }).success).toBe(true);
    }
  });

  it.each([
    ['estado desconocido', { status: 'archived' }],
    ['sin estado', {}],
    ['campo extra', { status: 'done', title: 'x' }],
  ])('rechaza: %s', (_name, body) => {
    expect(updateTaskStatusSchema.safeParse(body).success).toBe(false);
  });
});

describe('listTasksQuerySchema', () => {
  it('sin status o con status vacío significa «todas»', () => {
    expect(listTasksQuerySchema.parse({})).toEqual({ status: undefined });
    expect(listTasksQuerySchema.parse({ status: '' })).toEqual({ status: undefined });
  });

  it('acepta un estado válido', () => {
    expect(listTasksQuerySchema.parse({ status: 'done' })).toEqual({ status: 'done' });
  });

  it.each([
    ['estado desconocido', { status: 'foo' }],
    ['parámetro repetido', { status: ['done', 'pending'] }],
    ['parámetro desconocido', { other: '1' }],
  ])('rechaza: %s', (_name, query) => {
    expect(listTasksQuerySchema.safeParse(query).success).toBe(false);
  });
});

describe('taskIdParamSchema', () => {
  it.each([
    ['1', 1],
    ['42', 42],
    [String(ID_MAX), ID_MAX],
  ])('acepta %s', (raw, expected) => {
    expect(taskIdParamSchema.parse(raw)).toBe(expected);
  });

  it.each(['0', '01', '-1', '1a', '1.5', ' 1', '', String(ID_MAX + 1), '99999999999999999999'])(
    'rechaza %j',
    (raw) => {
      expect(taskIdParamSchema.safeParse(raw).success).toBe(false);
    },
  );

  it('si falta el id, el mensaje también está en español', () => {
    const r = taskIdParamSchema.safeParse(undefined);
    expect(r.success).toBe(false);
    if (!r.success) expect(r.error.issues[0].message).toBe('Identificador no válido');
  });
});

describe('formato de fecha', () => {
  it('acepta UTC con exactamente 3 decimales', () => {
    expect(isoUtcMillisSchema.safeParse('2026-11-13T20:40:00.123Z').success).toBe(true);
    expect(isoUtcMillisSchema.safeParse(new Date().toISOString()).success).toBe(true);
  });

  it.each([
    '2026-11-13T20:40:00Z',
    '2026-11-13T20:40:00.1Z',
    '2026-11-13T20:40:00.1234Z',
    '2026-11-13T20:40:00.123+01:00',
    '2026-11-13 20:40:00.123',
    'ayer',
  ])('rechaza %s', (value) => {
    expect(isoUtcMillisSchema.safeParse(value).success).toBe(false);
  });
});

describe('respuestas', () => {
  it('taskSchema valida una tarea correcta y tolera campos nuevos', () => {
    expect(taskSchema.safeParse(validTask).success).toBe(true);
    expect(taskSchema.safeParse({ ...validTask, extra: 1 }).success).toBe(true);
  });

  it('taskSchema rechaza estado, fecha o id inválidos', () => {
    expect(taskSchema.safeParse({ ...validTask, status: 'x' }).success).toBe(false);
    expect(taskSchema.safeParse({ ...validTask, createdAt: '2026-11-13' }).success).toBe(false);
    expect(taskSchema.safeParse({ ...validTask, id: 0 }).success).toBe(false);
    expect(taskSchema.safeParse({ ...validTask, id: '1' }).success).toBe(false);
  });

  it('taskListSchema valida un array y rechaza un objeto', () => {
    expect(taskListSchema.safeParse([validTask]).success).toBe(true);
    expect(taskListSchema.safeParse({ tasks: [validTask] }).success).toBe(false);
  });
});

describe('códigos de error', () => {
  it('ERROR_CODES incluye los códigos genéricos que emite el filtro global', () => {
    for (const code of ['BAD_REQUEST', 'METHOD_NOT_ALLOWED', 'HTTP_ERROR', 'CONCURRENT_UPDATE', 'INTERNAL_ERROR']) {
      expect(ERROR_CODES).toContain(code);
    }
  });
});

describe('formato de error', () => {
  it('acepta el formato acordado, con y sin details', () => {
    expect(apiErrorSchema.safeParse({ error: { code: 'TASK_NOT_FOUND', message: 'x' } }).success).toBe(true);
    expect(
      apiErrorSchema.safeParse({
        error: { code: 'VALIDATION_ERROR', message: 'x', details: [{ path: 'title', message: 'y' }] },
      }).success,
    ).toBe(true);
  });

  it('tolera códigos genéricos que no están en la lista', () => {
    expect(apiErrorSchema.safeParse({ error: { code: 'PAYLOAD_TOO_LARGE', message: 'x' } }).success).toBe(true);
  });

  it('rechaza cuerpos que no tienen la forma acordada', () => {
    expect(apiErrorSchema.safeParse({ message: 'x' }).success).toBe(false);
    expect(apiErrorSchema.safeParse({ error: 'x' }).success).toBe(false);
  });
});
