import SwaggerParser from '@apidevtools/swagger-parser';
import {
  ASSIGNEE_MAX,
  ID_MAX,
  TASK_STATUSES,
  TITLE_MAX,
  apiErrorSchema,
  listTasksQuerySchema,
  taskIdParamSchema,
} from '@task-manager/shared';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { z } from 'zod';
import { createTestApp, type TestApp } from './helpers/test-app';

/* eslint-disable @typescript-eslint/no-explicit-any -- el documento OpenAPI es JSON arbitrario */
type Doc = any;

const TASKS = '/api/tasks';
const STATUS = '/api/tasks/{id}/status';

/** Códigos de error que documenta una respuesta, sacados de sus ejemplos. */
function documentedCodes(operation: any, status: number): string[] {
  const examples = operation.responses[String(status)]?.content?.['application/json']?.examples ?? {};
  return Object.values<any>(examples).map((example) => example.value.error.code);
}

describe('documentación OpenAPI (modo desarrollo)', () => {
  let t: TestApp;
  let doc: Doc;

  beforeAll(async () => {
    t = await createTestApp();
    const res = await t.http().get('/api/docs-json');
    expect(res.status).toBe(200);
    doc = res.body;
  });
  afterAll(async () => {
    await t.close();
  });

  it('es un documento OpenAPI válido según un parser independiente', async () => {
    expect(doc.openapi).toMatch(/^3\./);
    // validate() resuelve las referencias sobre el propio objeto: se le pasa una copia.
    await expect(SwaggerParser.validate(structuredClone(doc))).resolves.toBeDefined();
  });

  it('documenta los tres endpoints con todos sus códigos de respuesta', () => {
    expect(Object.keys(doc.paths).sort()).toEqual([TASKS, STATUS].sort());
    const codes = (op: any) => Object.keys(op.responses).sort();
    expect(codes(doc.paths[TASKS].get)).toEqual(['200', '400', '500']);
    expect(codes(doc.paths[TASKS].post)).toEqual(['201', '400', '413', '415', '500']);
    expect(codes(doc.paths[STATUS].patch)).toEqual(['200', '400', '404', '409', '413', '415', '500']);
  });

  it('los esquemas salen de los de shared: límites, campos obligatorios y estricto', () => {
    const create = doc.components.schemas.CreateTaskRequest;
    expect(create.required).toEqual(['title', 'assignee']);
    expect(create.additionalProperties).toBe(false);
    expect(create.properties.title).toMatchObject({ type: 'string', minLength: 1, maxLength: TITLE_MAX });
    expect(create.properties.assignee).toMatchObject({ type: 'string', minLength: 1, maxLength: ASSIGNEE_MAX });

    const update = doc.components.schemas.UpdateTaskStatusRequest;
    expect(update.properties.status.enum).toEqual([...TASK_STATUSES]);
    expect(update.additionalProperties).toBe(false);

    const task = doc.components.schemas.Task;
    expect(task.properties.status.enum).toEqual([...TASK_STATUSES]);
    expect(task.properties.createdAt.format).toBe('date-time');
  });

  it('el formato de fecha documenta UTC con exactamente 3 decimales', () => {
    const pattern = new RegExp(doc.components.schemas.Task.properties.createdAt.pattern);
    expect(pattern.test('2026-11-13T20:40:00.123Z')).toBe(true);
    expect(pattern.test('2026-11-13T20:40:00Z')).toBe(false);
    expect(pattern.test('2026-11-13T20:40:00.1234Z')).toBe(false);
    expect(pattern.test('2026-11-13T20:40:00.123+01:00')).toBe(false);
  });

  it('documenta el filtro (incluido el vacío) y los límites reales del id', () => {
    const query = doc.paths[TASKS].get.parameters.find((p: any) => p.name === 'status');
    expect(query).toMatchObject({ in: 'query', required: false, allowEmptyValue: true });
    expect(query.schema.enum).toEqual(['', ...TASK_STATUSES]);
    expect(doc.paths[TASKS].get.description).toMatch(/vacío/);

    const id = doc.paths[STATUS].patch.parameters.find((p: any) => p.name === 'id');
    expect(id).toMatchObject({ in: 'path', required: true });
    expect(id.schema).toMatchObject({ type: 'integer', minimum: 1, maximum: ID_MAX });
  });

  it('documenta lo que JSON Schema no puede representar (recorte de espacios, estado repetido)', () => {
    expect(doc.components.schemas.CreateTaskRequest.description).toMatch(/recortan/);
    expect(doc.components.schemas.CreateTaskRequest.description).toMatch(/status/);
    expect(doc.components.schemas.CreateTaskRequest.description).toMatch(/caracteres de control/);
    expect(doc.components.schemas.CreateTaskRequest.description).toMatch(/puntos de código/);
    expect(doc.paths[STATUS].patch.description).toMatch(/updatedAt/);
    expect(doc.info.description).toMatch(/ROUTE_NOT_FOUND/);
    expect(doc.info.description).toMatch(/no tiene autenticación/);
  });

  it('todos los ejemplos de error cumplen el formato de error compartido', () => {
    let checked = 0;
    for (const path of Object.values<any>(doc.paths)) {
      for (const operation of Object.values<any>(path)) {
        for (const [status, response] of Object.entries<any>(operation.responses)) {
          if (Number(status) < 400) continue;
          const content = response.content['application/json'];
          expect(content.schema).toEqual({ $ref: '#/components/schemas/ApiError' });
          for (const example of Object.values<any>(content.examples)) {
            expect(apiErrorSchema.safeParse(example.value).success).toBe(true);
            checked++;
          }
        }
      }
    }
    expect(checked).toBeGreaterThanOrEqual(12);
  });

  describe('lo documentado coincide con lo que la API hace de verdad', () => {
    async function seededTaskId() {
      const res = await t.http().post(TASKS).send({ title: 'Doc', assignee: 'Ana' });
      return res.body.id as number;
    }

    it.each([
      ['GET', TASKS, 'get', (h: TestApp) => h.http().get('/api/tasks'), 200],
      ['GET con filtro desconocido', TASKS, 'get', (h: TestApp) => h.http().get('/api/tasks?status=foo'), 400],
      ['POST válido', TASKS, 'post', (h: TestApp) => h.http().post('/api/tasks').send({ title: 'A', assignee: 'B' }), 201],
      ['POST inválido', TASKS, 'post', (h: TestApp) => h.http().post('/api/tasks').send({ title: '', assignee: 'B' }), 400],
      [
        'POST con JSON roto',
        TASKS,
        'post',
        (h: TestApp) => h.http().post('/api/tasks').set('Content-Type', 'application/json').send('{"title":'),
        400,
      ],
      [
        'POST con un juego de caracteres no admitido',
        TASKS,
        'post',
        (h: TestApp) =>
          h.http().post('/api/tasks').set('Content-Type', 'application/json; charset=latin1').send('{"title":"x","assignee":"y"}'),
        415,
      ],
      [
        'POST con un cuerpo que no es un objeto (text/plain)',
        TASKS,
        'post',
        (h: TestApp) => h.http().post('/api/tasks').set('Content-Type', 'text/plain').send('hola'),
        400,
      ],
      [
        'POST demasiado grande',
        TASKS,
        'post',
        (h: TestApp) => h.http().post('/api/tasks').send({ title: 'x'.repeat(200_000), assignee: 'B' }),
        413,
      ],
      ['PATCH con id inválido', STATUS, 'patch', (h: TestApp) => h.http().patch('/api/tasks/abc/status').send({ status: 'done' }), 400],
      ['PATCH tarea inexistente', STATUS, 'patch', (h: TestApp) => h.http().patch('/api/tasks/999/status').send({ status: 'done' }), 404],
    ])('%s -> %i está documentado y su código de error figura en los ejemplos', async (_name, path, method, run, status) => {
      const res = await run(t);
      expect(res.status).toBe(status);

      const operation = doc.paths[path][method];
      expect(Object.keys(operation.responses)).toContain(String(status));
      if (status >= 400) {
        expect(documentedCodes(operation, status)).toContain(res.body.error.code);
      }
    });

    it('PATCH correcto -> 200 está documentado', async () => {
      const id = await seededTaskId();
      const res = await t.http().patch(`/api/tasks/${id}/status`).send({ status: 'done' });
      expect(res.status).toBe(200);
      expect(Object.keys(doc.paths[STATUS].patch.responses)).toContain('200');
    });
  });

  it('sirve la interfaz de Swagger UI en /api/docs', async () => {
    const res = await t.http().get('/api/docs');
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toMatch(/text\/html/);
    expect(res.text.toLowerCase()).toContain('swagger');
  });
});

describe('por qué los esquemas se generan con unrepresentable por defecto («throw»)', () => {
  it('una parte no representable HACE FALLAR la generación en lugar de perder reglas en silencio', () => {
    expect(() =>
      z.toJSONSchema(listTasksQuerySchema, { target: 'openapi-3.0', io: 'output' }),
    ).toThrow(/Transforms cannot be represented/);
  });

  it('lo que sí se pierde en silencio (refine del id) es justo lo que se escribe a mano en los parámetros', () => {
    const generated = z.toJSONSchema(taskIdParamSchema, { target: 'openapi-3.0', io: 'input' }) as any;
    expect(generated.maximum).toBeUndefined(); // el tope ID_MAX no aparece en lo generado…
    expect(ID_MAX).toBeGreaterThan(0); // …por eso tasks.api-docs.ts lo declara con la constante de shared.
  });
});

describe('documentación en producción', () => {
  it('con NODE_ENV=production /api/docs y /api/docs-json no existen, y la API sigue funcionando', async () => {
    vi.stubEnv('NODE_ENV', 'production');
    let t: TestApp | undefined;
    try {
      t = await createTestApp();
      for (const path of ['/api/docs', '/api/docs-json']) {
        const res = await t.http().get(path);
        expect(res.status, path).toBe(404);
        expect(res.body).toEqual({ error: { code: 'ROUTE_NOT_FOUND', message: 'Ruta no encontrada' } });
      }
      const api = await t.http().get('/api/tasks');
      expect(api.status).toBe(200);
    } finally {
      await t?.close();
      vi.unstubAllEnvs();
    }
  });
});
