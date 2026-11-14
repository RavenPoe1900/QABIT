import { ERROR_CODES, apiErrorSchema } from '@task-manager/shared';
import { describe, expect, it } from 'vitest';
import { GENERIC_HTTP_ERROR, HTTP_ERRORS } from '../src/infrastructure/http/api-exception.filter';
import { jsonBodyErrorHandler } from '../src/infrastructure/http/json-body';
import {
  ConcurrentTaskUpdateError,
  TaskNotFoundError,
  TaskValidationError,
} from '../src/modules/tasks/domain/task-errors';
import { taskErrorToHttp } from '../src/modules/tasks/infrastructure/http/task-errors.filter';
import { createTestApp } from './helpers/test-app';

/**
 * `ERROR_CODES` (contrato compartido) debe contener TODOS los códigos que la API puede emitir.
 * Si alguien añade un código nuevo en cualquier punto y olvida el contrato, este test falla.
 */
const known = new Set<string>(ERROR_CODES);

/** Ejecuta el manejador de errores del parser con un error falso y devuelve el `code` que responde. */
function codeFromJsonBodyHandler(type: string): string | undefined {
  let body: unknown;
  const res = {
    status: () => ({
      json: (b: unknown) => {
        body = b;
      },
    }),
  };
  jsonBodyErrorHandler({ type }, {} as never, res as never, (() => undefined) as never);
  return (body as { error?: { code?: string } } | undefined)?.error?.code;
}

describe('códigos de error: el contrato recoge todos los que emite la API', () => {
  it('ERROR_CODES no tiene duplicados', () => {
    expect(new Set(ERROR_CODES).size).toBe(ERROR_CODES.length);
  });

  it('los códigos genéricos del filtro global (4xx de Nest) están en el contrato', () => {
    for (const { code } of [...Object.values(HTTP_ERRORS), GENERIC_HTTP_ERROR]) {
      expect(known.has(code), `falta ${code} en ERROR_CODES`).toBe(true);
    }
  });

  it('los códigos de los errores de dominio de tareas están en el contrato', () => {
    const emitted = [
      taskErrorToHttp(new TaskNotFoundError(1)),
      taskErrorToHttp(new TaskValidationError([{ field: 'title', message: 'x' }])),
      taskErrorToHttp(new ConcurrentTaskUpdateError(1)),
    ];
    for (const { body } of emitted) {
      expect(apiErrorSchema.safeParse(body).success).toBe(true);
      expect(known.has(body.error.code), `falta ${body.error.code} en ERROR_CODES`).toBe(true);
    }
  });

  it.each(['entity.parse.failed', 'entity.too.large', 'encoding.unsupported', 'charset.unsupported'])(
    'el código que emite el parser de JSON ante «%s» está en el contrato',
    (type) => {
      const code = codeFromJsonBodyHandler(type);
      expect(code).toBeDefined();
      expect(known.has(code as string), `falta ${code} en ERROR_CODES`).toBe(true);
    },
  );

  it('los códigos fijos del filtro global y del 404 final están en el contrato', async () => {
    const t = await createTestApp();
    try {
      for (const path of ['/api/nope', '/nope']) {
        const res = await t.http().get(path);
        expect(known.has(res.body.error.code), res.body.error.code).toBe(true);
      }
      const bad = await t.http().post('/api/tasks').send({});
      expect(known.has(bad.body.error.code), bad.body.error.code).toBe(true);
    } finally {
      await t.close();
    }
  });

  it('un método no permitido sobre una ruta existente devuelve un código del contrato', async () => {
    const t = await createTestApp();
    try {
      const res = await t.http().put('/api/tasks').send({});
      expect(known.has(res.body.error.code), res.body.error.code).toBe(true);
    } finally {
      await t.close();
    }
  });
});
